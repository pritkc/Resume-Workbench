"""Integration tests for resume CRUD endpoints."""

from pathlib import Path
from unittest.mock import patch, AsyncMock, MagicMock
from uuid import uuid4

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def mock_resume_record(sample_resume):
    """A resume DB record with all fields."""
    return {
        "resume_id": "res-123",
        "content": "# Jane Doe\nSenior Backend Engineer",
        "content_type": "md",
        "filename": "resume.pdf",
        "is_master": True,
        "parent_id": None,
        "application_pack_id": "pack-123",
        "processed_data": sample_resume,
        "processing_status": "ready",
        "cover_letter": None,
        "outreach_message": None,
        "title": None,
        "original_markdown": "# Jane Doe\nSenior Backend Engineer",
        "theme_settings": {
            "theme_id": "classic",
            "page_size": "A4",
            "density_profile": "balanced",
            "bold_keywords": False,
            "accent_color": "blue",
            "show_contact_icons": False,
            "margins_mm": {"top": 10, "bottom": 10, "left": 10, "right": 10},
        },
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


class TestGetResume:
    """GET /api/v1/resumes?resume_id=..."""

    @patch("app.routers.resumes.db")
    async def test_fetch_existing_resume(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["resume_id"] == "res-123"
        assert data["processed_resume"] is not None
        assert data["processed_resume"]["summary"] != ""
        assert data["application_pack_id"] == "pack-123"
        assert data["theme_settings"]["theme_id"] == "classic"

    @patch("app.routers.resumes.db")
    async def test_fetch_nonexistent_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "nonexistent"})
        assert resp.status_code == 404

    @patch("app.routers.resumes.db")
    async def test_fetch_invalid_processed_data_uses_raw_fallback_and_normalizes_legacy_theme(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = {
            **mock_resume_record,
            "content": '{"summary":"Raw JSON fallback"}',
            "content_type": "json",
            "processed_data": {"workExperience": "not-a-list"},
            "theme_settings": {
                "template": "modern-two-column",
                "pageSize": "LETTER",
                "margins": {"top": 12, "bottom": 14, "left": 11, "right": 13},
                "spacing": {"section": 2, "item": 1, "lineHeight": 2},
                "fontSize": {
                    "base": 3,
                    "headerScale": 3,
                    "headerFont": "serif",
                    "bodyFont": "sans-serif",
                },
                "compactMode": True,
                "showContactIcons": True,
                "accentColor": "green",
            },
        }
        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["processed_resume"] is None
        assert data["raw_resume"]["content"] == '{"summary":"Raw JSON fallback"}'
        assert data["theme_settings"] == {
            "theme_id": "moderncv",
            "page_size": "LETTER",
            "density_profile": "compact",
            "bold_keywords": False,
            "accent_color": "green",
            "show_contact_icons": True,
            "margins_mm": {"top": 12, "bottom": 14, "left": 11, "right": 13},
        }


class TestUploadResume:
    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_upload_and_fetch_sample_pdf(self, mock_db, mock_parse_resume, client, sample_resume):
        sample_pdf = (
            Path(__file__).resolve().parents[4] / "tests" / "Prit-Chakalasiya-DE.pdf"
        )
        state: dict[str, object] = {}

        async def create_resume_atomic_master(**kwargs):
            state.update(kwargs)
            return {
                "resume_id": "res-sample",
                "processing_status": "processing",
                "is_master": True,
            }

        def update_resume(resume_id, updates):
            state.update(updates)
            return {
                "resume_id": resume_id,
                "processing_status": state.get("processing_status", "pending"),
                "is_master": True,
            }

        def get_resume(resume_id):
            return {
                "resume_id": resume_id,
                "content": state["content"],
                "content_type": state["content_type"],
                "filename": sample_pdf.name,
                "is_master": True,
                "parent_id": None,
                "application_pack_id": None,
                "processed_data": state.get("processed_data"),
                "processing_status": state.get("processing_status", "pending"),
                "cover_letter": None,
                "outreach_message": None,
                "title": None,
                "original_markdown": state.get("original_markdown"),
                "theme_settings": None,
                "created_at": "2026-01-01T00:00:00Z",
                "updated_at": "2026-01-01T00:00:00Z",
            }

        mock_parse_resume.return_value = sample_resume
        mock_db.create_resume_atomic_master = AsyncMock(side_effect=create_resume_atomic_master)
        mock_db.update_resume.side_effect = update_resume
        mock_db.get_resume.side_effect = get_resume

        async with client:
            with sample_pdf.open("rb") as handle:
                upload = await client.post(
                    "/api/v1/resumes/upload",
                    files={"file": (sample_pdf.name, handle.read(), "application/pdf")},
                )

            assert upload.status_code == 200
            assert upload.json()["processing_status"] == "ready"

            fetch = await client.get("/api/v1/resumes", params={"resume_id": "res-sample"})

        assert fetch.status_code == 200
        data = fetch.json()["data"]
        assert "PRIT CHAKALASIYA" in data["raw_resume"]["content"]
        assert data["processed_resume"]["summary"] == sample_resume["summary"]
        assert state["original_markdown"] == state["content"]

    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.parse_document", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_upload_resume_parses_and_marks_ready(
        self, mock_db, mock_parse_document, mock_parse_resume, client, sample_resume
    ):
        mock_parse_document.return_value = "# Jane Doe\nSenior Backend Engineer"
        mock_parse_resume.return_value = sample_resume
        mock_db.create_resume_atomic_master = AsyncMock(return_value={
            "resume_id": "res-123",
            "processing_status": "processing",
            "is_master": True,
        })
        mock_db.update_resume.return_value = {
            "resume_id": "res-123",
            "processing_status": "ready",
            "is_master": True,
        }

        async with client:
            resp = await client.post(
                "/api/v1/resumes/upload",
                files={"file": ("resume.pdf", b"fake-pdf", "application/pdf")},
            )

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["resume_id"] == "res-123"
        assert payload["processing_status"] == "ready"


class TestUpdateResume:
    @patch("app.routers.resumes.db")
    async def test_update_resume_persists_processed_data(self, mock_db, client, mock_resume_record, sample_resume):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {
            **mock_resume_record,
            "content": "{}",
            "content_type": "json",
            "processed_data": sample_resume,
        }

        async with client:
            resp = await client.patch("/api/v1/resumes/res-123", json=sample_resume)

        assert resp.status_code == 200
        payload = resp.json()["data"]
        assert payload["resume_id"] == "res-123"
        assert payload["processed_resume"]["summary"] == sample_resume["summary"]


class TestListResumes:
    """GET /api/v1/resumes/list"""

    @patch("app.routers.resumes.db")
    async def test_list_excludes_master_by_default(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_master": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_master": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["resume_id"] == "tailored-1"

    @patch("app.routers.resumes.db")
    async def test_list_includes_master_when_requested(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_master": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_master": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        async with client:
            resp = await client.get("/api/v1/resumes/list", params={"include_master": True})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2


class TestDeleteResume:
    """DELETE /api/v1/resumes/{resume_id}"""

    @patch("app.routers.resumes.db")
    async def test_delete_existing_resume(self, mock_db, client):
        mock_db.delete_resume.return_value = True
        async with client:
            resp = await client.delete("/api/v1/resumes/res-123")
        assert resp.status_code == 200

    @patch("app.routers.resumes.db")
    async def test_delete_nonexistent_returns_404(self, mock_db, client):
        mock_db.delete_resume.return_value = False
        async with client:
            resp = await client.delete("/api/v1/resumes/nonexistent")
        assert resp.status_code == 404


class TestUpdateTitle:
    """PATCH /api/v1/resumes/{resume_id}/title"""

    @patch("app.routers.resumes.db")
    async def test_update_title(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "title": "New Title"}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/title", json={"title": "New Title"})
        assert resp.status_code == 200

    @patch("app.routers.resumes.db")
    async def test_update_title_nonexistent_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.patch("/api/v1/resumes/nonexistent/title", json={"title": "X"})
        assert resp.status_code == 404


class TestUpdateCoverLetter:
    """PATCH /api/v1/resumes/{resume_id}/cover-letter"""

    @patch("app.routers.resumes.db")
    async def test_update_cover_letter(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "cover_letter": "Dear hiring manager..."}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/cover-letter", json={"content": "Dear hiring manager..."})
        assert resp.status_code == 200


class TestUpdateOutreachMessage:
    """PATCH /api/v1/resumes/{resume_id}/outreach-message"""

    @patch("app.routers.resumes.db")
    async def test_update_outreach(self, mock_db, client, mock_resume_record):
        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.return_value = {**mock_resume_record, "outreach_message": "Hi, I saw your posting..."}
        async with client:
            resp = await client.patch("/api/v1/resumes/res-123/outreach-message", json={"content": "Hi, I saw your posting..."})
        assert resp.status_code == 200


class TestRetryProcessing:
    """POST /api/v1/resumes/{resume_id}/retry-processing"""

    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_retry_successful(self, mock_db, mock_parse, client, mock_resume_record, sample_resume):
        failed_record = {**mock_resume_record, "processing_status": "failed"}
        mock_db.get_resume.return_value = failed_record
        mock_parse.return_value = sample_resume
        mock_db.update_resume.return_value = {**failed_record, "processing_status": "ready", "processed_data": sample_resume}
        async with client:
            resp = await client.post("/api/v1/resumes/res-123/retry-processing")
        assert resp.status_code == 200
        data = resp.json()
        assert data["processing_status"] == "ready"

    @patch("app.routers.resumes.db")
    async def test_retry_not_failed_returns_400(self, mock_db, client, mock_resume_record):
        # processing_status is "ready", not "failed"
        mock_db.get_resume.return_value = mock_resume_record
        async with client:
            resp = await client.post("/api/v1/resumes/res-123/retry-processing")
        assert resp.status_code == 400
