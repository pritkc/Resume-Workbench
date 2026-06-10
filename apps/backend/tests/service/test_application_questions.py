"""Service tests for application custom-question answer generation."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.schemas import ApplicationQuestionAnswer, ApplicationQuestionInput
from app.services.application_questions import (
    dedupe_question_inputs,
    generate_application_question_answers,
    merge_answers_for_partial_regeneration,
    normalize_generated_answers,
    parse_application_question_section_response,
)
from app.services.message_profiles import CandidatePromptProfile
from app.services.tailoring.section_format import section_jd_wrapper


def test_dedupe_question_inputs_preserves_first_question_id() -> None:
    deduped, warnings = dedupe_question_inputs(
        [
            ApplicationQuestionInput(question_id="q_0", question="Why this role?"),
            ApplicationQuestionInput(question_id="q_1", question=" Why this role? "),
            ApplicationQuestionInput(question_id="q_2", question="Tell us about leadership."),
        ]
    )

    assert [item.question_id for item in deduped] == ["q_0", "q_2"]
    assert len(warnings) == 1
    assert "q_1" in warnings[0]


def test_normalize_generated_answers_uses_fallback_when_model_skips_questions() -> None:
    questions = [
        ApplicationQuestionInput(question_id="q_0", question="Why this role?"),
        ApplicationQuestionInput(question_id="q_1", question="Describe a challenge."),
    ]
    normalized, warnings = normalize_generated_answers(
        {
            "answers": [
                {
                    "question_id": "q_0",
                    "answer": "I align strongly with this role and team priorities.",
                    "confidence": "high",
                    "warnings": [],
                }
            ]
        },
        questions,
    )

    assert warnings == []
    assert len(normalized) == 2
    assert normalized[0].question_id == "q_0"
    assert normalized[0].confidence == "high"
    assert normalized[1].question_id == "q_1"
    assert "fallback answer" in normalized[1].warnings[0].lower()


def test_parse_application_question_section_response_to_legacy_payload() -> None:
    parsed = parse_application_question_section_response(
        """
=== ANSWER q_0 ===
CONFIDENCE: high
ANSWER:
My backend API experience maps directly to this platform role.

=== ANSWER q_1 ===
CONFIDENCE: low
WARNING: Candidate should confirm work authorization before submitting.
ANSWER:
I am authorized to work in the United States.
""",
    )

    assert parsed == {
        "answers": [
            {
                "question_id": "q_0",
                "answer": "My backend API experience maps directly to this platform role.",
                "confidence": "high",
                "warnings": [],
            },
            {
                "question_id": "q_1",
                "answer": "I am authorized to work in the United States.",
                "confidence": "low",
                "warnings": ["Candidate should confirm work authorization before submitting."],
            },
        ]
    }


def test_merge_answers_for_partial_regeneration_keeps_existing_non_target_answers() -> None:
    ordered_questions = [
        ApplicationQuestionInput(question_id="q_0", question="Why this role?"),
        ApplicationQuestionInput(question_id="q_1", question="Describe leadership."),
    ]
    generated = [
        ApplicationQuestionAnswer(
            question_id="q_1",
            question="Describe leadership.",
            answer="I led backend delivery across two teams.",
            confidence="high",
            warnings=[],
            is_user_edited=False,
        )
    ]
    existing = [
        ApplicationQuestionAnswer(
            question_id="q_0",
            question="Why this role?",
            answer="My background in APIs aligns with the role scope.",
            confidence="medium",
            warnings=[],
            is_user_edited=True,
        )
    ]

    merged, warnings = merge_answers_for_partial_regeneration(
        ordered_questions=ordered_questions,
        generated_answers=generated,
        existing_answers=existing,
    )

    assert warnings == []
    assert [item.question_id for item in merged] == ["q_0", "q_1"]
    assert merged[0].is_user_edited is True
    assert merged[1].answer == "I led backend delivery across two teams."


def test_resume_profile_is_compact_vs_full_resume_json(sample_resume: dict) -> None:
    import json

    from app.schemas import normalize_resume_data

    profile = CandidatePromptProfile.from_resume_data(sample_resume).model_dump(exclude_none=True)
    full = json.dumps(normalize_resume_data(sample_resume), separators=(",", ":"))

    assert "experience" in profile
    assert "workExperience" in full or "experience" in profile
    assert len(full) >= len(json.dumps(profile, separators=(",", ":")))


def test_answer_questions_prompt_documents_input_source_distinction() -> None:
    from app.prompts.answer_questions import USER_TEMPLATE, build_messages

    assert "INPUT SOURCES" in USER_TEMPLATE
    assert "CANDIDATE PROFILE" in USER_TEMPLATE
    assert "TAILORED RESUME" in USER_TEMPLATE

    _system, user = build_messages(
        job_target="{}",
        job_description="Backend role.",
        resume_profile='{"summary":"Stable profile"}',
        tailored_resume='{"summary":"Full resume body"}',
        questions='[{"question_id":"q_0","question":"Why this role?"}]',
    )

    assert "Stable profile" in user
    assert "Full resume body" in user


@pytest.mark.asyncio
async def test_generate_application_question_answers_calls_single_text_completion(
    sample_resume: dict,
    sample_job_description: str,
) -> None:
    mock_complete = AsyncMock(
        return_value="""
=== ANSWER q_0 ===
CONFIDENCE: high
ANSWER:
My experience aligns with the role requirements.

=== ANSWER q_1 ===
CONFIDENCE: medium
ANSWER:
I enjoy collaborating across teams to deliver outcomes.
""".strip()
    )

    with patch(
        "app.services.application_questions.complete",
        new=mock_complete,
    ):
        answers, warnings = await generate_application_question_answers(
            resume_data=sample_resume,
            job_description=sample_job_description,
            questions=[
                ApplicationQuestionInput(question_id="q_0", question="Why this role?"),
                ApplicationQuestionInput(question_id="q_1", question="How do you collaborate?"),
            ],
            job_metadata={"role": "Senior Backend Engineer", "company": "TechCorp"},
            job_keywords={"responsibility_themes": ["API design", "Mentorship"]},
        )

    assert warnings == []
    assert [item.question_id for item in answers] == ["q_0", "q_1"]
    assert mock_complete.await_count == 1
    kwargs = mock_complete.await_args.kwargs
    assert kwargs["operation"] == "application_questions_generate"
    assert "question_count" in kwargs["metadata"]


@pytest.mark.asyncio
async def test_generate_application_question_answers_uses_section_jd_keywords(
    sample_resume: dict,
    sample_job_description: str,
) -> None:
    mock_complete = AsyncMock(return_value="=== ANSWER q_0 ===\nCONFIDENCE: medium\nANSWER:\n")
    wrapper = section_jd_wrapper(
        """
=== JD METADATA ===
ROLE: Platform Engineer
COMPANY: Acme
LOCATION:

=== JD INTEL ===
HOOKS: build APIs, scale systems
MUST-MATCH: Python, Kubernetes
"""
    )

    with patch(
        "app.services.application_questions.complete",
        new=mock_complete,
    ):
        await generate_application_question_answers(
            resume_data=sample_resume,
            job_description=sample_job_description,
            questions=[
                ApplicationQuestionInput(question_id="q_0", question="Why this role?"),
            ],
            job_keywords=wrapper,
        )

    prompt = mock_complete.await_args.kwargs["prompt"]
    assert "Platform Engineer" in prompt
    assert "Python" in prompt
    assert "Kubernetes" in prompt
