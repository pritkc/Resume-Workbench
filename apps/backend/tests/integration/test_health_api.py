"""Integration tests for health and status endpoints."""

from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    """Async HTTP client for testing FastAPI endpoints."""
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestHealthEndpoint:
    """GET /api/v1/health"""

    @patch("app.routers.health.get_llm_health_snapshot")
    @patch("app.routers.health.get_llm_config")
    async def test_health_returns_healthy(self, mock_config, mock_snapshot, client):
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_snapshot.return_value = {
            "checked": False,
            "healthy": True,
            "provider": "openai",
            "model": "gpt-4",
        }
        async with client:
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

    @patch("app.routers.health.get_llm_health_snapshot")
    @patch("app.routers.health.get_llm_config")
    async def test_health_returns_degraded_when_cached_health_is_bad(
        self,
        mock_config,
        mock_snapshot,
        client,
    ):
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_snapshot.return_value = {
            "checked": True,
            "healthy": False,
            "provider": "openai",
            "model": "gpt-4",
            "error_code": "api_key_missing",
        }
        async with client:
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "degraded"


class TestStatusEndpoint:
    """GET /api/v1/status"""

    @patch("app.routers.health.db")
    @patch("app.routers.health.get_llm_health_snapshot")
    @patch("app.routers.health.get_llm_config")
    async def test_status_ready_without_live_health_probe(
        self,
        mock_config,
        mock_snapshot,
        mock_db,
        client,
    ):
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_snapshot.return_value = {
            "checked": False,
            "healthy": False,
            "status": "unchecked",
        }
        mock_db.get_stats.return_value = {
            "total_resumes": 1,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_active_resume": True,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ready"
        assert data["llm_healthy"] is False
        assert data["has_active_resume"] is True
        assert data["llm_health_status"] == "unchecked"
        assert data["llm_health_checked"] is False

    @patch("app.routers.health.db")
    @patch("app.routers.health.get_llm_health_snapshot")
    @patch("app.routers.health.get_llm_config")
    async def test_status_setup_required(self, mock_config, mock_snapshot, mock_db, client):
        mock_config.return_value = type("C", (), {"api_key": "", "provider": "openai"})()
        mock_snapshot.return_value = {
            "checked": False,
            "healthy": False,
            "status": "not_configured",
        }
        mock_db.get_stats.return_value = {
            "total_resumes": 0,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_active_resume": False,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "setup_required"

    @patch("app.routers.health.db")
    @patch("app.routers.health.get_llm_health_snapshot")
    @patch("app.routers.health.get_llm_config")
    async def test_status_setup_required_when_cached_health_is_unhealthy(
        self,
        mock_config,
        mock_snapshot,
        mock_db,
        client,
    ):
        mock_config.return_value = type("C", (), {"api_key": "sk-test", "provider": "openai"})()
        mock_snapshot.return_value = {
            "checked": True,
            "healthy": False,
            "status": "unhealthy",
        }
        mock_db.get_stats.return_value = {
            "total_resumes": 1,
            "total_jobs": 0,
            "total_improvements": 0,
            "has_active_resume": True,
        }
        async with client:
            resp = await client.get("/api/v1/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "setup_required"
        assert data["llm_healthy"] is False
        assert data["llm_health_status"] == "unhealthy"
        assert data["llm_health_checked"] is True
