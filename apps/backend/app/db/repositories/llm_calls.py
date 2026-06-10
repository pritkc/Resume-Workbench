"""LLM call repository."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import LLMCall

_RESUME_ID_CONTEXT_KEYS = (
    "resume_id",
    "source_resume_id",
    "original_resume_id",
    "tailored_resume_id",
)
_RESUME_CODE_CONTEXT_KEYS = (
    "resume_code",
    "source_resume_code",
    "original_resume_code",
    "tailored_resume_code",
)


def _normalized_context_value(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _context_matches(
    record: LLMCall,
    *,
    resume_id: str | None = None,
    resume_code: str | None = None,
) -> bool:
    context = record.request_context if isinstance(record.request_context, dict) else {}
    if resume_id:
        wanted_id = resume_id.strip()
        if not any(_normalized_context_value(context.get(key)) == wanted_id for key in _RESUME_ID_CONTEXT_KEYS):
            return False
    if resume_code:
        wanted_code = resume_code.strip().upper()
        if not any(
            (_normalized_context_value(context.get(key)) or "").upper() == wanted_code
            for key in _RESUME_CODE_CONTEXT_KEYS
        ):
            return False
    return True


def create_llm_call(session: Session, **values: Any) -> LLMCall:
    record = LLMCall(**values)
    session.add(record)
    session.commit()
    session.refresh(record)
    return record


def list_llm_calls(
    session: Session,
    *,
    trace_id: str | None = None,
    call_group_id: str | None = None,
    request_scope: str | None = None,
    operation: str | None = None,
    success: bool | None = None,
    resume_id: str | None = None,
    resume_code: str | None = None,
    limit: int = 100,
) -> list[LLMCall]:
    statement = select(LLMCall)

    if trace_id:
        statement = statement.where(LLMCall.trace_id == trace_id)
    if call_group_id:
        statement = statement.where(LLMCall.call_group_id == call_group_id)
    if request_scope:
        statement = statement.where(LLMCall.request_scope == request_scope)
    if operation:
        statement = statement.where(LLMCall.operation == operation)
    if success is not None:
        statement = statement.where(LLMCall.success == success)

    context_filtered = bool(resume_id or resume_code)
    fetch_limit = max(limit * 20, 1000) if context_filtered else limit
    statement = statement.order_by(desc(LLMCall.created_at)).limit(fetch_limit)
    records = list(session.scalars(statement))
    if context_filtered:
        records = [
            record
            for record in records
            if _context_matches(record, resume_id=resume_id, resume_code=resume_code)
        ][:limit]
    return records


def attach_compact_diff_validation_to_latest_call(
    session: Session,
    *,
    trace_id: str,
    operation: str,
    envelope_validation: dict[str, Any],
) -> bool:
    """Merge ``compact_diff_validation`` into the newest LLM row for trace + operation."""

    stmt = (
        select(LLMCall)
        .where(LLMCall.trace_id == trace_id)
        .where(LLMCall.operation == operation)
        .order_by(
            desc(LLMCall.completed_at),
            desc(LLMCall.created_at),
            desc(LLMCall.id),
        )
        .limit(1)
    )
    record = session.scalars(stmt).first()
    if record is None:
        return False
    ctx = dict(record.request_context or {})
    ctx["compact_diff_validation"] = envelope_validation
    record.request_context = ctx or None
    session.commit()
    session.refresh(record)
    return True


def summarize_llm_calls(
    session: Session,
    *,
    trace_id: str | None = None,
    request_scope: str | None = None,
    resume_id: str | None = None,
    resume_code: str | None = None,
) -> dict[str, Any]:
    statement = select(LLMCall)

    if trace_id:
        statement = statement.where(LLMCall.trace_id == trace_id)
    if request_scope:
        statement = statement.where(LLMCall.request_scope == request_scope)

    records = list(session.scalars(statement))
    if resume_id or resume_code:
        records = [
            record
            for record in records
            if _context_matches(record, resume_id=resume_id, resume_code=resume_code)
        ]

    operation_breakdown: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "operation": "",
            "calls": 0,
            "successes": 0,
            "failures": 0,
            "latency_total_ms": 0,
            "latency_avg_ms": 0.0,
            "input_tokens": 0,
            "output_tokens": 0,
            "total_tokens": 0,
            "estimated_cost_usd": 0.0,
        }
    )

    summary: dict[str, Any] = {
        "trace_id": trace_id,
        "request_scope": request_scope,
        "total_calls": 0,
        "successful_calls": 0,
        "failed_calls": 0,
        "latency_total_ms": 0,
        "latency_avg_ms": 0.0,
        "llm_wall_clock_ms": 0,
        "first_call_at": None,
        "last_call_at": None,
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
        "usage_backed_calls": 0,
        "estimated_calls": 0,
        "operations": [],
    }

    first_call_at = None
    last_call_at = None
    for record in records:
        summary["total_calls"] += 1
        if record.success:
            summary["successful_calls"] += 1
        else:
            summary["failed_calls"] += 1

        latency_ms = int(record.latency_ms or 0)
        summary["latency_total_ms"] += latency_ms

        input_tokens = record.usage_input_tokens or record.prompt_tokens_est or 0
        output_tokens = record.usage_output_tokens or record.response_tokens_est or 0
        total_tokens = record.usage_total_tokens or (input_tokens + output_tokens)
        estimated_cost = record.estimated_total_cost_usd or 0.0

        summary["input_tokens"] += input_tokens
        summary["output_tokens"] += output_tokens
        summary["total_tokens"] += total_tokens
        summary["estimated_cost_usd"] += estimated_cost

        if record.usage_input_tokens is not None or record.usage_output_tokens is not None:
            summary["usage_backed_calls"] += 1
        else:
            summary["estimated_calls"] += 1

        operation_summary = operation_breakdown[record.operation]
        operation_summary["operation"] = record.operation
        operation_summary["calls"] += 1
        if record.success:
            operation_summary["successes"] += 1
        else:
            operation_summary["failures"] += 1
        operation_summary["latency_total_ms"] += latency_ms
        operation_summary["input_tokens"] += input_tokens
        operation_summary["output_tokens"] += output_tokens
        operation_summary["total_tokens"] += total_tokens
        operation_summary["estimated_cost_usd"] += estimated_cost

        if record.created_at and (first_call_at is None or record.created_at < first_call_at):
            first_call_at = record.created_at
        completed_at = record.completed_at or record.created_at
        if completed_at and (last_call_at is None or completed_at > last_call_at):
            last_call_at = completed_at

    summary["estimated_cost_usd"] = round(summary["estimated_cost_usd"], 6)
    if summary["total_calls"] > 0:
        summary["latency_avg_ms"] = round(
            summary["latency_total_ms"] / summary["total_calls"], 2
        )
    if first_call_at is not None:
        summary["first_call_at"] = first_call_at.isoformat()
    if last_call_at is not None:
        summary["last_call_at"] = last_call_at.isoformat()
    if first_call_at is not None and last_call_at is not None:
        summary["llm_wall_clock_ms"] = max(
            0, int((last_call_at - first_call_at).total_seconds() * 1000)
        )

    for values in operation_breakdown.values():
        if values["calls"] > 0:
            values["latency_avg_ms"] = round(values["latency_total_ms"] / values["calls"], 2)

    summary["operations"] = sorted(
        (
            {
                **values,
                "estimated_cost_usd": round(values["estimated_cost_usd"], 6),
            }
            for values in operation_breakdown.values()
        ),
        key=lambda item: (item["operation"], item["calls"]),
    )
    return summary


def merge_context_for_trace(
    session: Session,
    *,
    trace_id: str,
    context_updates: dict[str, Any],
) -> int:
    """Merge identifying metadata into every LLM call for a trace."""

    if not trace_id or not context_updates:
        return 0
    records = list(session.scalars(select(LLMCall).where(LLMCall.trace_id == trace_id)))
    for record in records:
        context = dict(record.request_context or {})
        context.update(
            {
                key: value
                for key, value in context_updates.items()
                if value is not None and value != ""
            }
        )
        record.request_context = context or None
    if records:
        session.commit()
    return len(records)
