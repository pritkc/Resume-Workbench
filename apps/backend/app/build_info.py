"""Application build metadata exposed by health endpoints."""

from __future__ import annotations

import os

from app import __version__


def application_version() -> str:
    """Return the release version set during the image build."""
    return os.getenv("APP_VERSION", __version__).strip() or __version__


def application_commit() -> str:
    """Return the Git commit set during the image build."""
    return os.getenv("APP_COMMIT", "development").strip() or "development"
