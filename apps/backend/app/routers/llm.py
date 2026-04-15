"""LLM observability endpoints."""

from __future__ import annotations

from collections import defaultdict
from uuid import uuid4

from fastapi import APIRouter, Query

from app.database import db
from app.schemas import (
    GenerationRunProcessTiming,
    GenerationRunTimingDetailListResponse,
    GenerationRunTimingDetailRecord,
    GenerationRunTimingListResponse,
    GenerationRunTimingRecord,
    LLMCallListResponse,
    LLMCallSummary,
    LLMCallSummaryResponse,
)

router = APIRouter(prefix="/llm", tags=["LLM"])


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    return None


def _as_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def _extract_run_timing_summary(run: dict[str, object]) -> tuple[
    int | None,
    int,
    list[GenerationRunProcessTiming],
    dict[str, object] | None,
]:
    result_payload = run.get("result_payload")
    pipeline_timing = (
        result_payload.get("pipeline_timing")
        if isinstance(result_payload, dict)
        else None
    )
    llm_summary = result_payload.get("llm_summary") if isinstance(result_payload, dict) else None
    entries = pipeline_timing.get("entries") if isinstance(pipeline_timing, dict) else None

    total_events = 0
    process_totals: dict[tuple[str, str | None], int] = defaultdict(int)
    if isinstance(entries, list):
        total_events = len(entries)
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            host_event = str(entry.get("host_event") or "").strip() or "unknown"
            raw_sub_event = entry.get("sub_event")
            sub_event = (
                str(raw_sub_event).strip()
                if isinstance(raw_sub_event, str) and str(raw_sub_event).strip()
                else None
            )
            duration_ms = _as_int(entry.get("duration_ms")) or 0
            process_totals[(host_event, sub_event)] += duration_ms

    process_timings = sorted(
        [
            GenerationRunProcessTiming(
                process_key=f"{host} / {sub}" if sub else host,
                host_event=host,
                sub_event=sub,
                duration_ms=duration_ms,
            )
            for (host, sub), duration_ms in process_totals.items()
        ],
        key=lambda row: row.duration_ms,
        reverse=True,
    )

    total_duration_ms = (
        _as_int(pipeline_timing.get("total_duration_ms"))
        if isinstance(pipeline_timing, dict)
        else None
    )
    if total_duration_ms is None and process_timings:
        total_duration_ms = sum(row.duration_ms for row in process_timings)

    return total_duration_ms, total_events, process_timings, llm_summary if isinstance(llm_summary, dict) else None


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


@router.get("/runs/timing", response_model=GenerationRunTimingListResponse)
async def list_generation_run_timing(
    run_kind: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(100, ge=1, le=1000),
) -> GenerationRunTimingListResponse:
    trimmed_run_kind = run_kind.strip() if isinstance(run_kind, str) and run_kind.strip() else None
    trimmed_status = status.strip() if isinstance(status, str) and status.strip() else None

    runs = db.list_generation_runs(
        run_kind=trimmed_run_kind,
        status=trimmed_status,
        limit=limit,
    )

    rows: list[GenerationRunTimingRecord] = []
    for run in runs:
        total_duration_ms, total_events, _process_timings, llm_summary = _extract_run_timing_summary(run)

        rows.append(
            GenerationRunTimingRecord(
                generation_run_id=run["generation_run_id"],
                run_kind=run["run_kind"],
                status=run["status"],
                prompt_id=run.get("prompt_id"),
                application_pack_id=run.get("application_pack_id"),
                original_resume_id=run.get("original_resume_id"),
                tailored_resume_id=run.get("tailored_resume_id"),
                job_id=run.get("job_id"),
                created_at=run.get("created_at"),
                completed_at=run.get("completed_at"),
                total_duration_ms=total_duration_ms,
                total_events=total_events,
                llm_total_calls=(
                    _as_int(llm_summary.get("total_calls")) if isinstance(llm_summary, dict) else None
                ),
                llm_latency_total_ms=(
                    _as_int(llm_summary.get("latency_total_ms"))
                    if isinstance(llm_summary, dict)
                    else None
                ),
                llm_total_tokens=(
                    _as_int(llm_summary.get("total_tokens")) if isinstance(llm_summary, dict) else None
                ),
                llm_estimated_cost_usd=(
                    _as_float(llm_summary.get("estimated_cost_usd"))
                    if isinstance(llm_summary, dict)
                    else None
                ),
            )
        )

    return GenerationRunTimingListResponse(
        request_id=str(uuid4()),
        data=rows,
    )


@router.get("/runs/timing-detailed", response_model=GenerationRunTimingDetailListResponse)
async def list_generation_run_timing_detailed(
    run_kind: str | None = Query(None),
    status: str | None = Query(None),
    limit: int = Query(80, ge=1, le=1000),
) -> GenerationRunTimingDetailListResponse:
    trimmed_run_kind = run_kind.strip() if isinstance(run_kind, str) and run_kind.strip() else None
    trimmed_status = status.strip() if isinstance(status, str) and status.strip() else None

    runs = db.list_generation_runs(
        run_kind=trimmed_run_kind,
        status=trimmed_status,
        limit=limit,
    )

    rows: list[GenerationRunTimingDetailRecord] = []
    for run in runs:
        total_duration_ms, _total_events, process_timings, llm_summary = _extract_run_timing_summary(run)
        rows.append(
            GenerationRunTimingDetailRecord(
                generation_run_id=run["generation_run_id"],
                run_kind=run["run_kind"],
                status=run["status"],
                prompt_id=run.get("prompt_id"),
                application_pack_id=run.get("application_pack_id"),
                original_resume_id=run.get("original_resume_id"),
                tailored_resume_id=run.get("tailored_resume_id"),
                job_id=run.get("job_id"),
                created_at=run.get("created_at"),
                completed_at=run.get("completed_at"),
                total_duration_ms=total_duration_ms,
                llm_total_calls=(
                    _as_int(llm_summary.get("total_calls")) if isinstance(llm_summary, dict) else None
                ),
                llm_latency_total_ms=(
                    _as_int(llm_summary.get("latency_total_ms"))
                    if isinstance(llm_summary, dict)
                    else None
                ),
                llm_total_tokens=(
                    _as_int(llm_summary.get("total_tokens")) if isinstance(llm_summary, dict) else None
                ),
                llm_estimated_cost_usd=(
                    _as_float(llm_summary.get("estimated_cost_usd"))
                    if isinstance(llm_summary, dict)
                    else None
                ),
                process_timings=process_timings,
            )
        )

    return GenerationRunTimingDetailListResponse(
        request_id=str(uuid4()),
        data=rows,
    )
