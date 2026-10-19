"""Resume repository."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.db.models import Resume, utcnow


def create_resume(session: Session, **values: Any) -> Resume:
    record = Resume(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_resume(session: Session, resume_id: str) -> Resume | None:
    return session.scalar(select(Resume).where(Resume.resume_id == resume_id))


def get_active_resume(session: Session) -> Resume | None:
    return session.scalar(select(Resume).where(Resume.is_active.is_(True)).limit(1))


def count_resumes(session: Session) -> int:
    value = session.scalar(select(func.count()).select_from(Resume))
    return int(value or 0)


def list_resumes(session: Session) -> list[Resume]:
    stmt = select(Resume).order_by(
        Resume.is_pinned.desc(),
        Resume.pinned_at.desc().nulls_last(),
        Resume.created_at.desc(),
    )
    return list(session.scalars(stmt))


def update_resume(session: Session, resume_id: str, updates: dict[str, Any]) -> Resume | None:
    record = get_resume(session, resume_id)
    if record is None:
        return None
    for key, value in updates.items():
        setattr(record, key, value)
    record.draft_revision += 1
    session.commit()
    session.refresh(record)
    return record


def update_resume_if_revision(
    session: Session,
    resume_id: str,
    expected_revision: int,
    updates: dict[str, Any],
) -> Resume | None:
    values = {
        **updates,
        "draft_revision": expected_revision + 1,
        "updated_at": utcnow(),
    }
    result = session.execute(
        update(Resume)
        .where(Resume.resume_id == resume_id, Resume.draft_revision == expected_revision)
        .values(**values)
    )
    if result.rowcount != 1:
        session.rollback()
        return None
    session.commit()
    return get_resume(session, resume_id)


def delete_resume(session: Session, resume_id: str) -> bool:
    record = get_resume(session, resume_id)
    if record is None:
        return False
    session.delete(record)
    session.commit()
    return True


def clear_active_flag(session: Session) -> None:
    for record in session.scalars(select(Resume).where(Resume.is_active.is_(True))):
        record.is_active = False
    session.commit()


def set_active_resume(session: Session, resume_id: str) -> Resume | None:
    record = get_resume(session, resume_id)
    if record is None:
        return None
    for current in session.scalars(select(Resume).where(Resume.is_active.is_(True))):
        current.is_active = False
    record.is_active = True
    session.commit()
    session.refresh(record)
    return record


def set_resume_pinned(session: Session, resume_id: str, pinned: bool) -> Resume | None:
    record = get_resume(session, resume_id)
    if record is None:
        return None
    record.is_pinned = pinned
    record.pinned_at = datetime.now(timezone.utc) if pinned else None
    session.commit()
    session.refresh(record)
    return record
