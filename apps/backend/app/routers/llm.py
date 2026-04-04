"""LLM observability endpoints."""

from __future__ import annotations

from uuid import uuid4

from fastapi import APIRouter, Query

from app.database import db
from app.schemas import LLMCallListResponse, LLMCallSummary, LLMCallSummaryResponse

router = APIRouter(prefix="/llm", tags=["LLM"])


@router.get("/calls", response_model=LLMCallListResponse)
async def list_llm_calls(
    trace_id: str | None = Query(None),
    call_group_id: str | None = Query(None),
    request_scope: str | None = Query(None),
    operation: str | None = Query(None),
    success: bool | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
) -> LLMCallListResponse:
    return LLMCallListResponse(
        request_id=str(uuid4()),
        data=db.list_llm_calls(
            trace_id=trace_id,
            call_group_id=call_group_id,
            request_scope=request_scope,
            operation=operation,
            success=success,
            limit=limit,
        ),
    )


@router.get("/calls/summary", response_model=LLMCallSummaryResponse)
async def summarize_llm_calls(
    trace_id: str | None = Query(None),
    request_scope: str | None = Query(None),
) -> LLMCallSummaryResponse:
    summary = db.summarize_llm_calls(trace_id=trace_id, request_scope=request_scope)
    return LLMCallSummaryResponse(
        request_id=str(uuid4()),
        data=LLMCallSummary.model_validate(summary),
    )
