"""Application pack endpoints."""

from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Query

from app.database import db

from app.routers.resumes import (
    improve_resume_confirm_endpoint,
    improve_resume_preview_endpoint,
)
from app.schemas import (
    ApplicationPackListResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
)

router = APIRouter(prefix="/application-packs", tags=["Application Packs"])


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {value}") from error


@router.get("", response_model=ApplicationPackListResponse)
async def list_application_packs(
    company: str | None = Query(None),
    role: str | None = Query(None),
    created_from: str | None = Query(None),
    created_to: str | None = Query(None),
) -> ApplicationPackListResponse:
    return ApplicationPackListResponse(
        request_id=str(uuid4()),
        data=db.list_application_packs(
            company=company,
            role=role,
            created_from=_parse_datetime(created_from),
            created_to=_parse_datetime(created_to),
        ),
    )


@router.post("/preview", response_model=ImproveResumeResponse)
async def preview_application_pack(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    return await improve_resume_preview_endpoint(request)


@router.post("/confirm", response_model=ImproveResumeResponse)
async def confirm_application_pack(
    request: ImproveResumeConfirmRequest,
) -> ImproveResumeResponse:
    return await improve_resume_confirm_endpoint(request)
