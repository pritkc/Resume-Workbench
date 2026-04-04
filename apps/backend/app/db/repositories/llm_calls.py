"""LLM call repository."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db.models import LLMCall


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

    statement = statement.order_by(desc(LLMCall.created_at)).limit(limit)
    return list(session.scalars(statement))


def summarize_llm_calls(
    session: Session,
    *,
    trace_id: str | None = None,
    request_scope: str | None = None,
) -> dict[str, Any]:
    statement = select(LLMCall)

    if trace_id:
        statement = statement.where(LLMCall.trace_id == trace_id)
    if request_scope:
        statement = statement.where(LLMCall.request_scope == request_scope)

    records = list(session.scalars(statement))

    operation_breakdown: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "operation": "",
            "calls": 0,
            "successes": 0,
            "failures": 0,
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
        "input_tokens": 0,
        "output_tokens": 0,
        "total_tokens": 0,
        "estimated_cost_usd": 0.0,
        "usage_backed_calls": 0,
        "estimated_calls": 0,
        "operations": [],
    }

    for record in records:
        summary["total_calls"] += 1
        if record.success:
            summary["successful_calls"] += 1
        else:
            summary["failed_calls"] += 1

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
        operation_summary["input_tokens"] += input_tokens
        operation_summary["output_tokens"] += output_tokens
        operation_summary["total_tokens"] += total_tokens
        operation_summary["estimated_cost_usd"] += estimated_cost

    summary["estimated_cost_usd"] = round(summary["estimated_cost_usd"], 6)
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
