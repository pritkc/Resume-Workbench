"""Artifact repository."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Artifact, Resume


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


def replace_draft_preview_artifacts(
    session: Session,
    *,
    resume_id: str,
    session_id: str,
    sequence: int,
    artifacts: list[dict[str, Any]],
) -> tuple[list[Artifact], list[str]]:
    resume = session.scalar(select(Resume).where(Resume.resume_id == resume_id).with_for_update())
    if resume is None and not resume_id.startswith("draft:"):
        return [], []
    existing = list(
        session.scalars(select(Artifact).where(Artifact.resume_id == resume_id))
    )
    preview_rows = [
        record
        for record in existing
        if isinstance(record.artifact_metadata, dict)
        and record.artifact_metadata.get("draft_preview") is True
    ]
    same_session = [
        record
        for record in preview_rows
        if record.artifact_metadata.get("preview_session_id") == session_id
    ]
    newest_sequence = max(
        (int(record.artifact_metadata.get("preview_sequence", -1)) for record in same_session),
        default=-1,
    )
    if newest_sequence >= sequence:
        return same_session, []

    old_paths = [record.storage_path for record in preview_rows]
    for record in preview_rows:
        session.delete(record)

    records = [
        Artifact(
            artifact_id=str(uuid4()),
            resume_id=resume_id,
            kind=item["kind"],
            mime_type=item["mime_type"],
            file_name=item["file_name"],
            storage_path=item["storage_path"],
            artifact_metadata={
                **(item.get("metadata") or {}),
                "draft_preview": True,
                "preview_session_id": session_id,
                "preview_sequence": sequence,
            },
        )
        for item in artifacts
    ]
    session.add_all(records)
    session.commit()
    for record in records:
        session.refresh(record)
    return records, old_paths
