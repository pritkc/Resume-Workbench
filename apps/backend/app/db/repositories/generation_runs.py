"""Generation run repository."""

from __future__ import annotations

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
