"""Tests for backend settings behavior."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.config import Settings
from app.routers import config as config_router


def test_effective_database_url_requires_database_url() -> None:
    settings = Settings(_env_file=None, database_url=None)

    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        _ = settings.effective_database_url


def test_effective_database_url_returns_configured_url() -> None:
    database_url = "postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher"
    settings = Settings(_env_file=None, database_url=database_url)

    assert settings.effective_database_url == database_url


def test_config_updates_are_atomic_and_do_not_lose_parallel_fields(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "config.json"
    monkeypatch.setattr(config_router, "_get_config_path", lambda: config_path)

    @config_router._serialized_config_update
    async def update_field(key: str) -> None:
        values = config_router._load_config()
        await asyncio.sleep(0.01)
        values[key] = True
        config_router._save_config(values)

    async def run_updates() -> None:
        await asyncio.gather(update_field("first"), update_field("second"))

    asyncio.run(run_updates())
    assert json.loads(config_path.read_text()) == {"first": True, "second": True}
    assert not list(tmp_path.glob("*.tmp"))


def test_invalid_config_json_fails_with_recovery_guidance(tmp_path, monkeypatch) -> None:
    config_path = tmp_path / "config.json"
    config_path.write_text("{")
    monkeypatch.setattr(config_router, "_get_config_path", lambda: config_path)

    with pytest.raises(RuntimeError, match="restore a valid settings backup"):
        config_router._load_config()
