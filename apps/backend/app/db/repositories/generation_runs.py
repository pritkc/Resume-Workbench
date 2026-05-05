"""Generation run repository."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import GenerationRun


def create_generation_run(session: Session, **values: Any) -> GenerationRun:
    record = GenerationRun(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_generation_run(session: Session, generation_run_id: str) -> GenerationRun | None:
    return session.scalar(
        select(GenerationRun).where(GenerationRun.generation_run_id == generation_run_id)
    )


def update_generation_run(
    session: Session, generation_run_id: str, updates: dict[str, Any]
) -> GenerationRun | None:
    record = get_generation_run(session, generation_run_id)
    if record is None:
        return None
    for key, value in updates.items():
        setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def list_generation_runs(
    session: Session,
    *,
    run_kind: str | Sequence[str] | None = None,
    status: str | None = None,
    application_pack_id: str | None = None,
    source_resume_id: str | None = None,
    tailored_resume_id: str | None = None,
    job_id: str | None = None,
    limit: int = 50,
) -> list[GenerationRun]:
    statement = select(GenerationRun)

    if run_kind:
        if isinstance(run_kind, str):
            statement = statement.where(GenerationRun.run_kind == run_kind)
        else:
            statement = statement.where(GenerationRun.run_kind.in_(list(run_kind)))
    if status:
        statement = statement.where(GenerationRun.status == status)
    if application_pack_id:
        statement = statement.where(GenerationRun.application_pack_id == application_pack_id)
    if source_resume_id:
        statement = statement.where(GenerationRun.source_resume_id == source_resume_id)
    if tailored_resume_id:
        statement = statement.where(GenerationRun.tailored_resume_id == tailored_resume_id)
    if job_id:
        statement = statement.where(GenerationRun.job_id == job_id)

    bounded_limit = max(1, min(limit, 500))
    statement = statement.order_by(GenerationRun.created_at.desc()).limit(bounded_limit)
    return list(session.scalars(statement))


def get_latest_generation_run(
    session: Session,
    *,
    run_kind: str | Sequence[str] | None = None,
    status: str | None = None,
    application_pack_id: str | None = None,
    source_resume_id: str | None = None,
    tailored_resume_id: str | None = None,
    job_id: str | None = None,
) -> GenerationRun | None:
    runs = list_generation_runs(
        session,
        run_kind=run_kind,
        status=status,
        application_pack_id=application_pack_id,
        source_resume_id=source_resume_id,
        tailored_resume_id=tailored_resume_id,
        job_id=job_id,
        limit=1,
    )
    return runs[0] if runs else None


def get_latest_improvement_for_tailored_resume(
    session: Session, tailored_resume_id: str
) -> GenerationRun | None:
    statement = (
        select(GenerationRun)
        .where(
            GenerationRun.tailored_resume_id == tailored_resume_id,
            GenerationRun.run_kind == "legacy_improvement",
        )
        .order_by(GenerationRun.created_at.desc())
        .limit(1)
    )
    return session.scalar(statement)


def count_generation_runs(session: Session) -> int:
    return len(list(session.scalars(select(GenerationRun.id))))


def map_llm_trace_ids_for_tailored_resume_ids(
    session: Session, resume_ids: list[str]
) -> dict[str, str]:
    """For each resume_id, resolve ``llm_trace_id`` from the newest relevant generation run.

    Runs are scanned newest-first; first assignment per ``tailored_resume_id`` wins.

    Application-pack **confirm** runs often carry a confirm-only trace while heavy LLM work is
    attributed to the linked **preview** run (``preview_generation_run_id``). When that field is
    set, this resolver prefers ``llm_trace_id`` from the preview run's payload; otherwise it uses
    the current run's payload ``llm_trace_id``.
    """
    if not resume_ids:
        return {}
    statement = (
        select(GenerationRun)
        .where(GenerationRun.tailored_resume_id.in_(resume_ids))
        .order_by(GenerationRun.created_at.desc())
    )
    records = list(session.scalars(statement))

    preview_run_ids: set[str] = set()
    for record in records:
        payload = record.request_payload
        if not isinstance(payload, dict):
            continue
        pgid = payload.get("preview_generation_run_id")
        if isinstance(pgid, str) and (s := pgid.strip()):
            preview_run_ids.add(s)

    trace_by_preview_run_id: dict[str, str] = {}
    if preview_run_ids:
        preview_rows = list(
            session.scalars(
                select(GenerationRun).where(GenerationRun.generation_run_id.in_(preview_run_ids))
            )
        )
        for prev in preview_rows:
            pl = prev.request_payload
            if isinstance(pl, dict):
                t = pl.get("llm_trace_id")
                if isinstance(t, str) and t.strip():
                    trace_by_preview_run_id[prev.generation_run_id] = t.strip()

    out: dict[str, str] = {}
    for record in records:
        rid = record.tailored_resume_id
        if not rid or rid in out:
            continue
        payload = record.request_payload
        if not isinstance(payload, dict):
            continue
        tid: str | None = None
        pgid = payload.get("preview_generation_run_id")
        if isinstance(pgid, str) and (s := pgid.strip()):
            tid = trace_by_preview_run_id.get(s)
        if not tid:
            raw = payload.get("llm_trace_id")
            if isinstance(raw, str) and raw.strip():
                tid = raw.strip()
        if tid:
            out[rid] = tid
    return out
