"""Tests for local test-run prompt/response capture exports."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path
from typing import Any

import pytest

from app.services import test_run_exporter


def _call(trace_id: str, generation_run_id: str) -> dict[str, Any]:
    return {
        "id": 1,
        "llm_call_id": "call-1",
        "call_group_id": "group-1",
        "trace_id": trace_id,
        "request_scope": "resumes.improve_preview",
        "operation": "resume_generate_full",
        "provider": "test",
        "model": "test-model",
        "model_name": "test-model",
        "response_model": None,
        "request_kind": "chat",
        "success": True,
        "attempt": 1,
        "max_tokens": 100,
        "temperature": None,
        "reasoning_effort": None,
        "json_mode": False,
        "latency_ms": 25,
        "finish_reason": "stop",
        "prompt_chars": 12,
        "prompt_tokens_est": 3,
        "response_chars": 14,
        "response_tokens_est": 4,
        "usage_input_tokens": 3,
        "usage_output_tokens": 4,
        "usage_total_tokens": 7,
        "estimated_input_cost_usd": 0,
        "estimated_output_cost_usd": 0,
        "estimated_total_cost_usd": 0,
        "error_type": None,
        "error_message": None,
        "prompt_preview": "prompt text",
        "response_preview": "response text",
        "request_context": {"generation_run_id": generation_run_id},
        "created_at": "2026-05-22T10:00:00+00:00",
        "updated_at": "2026-05-22T10:00:01+00:00",
        "completed_at": "2026-05-22T10:00:01+00:00",
    }


def _generation_run(generation_run_id: str, trace_id: str) -> dict[str, Any]:
    return {
        "generation_run_id": generation_run_id,
        "run_kind": "application_pack_preview",
        "status": "completed",
        "prompt_id": "full",
        "application_pack_id": "pack-1",
        "source_resume_id": "resume-1",
        "tailored_resume_id": None,
        "job_id": "job-1",
        "warnings": [],
        "created_at": "2026-05-22T10:00:00+00:00",
        "completed_at": "2026-05-22T10:00:02+00:00",
        "request_payload": {"llm_trace_id": trace_id},
        "result_payload": {"artifact_ids": []},
    }


def _fake_fetcher(generation_run_id: str, trace_id: str):
    run = _generation_run(generation_run_id, trace_id)
    call = _call(trace_id, generation_run_id)

    def fake_fetch_all(sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        params = params or {}
        if "from generation_runs where generation_run_id" in sql:
            return [run] if params.get("generation_run_id") == generation_run_id else []
        if "from llm_calls" in sql:
            return [call] if params.get("trace_id") == trace_id else []
        if "from artifacts" in sql:
            return []
        if "from generation_runs" in sql and "order by created_at desc" in sql:
            return [run]
        return []

    return fake_fetch_all


def test_export_capture_uses_generation_run_folder_for_trace_input(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        test_run_exporter,
        "_fetch_all",
        _fake_fetcher("run-123", "trace-abc"),
    )

    output_dir = test_run_exporter.export_test_run_capture(
        trace_id="trace-abc",
        out_dir=tmp_path,
    )

    assert output_dir == tmp_path / "run-123"
    assert (output_dir / "resume_generate_full" / "prompt.txt").read_text() == "prompt text"
    manifest = json.loads((output_dir / "manifest.json").read_text())
    assert manifest["input_id"] == "trace-abc"
    assert manifest["trace_id"] == "trace-abc"
    assert manifest["generation_run"]["generation_run_id"] == "run-123"
    index = (tmp_path / "_index.md").read_text()
    assert "[`run-123`](run-123/)" in index
    assert "`trace-abc`" in index


def test_export_capture_accepts_generation_run_id_input(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        test_run_exporter,
        "_fetch_all",
        _fake_fetcher("run-456", "trace-def"),
    )

    output_dir = test_run_exporter.export_test_run_capture(
        trace_id="run-456",
        out_dir=tmp_path,
    )

    assert output_dir == tmp_path / "run-456"
    manifest = json.loads((output_dir / "manifest.json").read_text())
    assert manifest["input_id"] == "run-456"
    assert manifest["trace_id"] == "trace-def"


def test_export_capture_missing_trace_does_not_create_folder(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(test_run_exporter, "_fetch_all", lambda *_args, **_kwargs: [])

    with pytest.raises(ValueError):
        test_run_exporter.export_test_run_capture(trace_id="missing", out_dir=tmp_path)

    assert list(tmp_path.iterdir()) == []


def test_test_run_index_sorts_by_exported_at_and_links_generation_runs(tmp_path: Path) -> None:
    for folder, trace_id, exported_at in (
        ("run-old", "trace-old", "2026-05-21T10:00:00+00:00"),
        ("run-new", "trace-new", "2026-05-22T10:00:00+00:00"),
    ):
        run_dir = tmp_path / folder
        run_dir.mkdir()
        (run_dir / "manifest.json").write_text(
            json.dumps(
                {
                    "trace_id": trace_id,
                    "exported_at": exported_at,
                    "generation_run": {"generation_run_id": folder},
                    "summary": {"operations": ["resume_generate_full"], "total_calls": 1},
                    "warnings": [],
                    "artifacts": [],
                }
            ),
            encoding="utf-8",
        )

    test_run_exporter._write_test_run_index(tmp_path)

    index = (tmp_path / "_index.md").read_text()
    assert index.index("[`run-new`](run-new/)") < index.index("[`run-old`](run-old/)")
    assert "| Exported at | Generation run | Trace |" in index


def test_script_exporter_resolves_generation_run_id_input(monkeypatch: pytest.MonkeyPatch) -> None:
    script_path = Path(__file__).resolve().parents[4] / "scripts" / "export-test-run.py"
    spec = importlib.util.spec_from_file_location("export_test_run_script", script_path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    def fake_fetch_all(_engine: Any, sql: str, params: dict[str, Any] | None = None) -> list[dict[str, Any]]:
        return _fake_fetcher("run-script", "trace-script")(sql, params)

    monkeypatch.setattr(module, "_fetch_all", fake_fetch_all)

    trace_id, generation_run, calls = module._resolve_export_source(object(), "run-script")

    assert trace_id == "trace-script"
    assert generation_run["generation_run_id"] == "run-script"
    assert calls[0]["prompt_preview"] == "prompt text"
