"""Generation and normalization helpers for application custom-question answers."""

from __future__ import annotations

import copy
import json
from typing import Any

from app.config import get_step_llm_config
from app.llm import complete_json
from app.prompts import PROMPT_VERSIONS
from app.prompts.answer_questions import build_messages as build_application_questions_messages
from app.schemas import (
    ApplicationQuestionAnswer,
    ApplicationQuestionInput,
    ResumeData,
    normalize_resume_data,
)
from app.services.cover_letter import extract_job_target_metadata, sanitize_job_location
from app.services.message_profiles import CandidatePromptProfile
from app.services.prompt_utils import sanitize_user_input, trim_job_description_for_prompt

MAX_APPLICATION_QUESTION_BATCH = 15
MAX_APPLICATION_QUESTION_TOTAL_CHARS = 5000
MAX_APPLICATION_QUESTION_ANSWER_CHARS = 2500


def dedupe_question_inputs(
    questions: list[ApplicationQuestionInput],
) -> tuple[list[ApplicationQuestionInput], list[str]]:
    """Deduplicate question text while preserving first occurrence and question_id."""

    deduped: list[ApplicationQuestionInput] = []
    seen_questions: set[str] = set()
    warnings: list[str] = []

    for question in questions:
        normalized = " ".join(question.question.split()).casefold()
        if normalized in seen_questions:
            warnings.append(
                f"Duplicate question dropped for question_id={question.question_id}."
            )
            continue
        seen_questions.add(normalized)
        deduped.append(question)

    return deduped, warnings


def validate_question_batch_constraints(questions: list[ApplicationQuestionInput]) -> None:
    if not questions:
        raise ValueError("At least one question is required.")
    if len(questions) > MAX_APPLICATION_QUESTION_BATCH:
        raise ValueError(
            f"At most {MAX_APPLICATION_QUESTION_BATCH} questions are allowed per request."
        )
    total_chars = sum(len(question.question) for question in questions)
    if total_chars > MAX_APPLICATION_QUESTION_TOTAL_CHARS:
        raise ValueError(
            f"Combined question length exceeds {MAX_APPLICATION_QUESTION_TOTAL_CHARS} characters."
        )


def _truncate_text(value: str | None, limit: int) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip(" ,;:-") + "..."


def _resume_context_payload(resume_data: dict[str, Any]) -> dict[str, Any]:
    normalized = ResumeData.model_validate(
        normalize_resume_data(copy.deepcopy(resume_data))
    )

    experience = []
    for entry in normalized.workExperience[:4]:
        bullets = [item for item in (entry.highlights or entry.description) if item][:3]
        experience.append(
            {
                "title": _truncate_text(entry.position or entry.title, 80),
                "company": _truncate_text(entry.company, 80),
                "location": _truncate_text(entry.location, 60),
                "date": _truncate_text(entry.date or entry.years, 40),
                "bullets": [_truncate_text(bullet, 180) for bullet in bullets if bullet],
            }
        )

    projects = []
    for entry in normalized.personalProjects[:3]:
        bullets = [item for item in (entry.highlights or entry.description) if item][:2]
        projects.append(
            {
                "name": _truncate_text(entry.name, 80),
                "role": _truncate_text(entry.role or entry.summary, 80),
                "date": _truncate_text(entry.date or entry.years, 40),
                "bullets": [_truncate_text(bullet, 180) for bullet in bullets if bullet],
            }
        )

    skills: list[dict[str, Any]] = []
    for group in normalized.skills.groups[:5]:
        values = [_truncate_text(value, 40) for value in group.values[:10] if value]
        if not values:
            continue
        skills.append(
            {
                "label": _truncate_text(group.label, 50),
                "values": values,
            }
        )

    education = []
    for entry in normalized.education[:2]:
        education.append(
            {
                "institution": _truncate_text(entry.institution, 80),
                "degree": _truncate_text(entry.degree, 80),
                "area": _truncate_text(entry.area, 80),
                "date": _truncate_text(entry.date or entry.years, 40),
            }
        )

    return {
        "headline": _truncate_text(
            normalized.personalInfo.headline or normalized.personalInfo.title, 80
        ),
        "summary": _truncate_text(normalized.summary, 240),
        "location": _truncate_text(normalized.personalInfo.location, 60),
        "experience": experience,
        "projects": projects,
        "education": education,
        "skills": skills,
    }


def _sanitize_warning_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    warnings: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        cleaned = " ".join(item.split())
        if cleaned:
            warnings.append(cleaned[:240])
    return warnings


def _normalize_confidence(value: Any) -> str:
    if isinstance(value, str) and value.lower() in {"high", "medium", "low"}:
        return value.lower()
    return "medium"


def _fallback_answer(question: str) -> str:
    return (
        "Based on my resume and the role requirements shared, my experience aligns well with "
        f"\"{_truncate_text(question, 120)}\" and I can provide more specific detail as needed."
    )


def normalize_generated_answers(
    raw_result: dict[str, Any],
    questions: list[ApplicationQuestionInput],
) -> tuple[list[ApplicationQuestionAnswer], list[str]]:
    warnings: list[str] = []
    answer_rows = raw_result.get("answers")
    if not isinstance(answer_rows, list):
        warnings.append("Model response did not contain a valid answers array.")
        answer_rows = []

    mapped: dict[str, dict[str, Any]] = {}
    for item in answer_rows:
        if not isinstance(item, dict):
            continue
        question_id = item.get("question_id")
        if not isinstance(question_id, str) or not question_id.strip():
            continue
        mapped[question_id.strip()] = item

    normalized_answers: list[ApplicationQuestionAnswer] = []
    for question in questions:
        source_item = mapped.get(question.question_id, {})
        raw_answer = source_item.get("answer")
        answer_text = (
            " ".join(raw_answer.split()) if isinstance(raw_answer, str) else ""
        )
        item_warnings = _sanitize_warning_list(source_item.get("warnings"))

        if not answer_text:
            answer_text = _fallback_answer(question.question)
            item_warnings.append("Generated answer was empty; fallback answer was used.")

        if len(answer_text) > MAX_APPLICATION_QUESTION_ANSWER_CHARS:
            answer_text = answer_text[:MAX_APPLICATION_QUESTION_ANSWER_CHARS].rstrip()
            item_warnings.append("Answer was truncated to fit length limits.")

        normalized_answers.append(
            ApplicationQuestionAnswer(
                question_id=question.question_id,
                question=question.question,
                answer=answer_text,
                confidence=_normalize_confidence(source_item.get("confidence")),
                warnings=item_warnings,
                is_user_edited=False,
            )
        )

    if mapped:
        requested_ids = {item.question_id for item in questions}
        unexpected_ids = [item_id for item_id in mapped if item_id not in requested_ids]
        if unexpected_ids:
            warnings.append(
                f"Model returned unexpected question_ids: {', '.join(sorted(unexpected_ids))}."
            )

    return normalized_answers, warnings


def read_answers_from_generation_payload(payload: Any) -> list[ApplicationQuestionAnswer]:
    if not isinstance(payload, dict):
        return []
    answer_rows = payload.get("answers")
    if not isinstance(answer_rows, list):
        return []

    answers: list[ApplicationQuestionAnswer] = []
    for row in answer_rows:
        if not isinstance(row, dict):
            continue
        try:
            answers.append(ApplicationQuestionAnswer.model_validate(row))
        except Exception:
            continue
    return answers


def merge_answers_for_partial_regeneration(
    *,
    ordered_questions: list[ApplicationQuestionInput],
    generated_answers: list[ApplicationQuestionAnswer],
    existing_answers: list[ApplicationQuestionAnswer],
) -> tuple[list[ApplicationQuestionAnswer], list[str]]:
    warnings: list[str] = []
    generated_by_id = {item.question_id: item for item in generated_answers}
    existing_by_id = {item.question_id: item for item in existing_answers}

    merged: list[ApplicationQuestionAnswer] = []
    for question in ordered_questions:
        if question.question_id in generated_by_id:
            merged.append(generated_by_id[question.question_id])
            continue
        previous = existing_by_id.get(question.question_id)
        if previous is not None:
            merged.append(
                ApplicationQuestionAnswer(
                    question_id=previous.question_id,
                    question=question.question,
                    answer=previous.answer,
                    confidence=previous.confidence,
                    warnings=previous.warnings,
                    is_user_edited=previous.is_user_edited,
                )
            )
            continue

        warnings.append(
            f"Missing previous answer for question_id={question.question_id}; fallback answer used."
        )
        merged.append(
            ApplicationQuestionAnswer(
                question_id=question.question_id,
                question=question.question,
                answer=_fallback_answer(question.question),
                confidence="low",
                warnings=["Fallback answer used because no previous answer was available."],
                is_user_edited=False,
            )
        )

    return merged, warnings


def _build_job_target_payload(
    *,
    job_description: str,
    job_metadata: dict[str, Any] | None,
    job_keywords: dict[str, Any] | None,
) -> dict[str, Any]:
    extracted = extract_job_target_metadata(
        job_description,
        title=(job_metadata or {}).get("title"),
        job_keywords=job_keywords,
    )
    role = (
        str((job_metadata or {}).get("role")).strip()
        if isinstance((job_metadata or {}).get("role"), str)
        else extracted.get("role")
    )
    company = (
        str((job_metadata or {}).get("company")).strip()
        if isinstance((job_metadata or {}).get("company"), str)
        else extracted.get("company")
    )
    location_input = (
        (job_metadata or {}).get("location")
        if isinstance((job_metadata or {}).get("location"), str)
        else extracted.get("location")
    )
    location = sanitize_job_location(location_input)

    highlights: list[str] = []
    if isinstance(job_keywords, dict):
        for key in ("responsibility_themes", "must_have", "keywords", "ats_keywords"):
            value = job_keywords.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, str):
                        cleaned = " ".join(item.split())
                        if cleaned and cleaned not in highlights:
                            highlights.append(cleaned)
                    if len(highlights) >= 10:
                        break
            if len(highlights) >= 10:
                break

    return {
        "role": role or "",
        "company": company or "",
        "location": location or "",
        "highlights": highlights,
    }


async def generate_application_question_answers(
    *,
    resume_data: dict[str, Any],
    job_description: str,
    questions: list[ApplicationQuestionInput],
    job_metadata: dict[str, Any] | None = None,
    job_keywords: dict[str, Any] | None = None,
) -> tuple[list[ApplicationQuestionAnswer], list[str]]:
    """Generate answers for application questions in one LLM call."""

    validate_question_batch_constraints(questions)

    profile = CandidatePromptProfile.from_resume_data(resume_data)
    tailored_resume_context = _resume_context_payload(resume_data)
    sanitized_job_description = trim_job_description_for_prompt(
        sanitize_user_input(job_description),
        max_chars=3200,
    )
    job_target_payload = _build_job_target_payload(
        job_description=sanitized_job_description,
        job_metadata=job_metadata,
        job_keywords=job_keywords,
    )
    question_payload = [
        {"question_id": item.question_id, "question": item.question} for item in questions
    ]

    system_prompt, prompt = build_application_questions_messages(
        job_target=json.dumps(job_target_payload, separators=(",", ":"), ensure_ascii=True),
        job_description=sanitized_job_description,
        resume_profile=profile.to_prompt_json(),
        tailored_resume_context=json.dumps(
            tailored_resume_context, separators=(",", ":"), ensure_ascii=True
        ),
        questions=json.dumps(question_payload, separators=(",", ":"), ensure_ascii=True),
    )

    raw_result = await complete_json(
        prompt=prompt,
        system_prompt=system_prompt,
        config=get_step_llm_config("answer_questions"),
        max_tokens=4096,
        retries=2,
        operation="application_questions_generate",
        metadata={
            "question_count": len(questions),
            "job_description_chars": len(job_description),
            "prompt_job_description_chars": len(sanitized_job_description),
            "prompt_version": PROMPT_VERSIONS.get("application_questions_generate", "unknown"),
        },
        retry_hint=(
            "Return complete JSON with one answer object for every question_id. "
            "Do not omit any question_id."
        ),
    )

    return normalize_generated_answers(raw_result, questions)

