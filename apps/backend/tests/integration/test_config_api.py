"""Integration tests for configuration endpoints."""

from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


class TestLlmConfig:
    """GET/PUT /api/v1/config/llm-api-key"""

    @patch("app.routers.config._load_config")
    async def test_get_llm_config(self, mock_load, client):
        mock_load.return_value = {
            "provider": "openai",
            "model": "gpt-4",
            "api_key": "sk-1234567890abcdef",
            "api_base": None,
        }
        async with client:
            resp = await client.get("/api/v1/config/llm-api-key")
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "openai"
        assert data["ai_route"] == "direct_api"
        assert "cliproxy" in data
        # API key should be masked
        assert "****" in data["api_key"] or "*" in data["api_key"]

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_llm_config(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/llm-api-key", json={
                "provider": "anthropic",
                "model": "claude-3-sonnet",
            })
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider"] == "anthropic"

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_llm_config_cliproxy_route(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put(
                "/api/v1/config/llm-api-key",
                json={
                    "ai_route": "cliproxyapi",
                    "cliproxy": {
                        "base_url": "http://127.0.0.1:8317/v1",
                        "client_api_key": "proxy-key-123",
                        "provider_filter": "codex",
                        "model_alias": "codex-jd-fast",
                        "quick_profiles": [
                            {
                                "name": "Codex Fast",
                                "provider_filter": "codex",
                                "model_alias": "codex-jd-fast",
                                "base_url": "http://127.0.0.1:8317/v1",
                            }
                        ],
                    },
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["ai_route"] == "cliproxyapi"
        assert data["cliproxy"]["model_alias"] == "codex-jd-fast"


class TestLlmTest:
    """POST /api/v1/config/llm-test"""

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_success(self, mock_load, mock_health, client):
        mock_load.return_value = {"provider": "openai", "model": "gpt-4", "api_key": "sk-test"}
        mock_health.return_value = {
            "healthy": True,
            "provider": "openai",
            "model": "gpt-4",
            "test_prompt": "Hi",
            "model_output": "Hello!",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is True

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_failure(self, mock_load, mock_health, client):
        mock_load.return_value = {}
        mock_health.return_value = {
            "healthy": False,
            "error_code": "api_key_missing",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is False

    @patch("app.routers.config.check_llm_health", new_callable=AsyncMock)
    @patch("app.routers.config._load_config")
    async def test_connection_test_cliproxy_route(self, mock_load, mock_health, client):
        mock_load.return_value = {
            "ai_route": "cliproxyapi",
            "cliproxy": {
                "base_url": "http://127.0.0.1:8317/v1",
                "client_api_key": "proxy-test-key",
                "model_alias": "codex-jd-fast",
                "provider_filter": "codex",
            },
        }
        mock_health.return_value = {
            "healthy": True,
            "provider": "openai",
            "model": "codex-jd-fast",
        }
        async with client:
            resp = await client.post("/api/v1/config/llm-test")
        assert resp.status_code == 200
        assert resp.json()["healthy"] is True
        called_config = mock_health.call_args.args[0]
        assert called_config.provider == "openai"
        assert called_config.model == "codex-jd-fast"


class TestCLIProxyModels:
    """POST /api/v1/config/cliproxy-models"""

    @patch("app.routers.config._load_config")
    @patch("app.routers.config.urllib_request.urlopen")
    async def test_discover_models_success(self, mock_urlopen, mock_load, client):
        mock_load.return_value = {
            "cliproxy": {
                "base_url": "http://127.0.0.1:8317/v1",
                "client_api_key": "proxy-key",
                "provider_filter": "mixed",
            }
        }
        mocked_resp = MagicMock()
        mocked_resp.read.return_value = (
            b'{"data":['
            b'{"id":"codex-jd-fast","owned_by":"openai"},'
            b'{"id":"claude-jd-fast","owned_by":"anthropic"},'
            b'{"id":"gemini-jd-fast"}'
            b"]}"
        )
        mock_urlopen.return_value.__enter__.return_value = mocked_resp

        async with client:
            resp = await client.post(
                "/api/v1/config/cliproxy-models",
                json={"provider_filter": "codex"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["provider_filter"] == "codex"
        assert len(data["models"]) == 1
        assert data["models"][0]["id"] == "codex-jd-fast"
        assert data["models"][0]["owned_by"] == "openai"

    @patch("app.routers.config._load_config")
    async def test_discover_models_missing_key(self, mock_load, client):
        mock_load.return_value = {"cliproxy": {"base_url": "http://127.0.0.1:8317/v1"}}
        async with client:
            resp = await client.post("/api/v1/config/cliproxy-models", json={})
        assert resp.status_code == 400


class TestFeatureConfig:
    """GET/PUT /api/v1/config/features"""

    @patch("app.routers.config._load_config")
    async def test_get_features(self, mock_load, client):
        mock_load.return_value = {
            "enable_cover_letter": True,
            "enable_outreach_message": False,
        }
        async with client:
            resp = await client.get("/api/v1/config/features")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enable_cover_letter"] is True
        assert data["enable_outreach_message"] is False

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_features(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/features", json={
                "enable_cover_letter": True,
            })
        assert resp.status_code == 200
        assert resp.json()["enable_cover_letter"] is True


class TestGenerationDefaults:
    """GET/PUT /api/v1/config/generation-defaults"""

    @patch("app.routers.config._load_config")
    async def test_get_generation_defaults(self, mock_load, client):
        mock_load.return_value = {
            "default_prompt_id": "keywords",
            "generation_defaults": {
                "include_cover_letter": True,
                "include_outreach_message": False,
                "prompt_id": "full",
            },
        }
        async with client:
            resp = await client.get("/api/v1/config/generation-defaults")
        assert resp.status_code == 200
        data = resp.json()
        assert data["include_cover_letter"] is True
        assert data["include_outreach_message"] is False
        assert data["prompt_id"] == "full"

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_generation_defaults(self, mock_load, mock_save, client):
        mock_load.return_value = {"generation_defaults": {}}
        async with client:
            resp = await client.put(
                "/api/v1/config/generation-defaults",
                json={
                    "include_cover_letter": True,
                    "include_outreach_message": True,
                    "prompt_id": "keywords",
                },
            )
        assert resp.status_code == 200
        assert resp.json() == {
            "include_cover_letter": True,
            "include_outreach_message": True,
            "prompt_id": "keywords",
        }


class TestLanguageConfig:
    """GET/PUT /api/v1/config/language"""

    @patch("app.routers.config._load_config")
    async def test_get_language(self, mock_load, client):
        mock_load.return_value = {"ui_language": "en", "content_language": "es"}
        async with client:
            resp = await client.get("/api/v1/config/language")
        assert resp.status_code == 200
        data = resp.json()
        assert data["ui_language"] == "en"
        assert data["content_language"] == "es"
        assert "en" in data["supported_languages"]

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_invalid_language_returns_400(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/language", json={
                "ui_language": "invalid_lang",
            })
        assert resp.status_code == 400


class TestPromptCatalog:
    """GET /api/v1/config/prompts/catalog"""

    async def test_get_prompt_catalog(self, client):
        async with client:
            resp = await client.get("/api/v1/config/prompts/catalog")
        assert resp.status_code == 200
        data = resp.json()
        assert "prompts" in data
        assert isinstance(data["prompts"], list)
        ids = {row["id"] for row in data["prompts"]}
        assert {
            "llm_health_check",
            "resume_parse_json",
            "job_extract_keywords",
            "resume_generate_full",
            "cover_letter_outreach_generate",
            "application_questions_generate",
            "enrichment_analyze",
            "enrichment_enhance",
            "enrichment_regenerate_item",
            "enrichment_regenerate_group",
        }.issubset(ids)

        tailoring = next(row for row in data["prompts"] if row["id"] == "resume_generate_full")
        assert tailoring.get("sections")
        assert len(tailoring["sections"]) == 2
        assert {s["id"] for s in tailoring["sections"]} == {
            "tailoring_system_message",
            "tailoring_user_message",
        }


class TestResetDatabase:
    """POST /api/v1/config/reset"""

    @patch("app.routers.config.db")
    async def test_reset_with_correct_token(self, mock_db, client):
        async with client:
            resp = await client.post("/api/v1/config/reset", json={
                "confirm": "RESET_ALL_DATA",
            })
        assert resp.status_code == 200
        mock_db.reset_database.assert_called_once()

    async def test_reset_without_token_returns_400(self, client):
        async with client:
            resp = await client.post("/api/v1/config/reset", json={
                "confirm": "wrong_token",
            })
        assert resp.status_code == 400

    async def test_reset_missing_body_returns_422(self, client):
        async with client:
            resp = await client.post("/api/v1/config/reset")
        assert resp.status_code == 422
