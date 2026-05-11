"""Unit tests for compact diff pre-apply validation."""

from __future__ import annotations

from typing import Any

from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import TailoringResumePayload
from app.services.tailoring.validation import DiffValidationResult, validate_compact_diff


_RESUME_DATA: dict[str, Any] = {
    "summary": "Backend engineer.",
    "workExperience": [
        {
            "position": "Engineer",
            "company": "Acme",
            "highlights": ["Built APIs.", "Optimized queries.", "Shipped alerts."],
            "techStack": "Python, FastAPI",
        },
        {
            "position": "Intern",
            "company": "BigCo",
            "highlights": ["Contributed to ETL."],
            "techStack": "Spark",
        },
    ],
    "personalProjects": [
        {
            "name": "Dashboard",
            "highlights": ["Built UI.", "Added auth."],
        },
        {
            "name": "Pipeline",
            "highlights": ["Built ETL."],
        },
        {
            "name": "LogLens",
            "highlights": ["Parsed logs."],
        },
    ],
}


def _cell(value: Any, why: str = "Test rationale.") -> dict[str, Any]:
    return {"value": value, "why": why}


def _make_contract_lite() -> Any:
    payload = TailoringResumePayload.from_resume_data(_RESUME_DATA)
    return build_response_contract(payload, prompt_id="lite")


def _make_contract_full() -> Any:
    payload = TailoringResumePayload.from_resume_data(_RESUME_DATA)
    return build_response_contract(payload, prompt_id="full")


_STRICT_RESUME: dict[str, Any] = {
    "summary": "Backend engineer.",
    "workExperience": [
        {
            "position": "Engineer",
            "company": "Acme",
            "highlights": ["Only bullet."],
            "techStack": "Python",
        },
    ],
    "personalProjects": [
        {"name": "Side", "highlights": ["Project bullet a.", "Project bullet b."]},
    ],
    "skills": {"groups": [{"label": "Lang", "values": ["Go", "Rust"]}]},
}


def _make_strict_contract() -> Any:
    payload = TailoringResumePayload.from_resume_data(_STRICT_RESUME)
    return build_response_contract(payload, prompt_id="full")


def _full_envelope_strict_diff() -> dict[str, Any]:
    return {
        "summary": _cell("Shorter summary for JD.", "Align tone."),
        "experience": {
            "0": {
                "position": _cell(None, "Title already strong."),
                "tech_stacks": _cell(None, "Stack unchanged."),
                "bullets": {"0": _cell(None, "Keep evidence.")},
            },
        },
        "projects": {
            "0": {
                "name": _cell(None, "Name stable."),
                "tech_stacks": _cell(None, "No stack change."),
                "bullets": {
                    "0": _cell(None, "Retain bullet 0."),
                    "1": _cell(None, "Retain bullet 1."),
                },
            },
        },
        "skills": [
            {
                "label": _cell("Lang", "Group label fits."),
                "values": {
                    "0": {"value": None},
                    "1": {"value": None},
                },
            },
        ],
        "bold_keywords": ["Go", "Python"],
    }


# ── Valid diffs (lite — legacy / partial shapes) ──────────────────────────────

def test_valid_diff_with_summary() -> None:
    contract = _make_contract_lite()
    diff = {"summary": "New summary."}
    result = validate_compact_diff(diff, contract)
    assert result.valid is True
    assert result.errors == []


def test_valid_diff_with_experience_bullets() -> None:
    contract = _make_contract_lite()
    diff = {
        "experience": {
            "0": {"bullets": {"0": "Rewrote first bullet.", "1": "Second bullet rewritten."}},
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is True


def test_valid_diff_with_projects() -> None:
    contract = _make_contract_lite()
    diff = {
        "projects": {
            "0": {"bullets": {"0": "New project bullet.", "1": "Second project bullet."}}
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is True


def test_valid_diff_empty() -> None:
    contract = _make_contract_lite()
    result = validate_compact_diff({}, contract)
    assert result.valid is True


# ── Strict full envelope ──────────────────────────────────────────────────────

def test_full_envelope_valid() -> None:
    contract = _make_strict_contract()
    result = validate_compact_diff(_full_envelope_strict_diff(), contract)
    assert result.valid is True
    assert result.errors == []


def test_full_envelope_missing_summary_rejected() -> None:
    contract = _make_strict_contract()
    diff = dict(_full_envelope_strict_diff())
    del diff["summary"]
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("summary missing" in e for e in result.errors)


def test_full_envelope_rejects_unchanged_key() -> None:
    contract = _make_strict_contract()
    diff = _full_envelope_strict_diff()
    diff["experience"]["0"]["bullets"]["0"] = {"value": "x", "why": "y", "unchanged": True}  # type: ignore[dict-item]
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("unchanged" in e for e in result.errors)


def test_full_envelope_rejects_empty_skill_label_why() -> None:
    contract = _make_strict_contract()
    diff = _full_envelope_strict_diff()
    diff["skills"][0]["label"] = {"value": "Lang", "why": "   "}  # type: ignore[dict-item]
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("label.why" in e for e in result.errors)


def test_full_envelope_requires_why() -> None:
    contract = _make_strict_contract()
    diff = _full_envelope_strict_diff()
    diff["summary"] = {"value": "No why here"}  # type: ignore[assignment]
    result = validate_compact_diff(diff, contract)
    assert result.valid is False


# ── Unknown top-level keys ────────────────────────────────────────────────────

def test_unknown_top_level_key() -> None:
    contract = _make_contract_lite()
    diff = {"workExperience": []}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("workExperience" in e for e in result.errors)


def test_multiple_unknown_top_level_keys() -> None:
    contract = _make_contract_lite()
    diff = {"personalInfo": {}, "education": []}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert len(result.errors) >= 1


# ── Experience key validation ─────────────────────────────────────────────────

def test_non_integer_experience_key() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"abc": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("abc" in e for e in result.errors)


def test_out_of_range_experience_key() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"99": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("99" in e for e in result.errors)


def test_locked_field_in_experience() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"0": {"company": "New Corp", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("company" in e for e in result.errors)


def test_multiple_locked_fields_in_experience() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"0": {"id": 1, "location": "SF", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False


def test_bullet_index_beyond_contract_count_rejected() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"0": {"bullets": {"99": "extra bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("out of range" in e for e in result.errors)


def test_non_integer_bullet_key() -> None:
    contract = _make_contract_lite()
    diff = {"experience": {"0": {"bullets": {"zero": "bullet text"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("zero" in e for e in result.errors)


# ── Projects key validation ─────────────────────────────────────────────────

def test_out_of_range_project_key() -> None:
    contract = _make_contract_lite()
    diff = {"projects": {"99": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False


def test_locked_field_in_project() -> None:
    contract = _make_contract_lite()
    diff = {"projects": {"0": {"github": "https://github.com/x", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("github" in e for e in result.errors)


def test_project_bullet_beyond_count_rejected() -> None:
    contract = _make_contract_lite()
    diff = {"projects": {"0": {"bullets": {"5": "extra"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("out of range" in e for e in result.errors)


def test_experience_rewriting_more_than_two_bullets_rejected() -> None:
    contract = _make_contract_lite()
    diff = {
        "experience": {
            "0": {
                "bullets": {
                    "0": "First rewrite",
                    "1": "Second rewrite",
                    "2": "Third rewrite",
                }
            }
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("too many bullets" in e.lower() for e in result.errors)


def test_short_experience_rewriting_more_than_budget_rejected() -> None:
    contract = _make_contract_lite()
    diff = {
        "experience": {
            "1": {
                "bullets": {
                    "0": "First intern rewrite",
                    "1": "Second intern rewrite",
                }
            }
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("direct jd bullet budget" in e.lower() for e in result.errors)


def test_more_than_two_changed_projects_rejected() -> None:
    contract = _make_contract_lite()
    diff = {
        "projects": {
            "0": {"bullets": {"0": "A"}},
            "1": {"bullets": {"0": "B"}},
            "2": {"bullets": {"0": "C"}},
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("at most two projects" in e.lower() for e in result.errors)


def test_generic_jd_project_suffix_rejected() -> None:
    contract = _make_contract_lite()
    diff = {"projects": {"0": {"name": "Dashboard (Workflow Visualization)"}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("project name" in e.lower() for e in result.errors)


def test_generic_jd_project_parenthetical_rejected() -> None:
    contract = _make_contract_lite()
    diff = {"projects": {"0": {"name": "Dashboard (Data Analysis)"}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("project name" in e.lower() for e in result.errors)


def test_full_mode_legacy_string_summary_rejected() -> None:
    contract = _make_contract_full()
    diff = _full_envelope_strict_diff()
    diff["summary"] = "Plain string summary"  # type: ignore[assignment]
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("legacy string" in e.lower() for e in result.errors)


# ── DiffValidationResult ──────────────────────────────────────────────────────

def test_diff_validation_result_has_warnings_field() -> None:
    result = DiffValidationResult(valid=True)
    assert result.warnings == []


def test_diff_validation_result_valid_false_with_errors() -> None:
    result = DiffValidationResult(valid=False, errors=["err1"])
    assert result.valid is False
    assert "err1" in result.errors

