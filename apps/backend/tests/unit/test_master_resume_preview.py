"""Tests for prompt-catalog master resume serialization."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from app.services.tailoring.master_resume_preview import (
    capped_master_resume_preview_text,
    resolve_master_resume_row,
    response_contract_catalog_previews,
    serialize_original_resume_for_tailoring,
)


def test_resolve_prefers_active_resume() -> None:
    db = MagicMock()
    db.get_active_resume.return_value = {"resume_id": "active", "parent_id": None}
    db.list_resumes.return_value = []
    row = resolve_master_resume_row(db)
    assert row is not None
    assert row["resume_id"] == "active"
    db.list_resumes.assert_not_called()


def test_resolve_first_without_parent_when_no_active() -> None:
    db = MagicMock()
    db.get_active_resume.return_value = None
    db.list_resumes.return_value = [
        {"resume_id": "tailored", "parent_id": "master"},
        {"resume_id": "master", "parent_id": None},
    ]
    row = resolve_master_resume_row(db)
    assert row is not None
    assert row["resume_id"] == "master"


def test_resolve_fallback_to_first_row_when_all_have_parent() -> None:
    db = MagicMock()
    db.get_active_resume.return_value = None
    only = [{"resume_id": "only", "parent_id": "x"}]
    db.list_resumes.return_value = only
    row = resolve_master_resume_row(db)
    assert row is not None
    assert row["resume_id"] == "only"


def test_resolve_none_when_empty() -> None:
    db = MagicMock()
    db.get_active_resume.return_value = None
    db.list_resumes.return_value = []
    assert resolve_master_resume_row(db) is None


def test_serialize_prefers_compact_processed_data(sample_resume: dict) -> None:
    resume = {"processed_data": sample_resume, "content": "ignored when processed_data present"}
    out = serialize_original_resume_for_tailoring(resume)
    assert "scalable Python APIs" in out


def test_serialize_falls_back_to_original_markdown() -> None:
    resume = {"processed_data": {}, "original_markdown": "# hi", "content": "c"}
    assert serialize_original_resume_for_tailoring(resume) == "# hi"


def test_response_contract_previews_empty_when_no_resume() -> None:
    db = MagicMock()
    db.get_active_resume.return_value = None
    db.list_resumes.return_value = []
    (full_t, full_trunc), (lite_t, lite_trunc) = response_contract_catalog_previews(db)
    assert full_t == "" and lite_t == ""
    assert full_trunc is False and lite_trunc is False


def test_response_contract_previews_full_and_lite_modes(sample_resume: dict) -> None:
    db = MagicMock()
    db.get_active_resume.return_value = {"processed_data": sample_resume}
    (full_t, full_trunc), (lite_t, lite_trunc) = response_contract_catalog_previews(db)
    assert full_trunc is False and lite_trunc is False
    assert '"mode":"full"' in full_t
    assert '"mode":"lite"' in lite_t
    assert "output_keys" in full_t


def test_capped_preview_truncates_large_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    db = MagicMock()
    huge = "x" * (300 * 1024)
    monkeypatch.setattr(
        "app.services.tailoring.master_resume_preview.resolve_master_resume_row",
        lambda _db: {"processed_data": {}, "content": huge},
    )
    text, truncated = capped_master_resume_preview_text(db)
    assert truncated is True
    assert len(text.encode("utf-8")) <= 256 * 1024
