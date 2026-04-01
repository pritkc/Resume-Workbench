"""Artifact repository."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Artifact


def create_artifact(session: Session, **values: Any) -> Artifact:
    record = Artifact(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_artifact(session: Session, artifact_id: str) -> Artifact | None:
    return session.scalar(select(Artifact).where(Artifact.artifact_id == artifact_id))


def list_artifacts_for_resume(session: Session, resume_id: str) -> list[Artifact]:
    statement = select(Artifact).where(Artifact.resume_id == resume_id).order_by(Artifact.created_at)
    return list(session.scalars(statement))
