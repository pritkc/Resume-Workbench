"""Tests for backend settings behavior."""

from __future__ import annotations

import pytest

from app.config import Settings


def test_effective_database_url_requires_database_url() -> None:
    settings = Settings(_env_file=None, database_url=None)

    with pytest.raises(RuntimeError, match="DATABASE_URL is required"):
        _ = settings.effective_database_url


def test_effective_database_url_returns_configured_url() -> None:
    database_url = "postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher"
    settings = Settings(_env_file=None, database_url=database_url)

    assert settings.effective_database_url == database_url
