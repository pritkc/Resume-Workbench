"""Tests for live generation event registry."""

from __future__ import annotations

import pytest

from app.services.live_generation import LiveGenerationRegistry


@pytest.mark.asyncio
async def test_live_generation_registry_orders_events_by_sequence() -> None:
    registry = LiveGenerationRegistry()
    run = await registry.create_run(
        generation_run_id="run-123",
        trace_id="trace-123",
    )

    first = await registry.emit(run.live_run_id, "run.started", {"status": "running"})
    second = await registry.emit(run.live_run_id, "stage.started", {"stage_label": "tailoring"})

    assert first is not None
    assert second is not None
    assert first.sequence == 1
    assert second.sequence == 2
    assert [event.type for event in await registry.events_after(run.live_run_id, 0)] == [
        "run.started",
        "stage.started",
    ]
    assert [event.type for event in await registry.events_after(run.live_run_id, 1)] == [
        "stage.started"
    ]

