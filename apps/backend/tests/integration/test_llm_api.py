"""Integration tests for LLM observability endpoints."""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestListLLMCalls:
    """GET /api/v1/llm/calls"""

    @patch("app.routers.llm.db")
    async def test_list_llm_calls_returns_records(self, mock_db, client):
        mock_db.list_llm_calls.return_value = [
            {
                "llm_call_id": "call-123",
                "call_group_id": "group-123",
                "trace_id": "trace-123",
                "request_scope": "resumes.improve_preview",
                "operation": "resume_generate_diffs",
                "provider": "gemini",
                "model": "gemini/gemini-2.5-flash",
                "model_name": "gemini-2.5-flash",
                "response_model": None,
                "request_kind": "json",
                "success": True,
                "attempt": 1,
                "max_tokens": 8192,
                "temperature": 0.2,
                "reasoning_effort": None,
                "json_mode": True,
                "latency_ms": 1210,
                "finish_reason": "stop",
                "prompt_chars": 1520,
                "prompt_tokens_est": 380,
                "response_chars": 860,
                "response_tokens_est": 215,
                "usage_input_tokens": 402,
                "usage_output_tokens": 233,
                "usage_total_tokens": 635,
                "estimated_input_cost_usd": 0.00012,
                "estimated_output_cost_usd": 0.00058,
                "estimated_total_cost_usd": 0.00070,
                "error_type": None,
                "error_message": None,
                "prompt_preview": "Resume JSON...",
                "response_preview": '{"changes": []}',
                "request_context": {"job_id": "job-123"},
                "created_at": "2026-04-02T00:00:00Z",
                "updated_at": "2026-04-02T00:00:00Z",
                "completed_at": "2026-04-02T00:00:01Z",
            }
        ]

        async with client:
            response = await client.get(
                "/api/v1/llm/calls",
                params={
                    "trace_id": "trace-123",
                    "request_scope": "resumes.improve_preview",
                    "operation": "resume_generate_diffs",
                    "success": "true",
                    "limit": "25",
                },
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["request_id"]
        assert payload["data"][0]["llm_call_id"] == "call-123"
        assert payload["data"][0]["usage_total_tokens"] == 635
        mock_db.list_llm_calls.assert_called_once_with(
            trace_id="trace-123",
            call_group_id=None,
            request_scope="resumes.improve_preview",
            operation="resume_generate_diffs",
            success=True,
            limit=25,
        )


class TestSummarizeLLMCalls:
    """GET /api/v1/llm/calls/summary"""

    @patch("app.routers.llm.db")
    async def test_summary_returns_aggregated_metrics(self, mock_db, client):
        mock_db.summarize_llm_calls.return_value = {
            "trace_id": "trace-123",
            "request_scope": "resumes.improve_preview",
            "total_calls": 3,
            "successful_calls": 2,
            "failed_calls": 1,
            "input_tokens": 1200,
            "output_tokens": 900,
            "total_tokens": 2100,
            "estimated_cost_usd": 0.0045,
            "usage_backed_calls": 2,
            "estimated_calls": 1,
            "operations": [
                {
                    "operation": "resume_generate_diffs",
                    "calls": 2,
                    "successes": 1,
                    "failures": 1,
                    "input_tokens": 900,
                    "output_tokens": 700,
                    "total_tokens": 1600,
                    "estimated_cost_usd": 0.0035,
                }
            ],
        }

        async with client:
            response = await client.get(
                "/api/v1/llm/calls/summary",
                params={"trace_id": "trace-123"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["request_id"]
        assert payload["data"]["trace_id"] == "trace-123"
        assert payload["data"]["total_tokens"] == 2100
        assert payload["data"]["operations"][0]["operation"] == "resume_generate_diffs"
        mock_db.summarize_llm_calls.assert_called_once_with(
            trace_id="trace-123",
            request_scope=None,
        )


class TestListGenerationRunTiming:
    """GET /api/v1/llm/runs/timing"""

    @patch("app.routers.llm.db")
    async def test_list_generation_run_timing_returns_tabular_rows(self, mock_db, client):
        mock_db.list_generation_runs.return_value = [
            {
                "generation_run_id": "run-123",
                "run_kind": "application_pack_preview",
                "status": "completed",
                "prompt_id": "keywords",
                "application_pack_id": "pack-123",
                "original_resume_id": "res-master",
                "tailored_resume_id": None,
                "job_id": "job-123",
                "created_at": "2026-04-14T20:00:00Z",
                "completed_at": "2026-04-14T20:00:40Z",
                "result_payload": {
                    "pipeline_timing": {
                        "total_duration_ms": 40_790,
                        "entries": [
                            {"host_event": "frontend", "duration_ms": 40_790},
                            {"host_event": "llm", "duration_ms": 12_060},
                        ],
                    },
                    "llm_summary": {
                        "total_calls": 2,
                        "latency_total_ms": 27_410,
                        "total_tokens": 2_100,
                        "estimated_cost_usd": 0.0123,
                    },
                },
            }
        ]

        async with client:
            response = await client.get(
                "/api/v1/llm/runs/timing",
                params={"run_kind": "application_pack_preview", "status": "completed", "limit": "20"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["request_id"]
        row = payload["data"][0]
        assert row["generation_run_id"] == "run-123"
        assert row["total_duration_ms"] == 40_790
        assert row["total_events"] == 2
        assert row["llm_total_calls"] == 2
        assert row["llm_latency_total_ms"] == 27_410
        assert row["llm_total_tokens"] == 2_100
        assert row["llm_estimated_cost_usd"] == 0.0123
        mock_db.list_generation_runs.assert_called_once_with(
            run_kind="application_pack_preview",
            status="completed",
            limit=20,
        )


class TestListGenerationRunTimingDetailed:
    """GET /api/v1/llm/runs/timing-detailed"""

    @patch("app.routers.llm.db")
    async def test_list_generation_run_timing_detailed_groups_processes(self, mock_db, client):
        mock_db.list_generation_runs.return_value = [
            {
                "generation_run_id": "run-123",
                "run_kind": "application_pack_preview",
                "status": "completed",
                "result_payload": {
                    "pipeline_timing": {
                        "entries": [
                            {"host_event": "llm", "sub_event": "resume_generate_full", "duration_ms": 12_000},
                            {"host_event": "llm", "sub_event": "resume_generate_full", "duration_ms": 1_000},
                            {"host_event": "rendercv", "sub_event": "render_and_store_preview_artifacts", "duration_ms": 900},
                        ]
                    },
                    "llm_summary": {"total_calls": 2, "total_tokens": 1500},
                },
            }
        ]

        async with client:
            response = await client.get(
                "/api/v1/llm/runs/timing-detailed",
                params={"run_kind": "application_pack_preview", "limit": "10"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["request_id"]
        row = payload["data"][0]
        assert row["generation_run_id"] == "run-123"
        assert row["total_duration_ms"] == 13_900
        assert row["llm_total_calls"] == 2
        assert row["llm_total_tokens"] == 1500
        assert row["process_timings"][0]["process_key"] == "llm / resume_generate_full"
        assert row["process_timings"][0]["duration_ms"] == 13_000
        assert row["process_timings"][1]["process_key"] == "rendercv / render_and_store_preview_artifacts"
        assert row["process_timings"][1]["duration_ms"] == 900
        mock_db.list_generation_runs.assert_called_once_with(
            run_kind="application_pack_preview",
            status=None,
            limit=10,
        )
