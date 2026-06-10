"""Serialize the current master resume for prompt catalog preview (same shape as tailoring user input)."""

from __future__ import annotations

import json
from typing import Any

from app.database import Database
from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import TailoringResumePayload

_PREVIEW_CAP_BYTES = 256 * 1024


def _cap_utf8_preview(text: str) -> tuple[str, bool]:
    raw = text.encode("utf-8")
    if len(raw) <= _PREVIEW_CAP_BYTES:
        return text, False
    truncated = raw[:_PREVIEW_CAP_BYTES].decode("utf-8", errors="ignore")
    return truncated, True


def resolve_master_resume_row(db: Database) -> dict[str, Any] | None:
    active = db.get_active_resume()
    if active:
        return active
    for row in db.list_resumes():
        if not row.get("parent_id"):
            return row
    rows = db.list_resumes()
    return rows[0] if rows else None


def serialize_original_resume_for_tailoring(resume: dict[str, Any]) -> str:
    raw = resume.get("processed_data")
    if isinstance(raw, dict) and raw:
        payload = TailoringResumePayload.from_resume_data(raw)
        if payload is not None:
            return json.dumps(payload.to_llm_prompt_dict(), separators=(",", ":"), ensure_ascii=True)
    om = resume.get("original_markdown")
    if isinstance(om, str) and om.strip():
        return om
    content = resume.get("content")
    return str(content) if content is not None else ""


def capped_master_resume_preview_text(db: Database) -> tuple[str, bool]:
    resume = resolve_master_resume_row(db)
    if not resume:
        return "", False
    text = serialize_original_resume_for_tailoring(resume)
    return _cap_utf8_preview(text)


def response_contract_catalog_previews(
    db: Database,
) -> tuple[tuple[str, bool], tuple[str, bool]]:
    """JSON strings injected as ``$response_contract`` for full vs lite (same serialization as runtime).

    Uses the same master resume row and structured payload resolution as
    ``capped_master_resume_preview_text``. Each string is UTF-8 size-capped
    independently (256 KiB), matching the master resume preview behavior.
    """

    resume = resolve_master_resume_row(db)
    if not resume:
        return ("", False), ("", False)

    processed = resume.get("processed_data")
    payload: TailoringResumePayload | None = None
    if isinstance(processed, dict) and processed:
        payload = TailoringResumePayload.from_resume_data(processed)

    out: list[tuple[str, bool]] = []
    for mode in ("full", "lite"):
        contract = build_response_contract(payload, prompt_id=mode)
        text = json.dumps(
            contract.to_prompt_dict(),
            separators=(",", ":"),
            ensure_ascii=True,
        )
        out.append(_cap_utf8_preview(text))
    return out[0], out[1]
