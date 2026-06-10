"""Unit tests for LLM config resolution."""

from unittest.mock import patch

from app.llm import get_llm_config, resolve_direct_api_base


def test_direct_gemini_ignores_stale_local_ollama_api_base() -> None:
    stored = {
        "provider": "gemini",
        "model": "gemini-2.5-flash",
        "api_key": "gemini-key",
        "api_base": "http://localhost:11434",
        "ai_route": "direct_api",
    }

    assert resolve_direct_api_base(stored, "gemini") is None


def test_get_llm_config_does_not_send_gemini_to_ollama() -> None:
    with patch(
        "app.llm._load_stored_config",
        return_value={
            "provider": "gemini",
            "model": "gemini-2.5-flash",
            "api_key": "gemini-key",
            "api_base": "http://localhost:11434",
            "ai_route": "direct_api",
        },
    ):
        config = get_llm_config()

    assert config.provider == "gemini"
    assert config.api_base is None
