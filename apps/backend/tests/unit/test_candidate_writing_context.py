"""Unit tests for TailoredWritingContext — JD-specific cover letter framing."""

from __future__ import annotations

import json
from typing import Any

import pytest

from app.services.message_profiles import TailoredWritingContext


_TAILORED_RESUME: dict[str, Any] = {
    "summary": "Full-stack engineer specializing in FastAPI and React, with production experience shipping customer-facing features.",
    "workExperience": [
        {
            "position": "Software Engineer",
            "company": "Acme Corp",
            "date": "2022 - present",
            "techStack": "Python, FastAPI, React, PostgreSQL",
            "highlights": [
                "Built REST APIs serving 50k daily users.",
                "Reduced API latency by 35% via query optimization.",
                "Shipped React dashboard for internal analytics.",
            ],
        },
        {
            "position": "Backend Intern",
            "company": "StartupX",
            "date": "2021 - 2022",
            "techStack": "Django, Python",
            "highlights": [
                "Contributed to payment integration pipeline.",
                "Wrote unit tests covering 80% of new features.",
            ],
        },
        {
            "position": "Junior Developer",
            "company": "Old Corp",
            "date": "2020 - 2021",
            "techStack": "PHP, MySQL",
            "highlights": ["Maintained legacy billing system."],
        },
    ],
    "personalProjects": [
        {
            "name": "ML Dashboard",
            "role": "Solo developer",
            "date": "2023",
            "techStack": "Python, scikit-learn, Streamlit",
            "highlights": [
                "Built interactive ML model visualization.",
                "Deployed on Heroku with CI/CD via GitHub Actions.",
                "Added user auth with JWT.",
            ],
        },
        {
            "name": "CLI Tool",
            "role": "Author",
            "date": "2022",
            "techStack": "Python",
            "highlights": ["Open-source CLI for resume formatting."],
        },
    ],
    "education": [
        {
            "degree": "B.S.",
            "area": "Computer Science",
            "institution": "State University",
            "date": "2022",
        }
    ],
    "skills": {
        "groups": [
            {
                "label": "Backend",
                "values": ["Python", "FastAPI", "PostgreSQL", "Docker"],
            },
            {
                "label": "Frontend",
                "values": ["React", "TypeScript"],
            },
        ]
    },
}


# ── from_tailored_resume ──────────────────────────────────────────────────────

def test_from_tailored_resume_returns_instance() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert isinstance(ctx, TailoredWritingContext)


def test_from_tailored_resume_summary_truncated_at_200_chars() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert len(ctx.tailored_summary) <= 200
    assert ctx.tailored_summary  # not empty


def test_from_tailored_resume_summary_contains_content() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert "engineer" in ctx.tailored_summary.lower()


def test_from_tailored_resume_includes_up_to_3_experience() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert len(ctx.top_experience) == 3
    assert ctx.top_experience[0].company == "Acme Corp"
    assert ctx.top_experience[1].company == "StartupX"


def test_from_tailored_resume_experience_has_up_to_2_highlights() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    for exp in ctx.top_experience:
        assert len(exp.highlights) <= 2


def test_from_tailored_resume_includes_up_to_2_projects() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert len(ctx.top_projects) == 2
    assert ctx.top_projects[0].name == "ML Dashboard"


def test_from_tailored_resume_projects_have_highlights() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert ctx.top_projects[0].highlights  # ML Dashboard has bullets


def test_from_tailored_resume_education_present() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert len(ctx.education) == 1
    assert "Computer Science" in ctx.education[0]
    assert "State University" in ctx.education[0]


def test_from_tailored_resume_selected_skills_present() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert ctx.selected_skills["Backend"] == ["Python", "FastAPI", "PostgreSQL", "Docker"]
    assert ctx.selected_skills["Frontend"] == ["React", "TypeScript"]


def test_from_tailored_resume_selected_skills_are_bounded() -> None:
    resume = dict(_TAILORED_RESUME)
    resume["skills"] = {
        "groups": [
            {"label": f"Group {i}", "values": [f"Skill {i}-{j}" for j in range(12)]}
            for i in range(6)
        ]
    }

    ctx = TailoredWritingContext.from_tailored_resume(resume)

    assert len(ctx.selected_skills) == 4
    assert all(len(values) <= 8 for values in ctx.selected_skills.values())


def test_from_tailored_resume_style_note_set() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    assert ctx.style_note  # not empty


# ── Fallback behavior ─────────────────────────────────────────────────────────

def test_from_tailored_resume_none_input_returns_empty() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(None)
    assert isinstance(ctx, TailoredWritingContext)
    assert ctx.tailored_summary == ""
    assert ctx.top_experience == []
    assert ctx.top_projects == []


def test_from_tailored_resume_empty_dict_returns_empty() -> None:
    ctx = TailoredWritingContext.from_tailored_resume({})
    assert isinstance(ctx, TailoredWritingContext)
    assert ctx.top_experience == []


def test_from_tailored_resume_falls_back_to_original() -> None:
    """When tailored_resume_data is None, falls back to original_resume_data."""
    ctx = TailoredWritingContext.from_tailored_resume(
        None,
        original_resume_data=_TAILORED_RESUME,
    )
    assert ctx.top_experience  # populated from fallback
    assert ctx.top_experience[0].company == "Acme Corp"


def test_from_tailored_resume_invalid_data_returns_empty() -> None:
    """Malformed data should return empty context without raising."""
    ctx = TailoredWritingContext.from_tailored_resume({"workExperience": "not_a_list"})
    assert isinstance(ctx, TailoredWritingContext)


# ── to_prompt_json ────────────────────────────────────────────────────────────

def test_to_prompt_json_is_valid_json() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    result = ctx.to_prompt_json()
    parsed = json.loads(result)
    assert isinstance(parsed, dict)


def test_to_prompt_json_contains_experience() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    result = ctx.to_prompt_json()
    parsed = json.loads(result)
    assert "top_experience" in parsed
    assert len(parsed["top_experience"]) == 3


def test_to_prompt_json_contains_selected_skills() -> None:
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    result = ctx.to_prompt_json()
    parsed = json.loads(result)
    assert parsed["selected_skills"]["Backend"][:2] == ["Python", "FastAPI"]


def test_to_prompt_json_no_none_values() -> None:
    """exclude_none=True should remove None fields."""
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    result = ctx.to_prompt_json()
    assert "null" not in result


def test_to_prompt_json_compact_separators() -> None:
    """Should use compact JSON separators — no space after structural colons."""
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    result = ctx.to_prompt_json()
    # Compact JSON has no spaces after structural colon (key: value would appear as key:value)
    assert '": ' not in result  # no space after key-value colon


def test_to_prompt_json_empty_context() -> None:
    ctx = TailoredWritingContext()
    result = ctx.to_prompt_json()
    parsed = json.loads(result)
    assert isinstance(parsed, dict)


# ── Cover letter user template placeholder ────────────────────────────────────

def test_cover_letter_user_template_has_tailored_context_placeholder() -> None:
    """Cover letter user template must have $tailored_resume_context."""
    from app.prompts import get_prompt
    mod = get_prompt("cover_letter")
    template = str(getattr(mod, "USER_TEMPLATE", getattr(mod, "DATA_TEMPLATE", "")))
    assert "$tailored_resume_context" in template


def test_cover_letter_build_messages_backward_compat() -> None:
    """Existing 3-param form still works without tailored_resume_context."""
    from app.prompts import get_prompt
    mod = get_prompt("cover_letter")
    system, user = mod.build_messages(
        job_target='{"role": "SWE"}',
        job_description="We need a backend engineer.",
        resume_profile='{"summary": "Engineer"}',
    )
    assert system
    assert user
    assert "$tailored_resume_context" not in user


def test_cover_letter_build_messages_with_tailored_context() -> None:
    """New tailored_resume_context kwarg is substituted."""
    from app.prompts import get_prompt
    mod = get_prompt("cover_letter")
    ctx = TailoredWritingContext.from_tailored_resume(_TAILORED_RESUME)
    _, user = mod.build_messages(
        job_target='{"role": "SWE"}',
        job_description="We need a backend engineer.",
        resume_profile='{"summary": "Engineer"}',
        tailored_resume_context=ctx.to_prompt_json(),
    )
    assert "Acme Corp" in user or "top_experience" in user
