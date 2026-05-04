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
            "highlights": ["Built APIs.", "Optimized queries."],
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
        }
    ],
}


def _make_contract() -> Any:
    payload = TailoringResumePayload.from_resume_data(_RESUME_DATA)
    return build_response_contract(payload, prompt_id="full")


# ── Valid diffs ───────────────────────────────────────────────────────────────

def test_valid_diff_with_summary() -> None:
    contract = _make_contract()
    diff = {"summary": "New summary."}
    result = validate_compact_diff(diff, contract)
    assert result.valid is True
    assert result.errors == []


def test_valid_diff_with_experience_bullets() -> None:
    contract = _make_contract()
    diff = {
        "experience": {
            "0": {"bullets": {"0": "Rewrote first bullet.", "1": "Second bullet rewritten."}},
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is True


def test_valid_diff_with_projects() -> None:
    contract = _make_contract()
    diff = {
        "projects": {
            "0": {"bullets": {"0": "New project bullet.", "1": "Second project bullet."}}
        }
    }
    result = validate_compact_diff(diff, contract)
    assert result.valid is True


def test_valid_diff_empty() -> None:
    contract = _make_contract()
    result = validate_compact_diff({}, contract)
    assert result.valid is True


# ── Unknown top-level keys ────────────────────────────────────────────────────

def test_unknown_top_level_key() -> None:
    contract = _make_contract()
    diff = {"workExperience": []}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("workExperience" in e for e in result.errors)


def test_multiple_unknown_top_level_keys() -> None:
    contract = _make_contract()
    diff = {"personalInfo": {}, "education": []}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert len(result.errors) >= 1


# ── Experience key validation ─────────────────────────────────────────────────

def test_non_integer_experience_key() -> None:
    contract = _make_contract()
    diff = {"experience": {"abc": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("abc" in e for e in result.errors)


def test_out_of_range_experience_key() -> None:
    contract = _make_contract()
    diff = {"experience": {"99": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("99" in e for e in result.errors)


def test_locked_field_in_experience() -> None:
    contract = _make_contract()
    diff = {"experience": {"0": {"company": "New Corp", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("company" in e for e in result.errors)


def test_multiple_locked_fields_in_experience() -> None:
    contract = _make_contract()
    diff = {"experience": {"0": {"id": 1, "location": "SF", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False


def test_bullet_index_beyond_contract_count_rejected() -> None:
    contract = _make_contract()
    diff = {"experience": {"0": {"bullets": {"99": "extra bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("out of range" in e for e in result.errors)


def test_non_integer_bullet_key() -> None:
    contract = _make_contract()
    diff = {"experience": {"0": {"bullets": {"zero": "bullet text"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("zero" in e for e in result.errors)


# ── Projects key validation ───────────────────────────────────────────────────

def test_out_of_range_project_key() -> None:
    contract = _make_contract()
    diff = {"projects": {"99": {"bullets": {"0": "bullet"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False


def test_locked_field_in_project() -> None:
    contract = _make_contract()
    diff = {"projects": {"0": {"github": "https://github.com/x", "bullets": {"0": "ok"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("github" in e for e in result.errors)


def test_project_bullet_beyond_count_rejected() -> None:
    contract = _make_contract()
    diff = {"projects": {"0": {"bullets": {"5": "extra"}}}}
    result = validate_compact_diff(diff, contract)
    assert result.valid is False
    assert any("out of range" in e for e in result.errors)


# ── DiffValidationResult ──────────────────────────────────────────────────────

def test_diff_validation_result_has_warnings_field() -> None:
    result = DiffValidationResult(valid=True)
    assert result.warnings == []


def test_diff_validation_result_valid_false_with_errors() -> None:
    result = DiffValidationResult(valid=False, errors=["err1"])
    assert result.valid is False
    assert "err1" in result.errors
