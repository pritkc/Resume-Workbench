from unittest.mock import AsyncMock, patch

import pytest

from app.services.tailoring.llm_calls import run_primary_tailoring
from app.services.tailoring.models import TailoringResponseContract
from app.services.tailoring.prompting import TailoringPromptContext
from app.services.tailoring.section_format import (
    extract_streamed_resume_sections,
    extract_jd_intel_section,
    jd_keywords_from_section_blob,
    parse_jd_metadata,
    parse_resume_section_output,
    section_jd_wrapper,
    to_compact_diff,
)


def _contract() -> TailoringResponseContract:
    return TailoringResponseContract(
        prompt_mode="full",
        experience_entries=["Acme"],
        experience_positions=["Senior Engineer"],
        experience_tech_stacks=["Python, Kafka"],
        experience_bullet_counts=[2],
        direct_jd_bullet_budget=[1],
        preserve_story_min=[1],
        project_entries=["Matcher"],
        project_bullet_counts=[1],
        project_tech_stacks=["FastAPI"],
        skill_group_value_counts=[3],
    )


def test_parse_complete_section_output_to_full_compact_diff() -> None:
    parsed = parse_resume_section_output(
        """
=== SUMMARY ===
Built reliable data APIs for platform teams.
WHY: Maps strongest evidence to JD.

=== EXPERIENCE 0 === (Acme)
POSITION: [RETAIN]
STACK: Python, Kafka, Spark
B0: Improved event pipeline reliability. WHY: Strongest platform story.
B1: [RETAIN]
B1-WHY: Keep original mentorship evidence.

=== PROJECT 0 === (Matcher)
NAME: [RETAIN]
STACK: FastAPI, Postgres
B0: Reworked matching service for lower latency.
B0-WHY: Closer to JD backend scope.

=== SKILLS ===
G0: Technical Skills | Python, [RETAIN], Kafka
G0-WHY: Keeps breadth while adding Kafka.

=== BOLD KEYWORDS ===
Python, Kafka, FastAPI
""",
        _contract(),
    )
    diff = to_compact_diff(parsed, _contract())

    assert diff["summary"]["value"] == "Built reliable data APIs for platform teams."
    assert diff["experience"]["0"]["position"]["value"] is None
    assert diff["experience"]["0"]["tech_stacks"]["value"] == "Python, Kafka, Spark"
    assert diff["experience"]["0"]["bullets"]["0"]["why"] == "Strongest platform story."
    assert diff["experience"]["0"]["bullets"]["1"]["value"] is None
    assert diff["projects"]["0"]["bullets"]["0"]["value"] == "Reworked matching service for lower latency."
    assert diff["skills"][0]["values"] == [
        {"value": "Python"},
        {"value": None},
        {"value": "Kafka"},
    ]
    assert diff["bold_keywords"] == ["Python", "Kafka", "FastAPI"]


def test_sparse_sections_are_padded_as_retain() -> None:
    parsed = parse_resume_section_output(
        """
=== SUMMARY ===
[RETAIN]
WHY: Keep original summary.

=== BOLD KEYWORDS ===
Python
""",
        _contract(),
    )
    diff = to_compact_diff(parsed, _contract())

    assert diff["summary"]["value"] is None
    assert diff["experience"]["0"]["bullets"]["0"]["value"] is None
    assert diff["projects"]["0"]["name"]["value"] is None
    assert diff["skills"][0]["values"] == [{"value": None}, {"value": None}, {"value": None}]


def test_parser_handles_multiline_duplicates_and_skill_count_warnings() -> None:
    parsed = parse_resume_section_output(
        """
=== EXPERIENCE 0 ===
B0: First version.
B0-WHY: Old why.
=== EXPERIENCE 0 ===
B0: Second version
continues here.
B0-WHY: New why.
=== SKILLS ===
G0: Skills | Python, Kafka, Spark, Go
=== BOLD KEYWORDS ===
Python
""",
        _contract(),
    )
    diff = to_compact_diff(parsed, _contract())

    assert diff["experience"]["0"]["bullets"]["0"]["value"] == "Second version continues here."
    assert diff["experience"]["0"]["bullets"]["0"]["why"] == "New why."
    assert diff["skills"][0]["values"] == [
        {"value": "Python"},
        {"value": "Kafka"},
        {"value": "Spark"},
    ]
    assert any("truncated" in warning for warning in parsed.warnings)


def test_parser_accepts_header_and_retain_drift_variants() -> None:
    parsed = parse_resume_section_output(
        """
Here is the output:
=== experience 0 === Acme Corp
TITLE:
Tech Stack: -
B 0: —
Bullet 1: Added reliability coverage.
⬦ Budget: max 1 of 2 bullets may be JD-direct.
BOLD KEYWORDS:
- Python
- Kafka
""",
        _contract(),
    )
    diff = to_compact_diff(parsed, _contract())

    assert diff["experience"]["0"]["position"]["value"] is None
    assert diff["experience"]["0"]["tech_stacks"]["value"] is None
    assert diff["experience"]["0"]["bullets"]["0"]["value"] is None
    assert diff["experience"]["0"]["bullets"]["1"]["value"] == "Added reliability coverage."
    assert diff["bold_keywords"] == ["Python", "Kafka"]
    assert any("blank value" in warning for warning in parsed.warnings)


def test_parser_accepts_missing_closing_header_and_out_of_range_warning() -> None:
    parsed = parse_resume_section_output(
        """
=== PROJECT 7
B0: Should be skipped.
=== PROJECT 0
B0: Valid project rewrite.
""",
        _contract(),
    )
    diff = to_compact_diff(parsed, _contract())

    assert diff["projects"]["0"]["bullets"]["0"]["value"] == "Valid project rewrite."
    assert any("projects[7] out of range" in warning for warning in parsed.warnings)


def test_jd_section_helpers_parse_wrapper() -> None:
    raw = """
=== JD METADATA ===
ROLE: Senior Data Engineer
COMPANY: Acme
LOCATION: San Francisco, CA

=== JD INTEL ===
HOOKS: build APIs, scale pipelines
MUST-MATCH: Python, Kafka
AVOID: Microsoft Office
LEVEL: Senior IC ownership.
"""
    wrapper = section_jd_wrapper(raw)

    assert parse_jd_metadata(raw) == {
        "role": "Senior Data Engineer",
        "company": "Acme",
        "location": "San Francisco, CA",
    }
    assert extract_jd_intel_section(raw).startswith("HOOKS:")
    assert jd_keywords_from_section_blob(wrapper) == ["build APIs", "scale pipelines", "Python", "Kafka"]


def test_extract_streamed_resume_sections_returns_partial_display_sections() -> None:
    raw = """=== SUMMARY ===
Tailored summary.
=== EXPERIENCE 0 ===
POSITION: Senior Engineer
B0: Built APIs
=== SKILLS ===
G0: Python, FastAPI
"""

    sections = extract_streamed_resume_sections(raw)

    assert [section["section_id"] for section in sections] == [
        "summary",
        "experience_0",
        "skills",
    ]
    assert sections[1]["index"] == 0
    assert "Built APIs" in sections[1]["content"]


@pytest.mark.asyncio
async def test_primary_tailoring_retries_empty_section_response() -> None:
    context = TailoringPromptContext(
        prompt_id="full",
        response_contract_json="{}",
        output_template="=== SUMMARY ===",
        extract_jd_intel_output_json="{}",
        jd_intel_text="",
        jd_intel_blob={},
        original_resume_json="{}",
        retry_hint="retry",
        prompt_hash="abc123",
        system_prompt="system",
        user_prompt="user",
        used_structured_resume_input=True,
    )
    mock_complete = AsyncMock(
        side_effect=[
            "No useful section output.",
            """
=== SUMMARY ===
Built reliable services.
WHY: Good fit.
=== BOLD KEYWORDS ===
Python, Kafka
""",
        ]
    )

    with patch("app.services.tailoring.llm_calls.complete_json", new=mock_complete):
        result = await run_primary_tailoring(
            context,
            response_contract=_contract(),
            job_description="JD",
            max_tokens=100,
        )

    assert mock_complete.await_count == 2
    assert mock_complete.await_args_list[1].kwargs["max_tokens"] == 120
    assert result.compact_diff["summary"]["value"] == "Built reliable services."
    assert result.compact_diff["bold_keywords"] == ["Python", "Kafka"]
