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
