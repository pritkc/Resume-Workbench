"""Application pack repository."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import ApplicationPack


def create_application_pack(session: Session, **values: Any) -> ApplicationPack:
    record = ApplicationPack(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def get_application_pack(session: Session, pack_id: str) -> ApplicationPack | None:
    return session.scalar(select(ApplicationPack).where(ApplicationPack.pack_id == pack_id))


def update_application_pack(
    session: Session, pack_id: str, updates: dict[str, Any]
) -> ApplicationPack | None:
    record = get_application_pack(session, pack_id)
    if record is None:
        return None
    for key, value in updates.items():
        setattr(record, key, value)
    session.commit()
    session.refresh(record)
    return record


def list_application_packs(
    session: Session,
    *,
    company: str | None = None,
    role: str | None = None,
    created_from: datetime | None = None,
    created_to: datetime | None = None,
) -> list[ApplicationPack]:
    statement = select(ApplicationPack)

    if company:
        statement = statement.where(
            func.lower(ApplicationPack.company).contains(company.strip().lower())
        )
    if role:
        statement = statement.where(func.lower(ApplicationPack.role).contains(role.strip().lower()))
    if created_from:
        statement = statement.where(ApplicationPack.created_at >= created_from)
    if created_to:
        statement = statement.where(ApplicationPack.created_at <= created_to)

    statement = statement.order_by(ApplicationPack.created_at.desc())
    return list(session.scalars(statement))
