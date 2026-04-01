"""Resume repository."""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Resume


def create_resume(session: Session, **values: Any) -> Resume:
    record = Resume(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_resume(session: Session, resume_id: str) -> Resume | None:
    return session.scalar(select(Resume).where(Resume.resume_id == resume_id))


def get_master_resume(session: Session) -> Resume | None:
    return session.scalar(select(Resume).where(Resume.is_master.is_(True)).limit(1))


def list_resumes(session: Session) -> list[Resume]:
    return list(session.scalars(select(Resume).order_by(Resume.created_at.desc())))


def update_resume(session: Session, resume_id: str, updates: dict[str, Any]) -> Resume | None:
    record = get_resume(session, resume_id)
    if record is None:
        return None
    for key, value in updates.items():
        setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def delete_resume(session: Session, resume_id: str) -> bool:
    record = get_resume(session, resume_id)
    if record is None:
        return False
    session.delete(record)
    session.commit()
    return True


def clear_master_flag(session: Session) -> None:
    for record in session.scalars(select(Resume).where(Resume.is_master.is_(True))):
        record.is_master = False
    session.commit()


def set_master_resume(session: Session, resume_id: str) -> Resume | None:
    record = get_resume(session, resume_id)
    if record is None:
        return None
    for current in session.scalars(select(Resume).where(Resume.is_master.is_(True))):
        current.is_master = False
    record.is_master = True
    session.commit()
    session.refresh(record)
    return record
