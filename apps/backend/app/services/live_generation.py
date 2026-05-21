"""In-memory live generation event registry for preview SSE updates."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
from typing import Any
from uuid import uuid4

from app.schemas import ImproveResumeResponse


LIVE_TERMINAL_EVENT_TYPES = {"run.completed", "run.failed", "run.cancelled"}


def utc_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class LiveGenerationEvent:
    event_id: str
    sequence: int
    live_run_id: str
    generation_run_id: str
    trace_id: str
    type: str
    at: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "event_id": self.event_id,
            "sequence": self.sequence,
            "live_run_id": self.live_run_id,
            "generation_run_id": self.generation_run_id,
            "trace_id": self.trace_id,
            "type": self.type,
            "at": self.at,
            "data": self.data,
        }

    def to_sse(self) -> str:
        payload = json.dumps(self.to_dict(), separators=(",", ":"), default=str)
        return f"id: {self.sequence}\nevent: {self.type}\ndata: {payload}\n\n"


@dataclass
class LiveGenerationRun:
    live_run_id: str
    generation_run_id: str
    trace_id: str
    created_at: str = field(default_factory=utc_iso)
    status: str = "running"
    task: asyncio.Task[Any] | None = None
    result: ImproveResumeResponse | None = None
    error: str | None = None
    events: list[LiveGenerationEvent] = field(default_factory=list)
    queue: asyncio.Queue[LiveGenerationEvent] = field(default_factory=asyncio.Queue)
    lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    sequence: int = 0


class LiveGenerationRegistry:
    """Process-local registry for active and recently completed live generations."""

    def __init__(self) -> None:
        self._runs: dict[str, LiveGenerationRun] = {}
        self._lock = asyncio.Lock()

    async def create_run(
        self,
        *,
        generation_run_id: str,
        trace_id: str,
    ) -> LiveGenerationRun:
        live_run = LiveGenerationRun(
            live_run_id=str(uuid4()),
            generation_run_id=generation_run_id,
            trace_id=trace_id,
        )
        async with self._lock:
            self._runs[live_run.live_run_id] = live_run
        return live_run

    async def get_run(self, live_run_id: str) -> LiveGenerationRun | None:
        async with self._lock:
            return self._runs.get(live_run_id)

    async def emit(
        self,
        live_run_id: str,
        event_type: str,
        data: dict[str, Any] | None = None,
    ) -> LiveGenerationEvent | None:
        live_run = await self.get_run(live_run_id)
        if live_run is None:
            return None

        async with live_run.lock:
            live_run.sequence += 1
            event = LiveGenerationEvent(
                event_id=str(uuid4()),
                sequence=live_run.sequence,
                live_run_id=live_run.live_run_id,
                generation_run_id=live_run.generation_run_id,
                trace_id=live_run.trace_id,
                type=event_type,
                at=utc_iso(),
                data=data or {},
            )
            live_run.events.append(event)
            if event_type in LIVE_TERMINAL_EVENT_TYPES:
                live_run.status = event_type.removeprefix("run.")
            live_run.queue.put_nowait(event)
            return event

    async def set_task(self, live_run_id: str, task: asyncio.Task[Any]) -> None:
        live_run = await self.get_run(live_run_id)
        if live_run is not None:
            live_run.task = task

    async def set_result(self, live_run_id: str, result: ImproveResumeResponse) -> None:
        live_run = await self.get_run(live_run_id)
        if live_run is not None:
            live_run.result = result
            live_run.status = "completed"

    async def set_error(self, live_run_id: str, error: str) -> None:
        live_run = await self.get_run(live_run_id)
        if live_run is not None:
            live_run.error = error
            if live_run.status == "running":
                live_run.status = "failed"

    async def cancel(self, live_run_id: str) -> bool:
        live_run = await self.get_run(live_run_id)
        if live_run is None:
            return False
        if live_run.task and not live_run.task.done():
            live_run.task.cancel()
        live_run.status = "cancelled"
        return True

    async def events_after(
        self,
        live_run_id: str,
        sequence: int = 0,
    ) -> list[LiveGenerationEvent]:
        live_run = await self.get_run(live_run_id)
        if live_run is None:
            return []
        return [event for event in live_run.events if event.sequence > sequence]


live_generation_registry = LiveGenerationRegistry()

