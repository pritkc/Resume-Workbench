"""Integration tests for artifact download endpoints."""

from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@patch("app.routers.artifacts.db")
async def test_download_artifact_returns_file(mock_db, client, tmp_path: Path):
    artifact_path = tmp_path / "preview.png"
    artifact_path.write_bytes(b"png")
    mock_db.get_artifact.return_value = {
        "artifact_id": "art-123",
        "mime_type": "image/png",
        "file_name": "preview.png",
        "storage_path": str(artifact_path),
    }

    async with client:
        response = await client.get("/api/v1/artifacts/art-123")

    assert response.status_code == 200
    assert response.content == b"png"
    assert response.headers["content-type"] == "image/png"
