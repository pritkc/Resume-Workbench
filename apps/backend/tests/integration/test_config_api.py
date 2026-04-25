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
            "prompt_id": "full",
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
        assert data["content_language"] == "en"
        assert data["supported_languages"] == ["en"]

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_invalid_language_returns_400(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/language", json={
                "ui_language": "invalid_lang",
            })
        assert resp.status_code == 400


class TestSharedRulesDelete:
    """DELETE /api/v1/config/shared-rules/{rules_name}"""

    @patch("app.prompts.delete_shared_rules_override")
    async def test_delete_shared_rules_resume_diff(self, mock_delete, client):
        mock_delete.return_value = True
        async with client:
            resp = await client.delete("/api/v1/config/shared-rules/resume_diff")
        assert resp.status_code == 200
        data = resp.json()
        assert data["success"] is True
        assert data["rules_name"] == "resume_diff"
        assert isinstance(data["affected_steps"], list)
        assert len(data["affected_steps"]) >= 1
        mock_delete.assert_called_once_with("resume_diff")

    async def test_delete_shared_rules_unknown_returns_404(self, client):
        async with client:
            resp = await client.delete("/api/v1/config/shared-rules/not_a_rule")
        assert resp.status_code == 404


class TestCritiqueConfig:
    """GET/PUT /api/v1/config/critique"""

    @patch("app.routers.config._load_config")
    async def test_get_critique_default_true(self, mock_load, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.get("/api/v1/config/critique")
        assert resp.status_code == 200
        assert resp.json()["enabled"] is True

    @patch("app.routers.config._save_config")
    @patch("app.routers.config._load_config")
    async def test_put_critique(self, mock_load, mock_save, client):
        mock_load.return_value = {}
        async with client:
            resp = await client.put("/api/v1/config/critique", json={"enabled": False})
        assert resp.status_code == 200
        assert resp.json()["enabled"] is False


class TestPromptCatalog:
    """GET /api/v1/config/prompts/catalog"""

    async def test_get_prompt_catalog(self, client):
        async with client:
            resp = await client.get("/api/v1/config/prompts/catalog")
        assert resp.status_code == 200
        data = resp.json()
        assert "prompts" in data
        assert "entries" in data
        assert "shared_rules" in data
        assert isinstance(data["prompts"], list)
        assert isinstance(data["entries"], list)
        assert isinstance(data["shared_rules"], list)
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
        assert len(tailoring["sections"]) == 4
        assert {s["id"] for s in tailoring["sections"]} == {
            "tailoring_contract_block",
            "tailoring_craft_block",
            "tailoring_mode_strategies",
            "tailoring_user_message",
        }

        entry = next(e for e in data["entries"] if e["step_name"] == "extract_jd_intel")
        assert "system_resolved" in entry
        assert "user_template_resolved" in entry
        assert "composer_override_active" in entry
        assert entry.get("system_prompt_files") == [
            "apps/backend/app/prompts/text/fragments/jd_intel_contract.txt",
            "apps/backend/app/prompts/text/fragments/jd_intel_craft.txt",
        ]
        assert entry.get("user_prompt_file") == "apps/backend/app/prompts/text/extract_jd_intel/user.txt"

        shared = next(r for r in data["shared_rules"] if r["name"] == "resume_diff")
        assert shared.get("rules_source_file") == "apps/backend/app/prompts/text/fragments/resume_diff_output.txt"

    @patch("app.routers.config.capped_master_resume_preview_text")
    async def test_get_master_resume_preview(self, mock_preview, client):
        mock_preview.return_value = ('{"k":1}', False)
        async with client:
            resp = await client.get("/api/v1/config/prompts/catalog/master-resume-preview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["serialized_original_resume"] == '{"k":1}'
        assert data["truncated"] is False

    @patch("app.routers.config.response_contract_catalog_previews")
    async def test_get_response_contract_preview(self, mock_rc, client):
        mock_rc.return_value = (('{"mode":"full"}', False), ('{"mode":"lite"}', True))
        async with client:
            resp = await client.get("/api/v1/config/prompts/catalog/response-contract-preview")
        assert resp.status_code == 200
        data = resp.json()
        assert data["full"]["serialized"] == '{"mode":"full"}'
        assert data["full"]["truncated"] is False
        assert data["lite"]["serialized"] == '{"mode":"lite"}'
        assert data["lite"]["truncated"] is True


class TestPromptComposer:
    """GET/PUT/DELETE /api/v1/config/prompts/{step}/composer"""

    async def test_composer_put_get_delete_roundtrip(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("app.prompts._prompt_loader._OVERRIDE_DIR", tmp_path)
        step = "extract_jd_intel"
        body = {"system": "custom system line", "user": "$job_description"}
        async with client:
            put_resp = await client.put(f"/api/v1/config/prompts/{step}/composer", json=body)
            assert put_resp.status_code == 200
            put_data = put_resp.json()
            assert put_data["composer_override_active"] is True
            assert put_data["system"] == "custom system line"
            assert put_data["user"] == "$job_description"

            get_resp = await client.get(f"/api/v1/config/prompts/{step}/composer")
            assert get_resp.status_code == 200
            assert get_resp.json()["composer_override_active"] is True

            del_resp = await client.delete(f"/api/v1/config/prompts/{step}/composer")
            assert del_resp.status_code == 200
            assert del_resp.json()["composer_override_active"] is False

    async def test_composer_put_unknown_placeholder_returns_400(self, client, tmp_path, monkeypatch):
        monkeypatch.setattr("app.prompts._prompt_loader._OVERRIDE_DIR", tmp_path)
        async with client:
            resp = await client.put(
                "/api/v1/config/prompts/extract_jd_intel/composer",
                json={"system": "s", "user": "Hello $not_a_declared_variable"},
            )
        assert resp.status_code == 400


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
