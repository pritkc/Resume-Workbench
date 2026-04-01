"""Job repository."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Job


def create_job(session: Session, **values: Any) -> Job:
    record = Job(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_job(session: Session, job_id: str) -> Job | None:
    return session.scalar(select(Job).where(Job.job_id == job_id))


def update_job(session: Session, job_id: str, updates: dict[str, Any]) -> Job | None:
    record = get_job(session, job_id)
    if record is None:
        return None
    for key, value in updates.items():
        setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def list_jobs(session: Session) -> list[Job]:
    return list(session.scalars(select(Job).order_by(Job.created_at.desc())))
