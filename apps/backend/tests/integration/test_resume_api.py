"""Integration tests for resume CRUD endpoints."""
import re
from unittest.mock import patch, AsyncMock, MagicMock

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.resume_codes import derive_resume_code


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture
def mock_resume_record(sample_resume):
    """A resume DB record with all fields."""
    return {
        "resume_id": "res-123",
        "resume_code": "Q7K2MW",
        "content": "# Jane Doe\nSenior Backend Engineer",
        "content_type": "md",
        "filename": "resume.pdf",
        "is_active": True,
        "is_pinned": False,
        "pinned_at": None,
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
        "cv_metadata": None,
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
        assert data["resume_code"] == "Q7K2MW"
        assert data["processed_resume"] is not None
        assert data["processed_resume"]["summary"] != ""
        assert data["application_pack_id"] == "pack-123"
        assert data["theme_settings"]["theme_id"] == "classic"

    @patch("app.routers.resumes.db")
    async def test_fetch_existing_resume_surfaces_rendercv_alias_fields(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = mock_resume_record

        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})

        assert resp.status_code == 200
        processed = resp.json()["data"]["processed_resume"]
        assert processed["personalInfo"]["headline"] == "Senior Backend Engineer"
        assert processed["personalInfo"]["profileLinks"] == [
            {
                "label": "Website",
                "url": "https://janedoe.dev",
                "fontawesome_icon": "link",
                "fontAwesomeIcon": "link",
            },
            {
                "label": "LinkedIn",
                "url": "https://linkedin.com/in/janedoe",
                "fontawesome_icon": "linkedin-in",
                "fontAwesomeIcon": "linkedin-in",
            },
            {
                "label": "GitHub",
                "url": "https://github.com/janedoe",
                "fontawesome_icon": "github",
                "fontAwesomeIcon": "github",
            },
        ]
        assert processed["workExperience"][0]["position"] == "Senior Backend Engineer"
        assert processed["workExperience"][0]["date"] == "Jan 2021 - Present"
        assert processed["workExperience"][0]["highlights"] == [
            "Built REST APIs serving 50K requests/day using Python and FastAPI",
            "Led migration from monolith to microservices architecture",
            "Mentored 3 junior developers on backend best practices",
        ]
        assert processed["personalProjects"][0]["techStack"] == "Creator & Maintainer"
        assert processed["personalProjects"][0]["date"] == "Mar 2021 - Present"
        assert processed["personalProjects"][0]["highlights"] == [
            "CLI tool generating API clients from OpenAPI specs",
            "500+ GitHub stars, used by 30+ companies",
        ]

    @patch("app.routers.resumes.db")
    async def test_fetch_existing_resume_profile_links_override_stale_legacy_fields(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = {
            **mock_resume_record,
            "processed_data": {
                **mock_resume_record["processed_data"],
                "personalInfo": {
                    **mock_resume_record["processed_data"]["personalInfo"],
                    "profileLinks": [
                        {
                            "label": "LinkedIn / pritkc",
                            "url": "https://linkedin.com/in/pritkc",
                        },
                        {
                            "label": "GitHub / pritkc",
                            "url": "https://github.com/pritkc",
                        },
                    ],
                },
            },
        }

        async with client:
            resp = await client.get("/api/v1/resumes", params={"resume_id": "res-123"})

        assert resp.status_code == 200
        personal_info = resp.json()["data"]["processed_resume"]["personalInfo"]
        assert personal_info["profileLinks"] == [
            {
                "label": "LinkedIn / pritkc",
                "url": "https://linkedin.com/in/pritkc",
            },
            {
                "label": "GitHub / pritkc",
                "url": "https://github.com/pritkc",
            },
        ]
        assert personal_info["linkedin"] == ""
        assert personal_info["github"] == ""
        assert personal_info["customConnections"] == [
            {
                "placeholder": "LinkedIn / pritkc",
                "url": "https://linkedin.com/in/pritkc",
                "fontawesome_icon": None,
                "fontAwesomeIcon": None,
            },
            {
                "placeholder": "GitHub / pritkc",
                "url": "https://github.com/pritkc",
                "fontawesome_icon": None,
                "fontAwesomeIcon": None,
            },
        ]

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
        assert data["theme_settings"]["theme_id"] == "moderncv"
        assert data["theme_settings"]["page_size"] == "LETTER"
        assert data["theme_settings"]["density_profile"] == "compact"
        assert data["theme_settings"]["bold_keywords"] is False
        assert data["theme_settings"]["accent_color"] == "green"
        assert data["theme_settings"]["show_contact_icons"] is True
        assert data["theme_settings"]["margins_mm"] == {
            "top": 12,
            "bottom": 14,
            "left": 11,
            "right": 13,
        }
        assert (
            data["theme_settings"]["theme_profiles"]["moderncv"]["density_profile"]
            == "compact"
        )


class TestUploadResume:
    @patch("app.routers.resumes.parse_document", new_callable=AsyncMock)
    @patch("app.routers.resumes.parse_resume_to_json", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_upload_and_fetch_sample_pdf(
        self,
        mock_db,
        mock_parse_resume,
        mock_parse_document,
        client,
        sample_resume,
    ):
        sample_filename = "sample-resume.pdf"
        sample_markdown = "# PRIT CHAKALASIYA\nSenior Backend Engineer"
        state: dict[str, object] = {}

        async def create_resume_atomic_active(**kwargs):
            state.update(kwargs)
            return {
                "resume_id": "res-sample",
                "processing_status": "processing",
                "is_active": True,
            }

        def update_resume(resume_id, updates):
            state.update(updates)
            return {
                "resume_id": resume_id,
                "processing_status": state.get("processing_status", "pending"),
                "is_active": True,
            }

        def get_resume(resume_id):
            return {
                "resume_id": resume_id,
                "content": state["content"],
                "content_type": state["content_type"],
                "filename": sample_filename,
                "is_active": True,
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

        mock_parse_document.return_value = sample_markdown
        mock_parse_resume.return_value = sample_resume
        mock_db.create_resume_atomic_active = AsyncMock(side_effect=create_resume_atomic_active)
        mock_db.update_resume.side_effect = update_resume
        mock_db.get_resume.side_effect = get_resume

        async with client:
            upload = await client.post(
                "/api/v1/resumes/upload",
                files={
                    "file": (
                        sample_filename,
                        b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF",
                        "application/pdf",
                    )
                },
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
        mock_db.create_resume_atomic_active = AsyncMock(return_value={
            "resume_id": "res-123",
            "processing_status": "processing",
            "is_active": True,
        })
        mock_db.update_resume.return_value = {
            "resume_id": "res-123",
            "processing_status": "ready",
            "is_active": True,
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


class TestDraftResumeFlows:
    @patch("app.routers.resumes.db")
    async def test_normalize_resume_draft_returns_yaml_sections(
        self, mock_db, client, mock_resume_record, sample_resume
    ):
        mock_db.get_resume.return_value = mock_resume_record

        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/normalize",
                json={
                    "resume_id": "res-123",
                    "processed_resume": sample_resume,
                    "theme_settings": mock_resume_record["theme_settings"],
                },
            )

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["data"]["processed_resume"]["summary"] == sample_resume["summary"]
        assert payload["yaml_sections"]["cv"].startswith("cv:")
        assert payload["yaml_sections"]["design"].startswith("design:")

    async def test_normalize_resume_draft_returns_full_design_yaml_for_theme_profiles(
        self, client, sample_resume
    ):
        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/normalize",
                json={
                    "processed_resume": sample_resume,
                    "theme_settings": {
                        "theme_id": "moderncv",
                        "bold_keywords": False,
                        "locale": {"language": "english"},
                        "settings": {"current_date": "today"},
                        "theme_profiles": {},
                    },
                },
            )

        assert resp.status_code == 200
        design_yaml = resp.json()["yaml_sections"]["design"]
        assert "show_footer: true" in design_yaml
        assert "show_top_note: true" in design_yaml
        assert "degree_column: null" in design_yaml

    @patch("app.routers.resumes.db")
    async def test_normalize_resume_draft_preserves_custom_additional_group_labels_from_yaml(
        self, mock_db, client, mock_resume_record
    ):
        mock_db.get_resume.return_value = mock_resume_record

        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/normalize",
                json={
                    "resume_id": "res-123",
                    "yaml_sections": {
                        "cv": (
                            "cv:\n"
                            "  name: Jane Doe\n"
                            "  sections:\n"
                            "    skills:\n"
                            "      - label: Languages & Frameworks\n"
                            "        details:\n"
                            "          - English\n"
                            "          - Python\n"
                        ),
                        "design": "design:\n  theme: classic\n",
                        "locale": "locale:\n  language: english\n",
                        "settings": "settings:\n  current_date: today\n",
                    },
                },
            )

        assert resp.status_code == 200
        payload = resp.json()
        groups = payload["data"]["processed_resume"]["additional"]["groups"]
        languages_group = next(group for group in groups if group["label"] == "Languages & Frameworks")
        assert languages_group["label"] == "Languages & Frameworks"
        assert languages_group["items"] == ["English", "Python"]
        assert "Languages & Frameworks" in payload["yaml_sections"]["cv"]

    async def test_normalize_resume_draft_profile_links_override_stale_social_fields_in_yaml(
        self, client, sample_resume
    ):
        draft_resume = {
            **sample_resume,
            "personalInfo": {
                **sample_resume["personalInfo"],
                "linkedin": "stale-linkedin",
                "github": "stale-github",
                "socialNetworks": [
                    {"network": "LinkedIn", "username": "stale-linkedin"},
                    {"network": "GitHub", "username": "stale-github"},
                ],
                "profileLinks": [
                    {
                        "label": "LinkedIn / pritkc",
                        "url": "https://linkedin.com/in/pritkc",
                    },
                    {
                        "label": "GitHub / pritkc",
                        "url": "https://github.com/pritkc",
                    },
                ],
            },
        }

        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/normalize",
                json={
                    "processed_resume": draft_resume,
                    "theme_settings": {"theme_id": "classic"},
                },
            )

        assert resp.status_code == 200
        payload = resp.json()
        personal_info = payload["data"]["processed_resume"]["personalInfo"]
        assert personal_info["linkedin"] == ""
        assert personal_info["github"] == ""
        assert personal_info["profileLinks"] == [
            {
                "label": "LinkedIn / pritkc",
                "url": "https://linkedin.com/in/pritkc",
            },
            {
                "label": "GitHub / pritkc",
                "url": "https://github.com/pritkc",
            },
        ]
        assert personal_info["customConnections"] == [
            {
                "placeholder": "LinkedIn / pritkc",
                "url": "https://linkedin.com/in/pritkc",
                "fontawesome_icon": None,
                "fontAwesomeIcon": None,
            },
            {
                "placeholder": "GitHub / pritkc",
                "url": "https://github.com/pritkc",
                "fontawesome_icon": None,
                "fontAwesomeIcon": None,
            },
        ]
        cv_yaml = payload["yaml_sections"]["cv"]
        assert "placeholder: LinkedIn / pritkc" in cv_yaml
        assert "placeholder: GitHub / pritkc" in cv_yaml
        assert "username: stale-linkedin" not in cv_yaml
        assert "username: stale-github" not in cv_yaml

    @patch("app.routers.resumes.store_rendercv_bundle")
    @patch("app.routers.resumes.render_resume_bundle")
    async def test_render_resume_draft_preview_accepts_yaml_sections(
        self, mock_render_bundle, mock_store_bundle, client
    ):
        mock_render_bundle.return_value = MagicMock()
        mock_store_bundle.return_value = [
            {
                "artifact_id": "artifact-preview",
                "kind": "resume_preview_png",
                "mime_type": "image/png",
                "file_name": "preview.png",
                "url": "/api/v1/artifacts/artifact-preview",
            },
            {
                "artifact_id": "artifact-pdf",
                "kind": "resume_pdf",
                "mime_type": "application/pdf",
                "file_name": "resume.pdf",
                "url": "/api/v1/artifacts/artifact-pdf",
            },
        ]

        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/render-preview",
                json={
                    "yaml_sections": {
                        "cv": "cv:\n  name: Jane Doe\n  sections:\n    summary:\n      - Senior backend engineer\n",
                        "design": "design:\n  theme: classic\n",
                        "locale": "locale:\n  language: english\n",
                        "settings": "settings:\n  current_date: today\n",
                    }
                },
            )

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["resume_id"] == "draft"
        assert payload["pdf_artifact"]["artifact_id"] == "artifact-pdf"
        mock_render_bundle.assert_called_once()

    @patch("app.routers.resumes.db")
    async def test_save_resume_draft_persists_yaml_changes(
        self, mock_db, client, mock_resume_record
    ):
        state = {
            **mock_resume_record,
            "processed_data": mock_resume_record["processed_data"],
            "theme_settings": mock_resume_record["theme_settings"],
        }

        def update_resume(resume_id, updates):
            state.update(updates)
            return {
                **mock_resume_record,
                **state,
                "resume_id": resume_id,
                "created_at": mock_resume_record["created_at"],
            }

        mock_db.get_resume.return_value = mock_resume_record
        mock_db.update_resume.side_effect = update_resume

        async with client:
            resp = await client.patch(
                "/api/v1/resumes/res-123/draft",
                json={
                    "resume_id": "res-123",
                    "yaml_sections": {
                        "cv": (
                            "cv:\n"
                            "  name: Jane Doe\n"
                            "  headline: Senior Backend Engineer\n"
                            "  email: jane@example.com\n"
                            "  sections:\n"
                            "    summary:\n"
                            "      - Updated summary from YAML\n"
                        ),
                        "design": "design:\n  theme: classic\n",
                        "locale": "locale:\n  language: english\n",
                        "settings": "settings:\n  current_date: today\n",
                    },
                },
            )

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["data"]["processed_resume"]["summary"] == "Updated summary from YAML"
        assert state["processed_data"]["summary"] == "Updated summary from YAML"

    async def test_normalize_resume_draft_returns_section_and_line_for_invalid_yaml(
        self, client
    ):
        async with client:
            resp = await client.post(
                "/api/v1/resumes/draft/normalize",
                json={
                    "yaml_sections": {
                        "cv": (
                            "cv:\n"
                            "  name: Jane Doe\n"
                            "  sections:\n"
                            "    summary:\n"
                            "      - Broken entry\n"
                            "    skills: [Python\n"
                        ),
                        "design": "design:\n  theme: classic\n",
                        "locale": "locale:\n  language: english\n",
                        "settings": "settings:\n  current_date: today\n",
                    }
                },
            )

        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert detail["type"] == "yaml_validation"
        assert detail["section"] == "cv"
        assert detail["line"] == 7
        assert "invalid" in detail["message"].lower()


class TestListResumes:
    """GET /api/v1/resumes/list"""

    @patch("app.routers.resumes.db")
    async def test_list_excludes_active_when_requested(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_active": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_active": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        mock_db.list_application_packs.return_value = []
        mock_db.get_active_resume.return_value = {
            "resume_id": "master",
            "is_active": True,
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        }
        async with client:
            resp = await client.get("/api/v1/resumes/list", params={"include_active": "false"})
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 1
        assert data[0]["resume_id"] == "tailored-1"
        assert data[0]["resume_code"] == derive_resume_code("tailored-1")

    @patch("app.routers.resumes.db")
    async def test_list_includes_all_by_default(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {"resume_id": "master", "is_active": True, "created_at": "2026-01-01", "updated_at": "2026-01-01"},
            {"resume_id": "tailored-1", "is_active": False, "created_at": "2026-01-02", "updated_at": "2026-01-02"},
        ]
        mock_db.list_application_packs.return_value = []
        mock_db.get_active_resume.return_value = {
            "resume_id": "master",
            "is_active": True,
            "created_at": "2026-01-01",
            "updated_at": "2026-01-01",
        }
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert len(data) == 2
        assert all(
            isinstance(item.get("resume_code"), str) and len(item["resume_code"]) == 6
            for item in data
        )

    @patch("app.routers.resumes.db")
    async def test_list_returns_target_metadata(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "tailored-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": "Backend Engineer @ Acme",
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "company": "Acme",
                "role": "Backend Engineer",
                "location": "Mountain View, CA",
            }
        ]
        mock_db.get_active_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_company"] == "Acme"
        assert item["target_role"] == "Backend Engineer"
        assert item["target_location"] == "Mountain View, CA"

    @patch("app.routers.resumes.db")
    async def test_list_cv_metadata_overrides_targets(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "dup-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": "Backend Engineer @ Acme",
                "cv_metadata": (
                    "metadata:\n"
                    '  role: "Staff Engineer"\n'
                    '  company: "Contoso"\n'
                    '  location: "Berlin"\n'
                    "  bold_keywords: []\n"
                ),
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "company": "Acme",
                "role": "Backend Engineer",
                "location": "Mountain View, CA",
            }
        ]
        mock_db.get_active_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_company"] == "Contoso"
        assert item["target_role"] == "Staff Engineer"
        assert item["target_location"] == "Berlin"

    @patch("app.routers.resumes.db")
    async def test_list_sanitizes_polluted_target_metadata(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "tailored-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": None,
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "company": "https://www",
                "role": "range of benefits. Learn more",
                "location": "This role is based out of our Seattle office and follows a hybrid schedule.",
            }
        ]
        mock_db.get_active_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_company"] is None
        assert item["target_role"] is None
        assert item["target_location"] is None

    @patch("app.routers.resumes.db")
    async def test_list_uses_title_fallback_for_role_when_pack_metadata_missing(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "tailored-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": "Senior Backend Engineer",
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "company": None,
                "role": None,
                "location": None,
            }
        ]
        mock_db.get_active_resume.return_value = None
        async with client:
            resp = await client.get("/api/v1/resumes/list")
        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_role"] == "Senior Backend Engineer"

    @patch("app.routers.resumes.db")
    async def test_list_uses_job_metadata_when_pack_company_missing(self, mock_db, client):
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "tailored-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": "Senior Backend Engineer",
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "job_id": "job-123",
                "company": None,
                "role": None,
                "location": None,
            }
        ]
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "company": "Acme",
            "role": "Senior Backend Engineer",
            "location": "Mountain View, CA",
        }
        mock_db.get_active_resume.return_value = None

        async with client:
            resp = await client.get("/api/v1/resumes/list")

        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_company"] == "Acme"
        assert item["target_role"] == "Senior Backend Engineer"
        assert item["target_location"] == "Mountain View, CA"

    @patch("app.routers.resumes.db")
    async def test_list_uses_job_keywords_when_job_columns_empty(self, mock_db, client):
        """Dashboard merge must use JD + job_keywords like preview/confirm, not only DB columns."""
        mock_db.list_resumes.return_value = [
            {
                "resume_id": "tailored-1",
                "is_active": False,
                "application_pack_id": "pack-123",
                "created_at": "2026-01-02",
                "updated_at": "2026-01-02",
                "title": None,
            }
        ]
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "job_id": "job-123",
                "company": None,
                "role": None,
                "location": None,
            }
        ]
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "We are hiring a Backend Engineer at Acme Corp in Mountain View, CA.",
            "company": None,
            "role": None,
            "location": None,
            "job_keywords": {
                "core_title": "Backend Engineer",
                "company_name": "Acme Corp",
                "location": "Mountain View, CA",
            },
        }
        mock_db.get_active_resume.return_value = None

        async with client:
            resp = await client.get("/api/v1/resumes/list")

        assert resp.status_code == 200
        item = resp.json()["data"][0]
        assert item["target_company"] == "Acme Corp"
        assert item["target_role"] == "Backend Engineer"
        assert item["target_location"] == "Mountain View, CA"


class TestDuplicateResume:
    """POST /api/v1/resumes/{resume_id}/duplicate"""

    @patch("app.routers.resumes.db")
    async def test_duplicate_returns_summary(self, mock_db, client, mock_resume_record):
        dup = {
            **mock_resume_record,
            "resume_id": "res-999",
            "is_active": False,
            "parent_id": None,
            "title": "Copy title",
            "application_pack_id": None,
        }
        mock_db.duplicate_resume.return_value = dup
        mock_db.get_resume.return_value = dup
        mock_db.list_application_packs.return_value = []
        async with client:
            resp = await client.post("/api/v1/resumes/res-123/duplicate", json={})
        assert resp.status_code == 200
        body = resp.json()
        assert body["resume_id"] == "res-999"
        assert body["is_active"] is False

    @patch("app.routers.resumes.db")
    async def test_duplicate_missing_returns_404(self, mock_db, client):
        mock_db.duplicate_resume.return_value = None
        async with client:
            resp = await client.post("/api/v1/resumes/missing/duplicate", json={})
        assert resp.status_code == 404


class TestDeleteResume:
    """DELETE /api/v1/resumes/{resume_id}"""

    @patch("app.routers.resumes.db")
    async def test_delete_existing_resume(self, mock_db, client):
        mock_db.get_resume.return_value = {"resume_id": "res-123", "is_active": False}
        mock_db.count_resumes.return_value = 2
        mock_db.delete_resume.return_value = True
        async with client:
            resp = await client.delete("/api/v1/resumes/res-123")
        assert resp.status_code == 200

    @patch("app.routers.resumes.db")
    async def test_delete_nonexistent_returns_404(self, mock_db, client):
        mock_db.get_resume.return_value = None
        async with client:
            resp = await client.delete("/api/v1/resumes/nonexistent")
        assert resp.status_code == 404

    @patch("app.routers.resumes.db")
    async def test_delete_active_blocked_when_other_resumes_exist(self, mock_db, client):
        mock_db.get_resume.return_value = {"resume_id": "res-123", "is_active": True}
        mock_db.count_resumes.return_value = 2
        async with client:
            resp = await client.delete("/api/v1/resumes/res-123")
        assert resp.status_code == 400


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


class TestGenerateAuxiliaryPackage:
    """POST /api/v1/resumes/{resume_id}/generate-auxiliary-package"""

    @patch("app.routers.resumes.generate_cover_letter_and_outreach", new_callable=AsyncMock)
    @patch("app.routers.resumes.db")
    async def test_generate_auxiliary_package_overwrites_both_fields(
        self, mock_db, mock_generate_auxiliary, client, mock_resume_record
    ):
        tailored_resume = {**mock_resume_record, "parent_id": "master-1", "is_active": False}
        mock_db.get_resume.return_value = tailored_resume
        mock_db.get_improvement_by_tailored_resume.return_value = {"job_id": "job-123"}
        mock_db.get_job.return_value = {"job_id": "job-123", "content": "Senior Backend Engineer"}
        mock_generate_auxiliary.return_value = ("Tailored CL", "Tailored Outreach")
        mock_db.update_resume.return_value = {
            **tailored_resume,
            "cover_letter": "Tailored CL",
            "outreach_message": "Tailored Outreach",
        }

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/generate-auxiliary-package")

        assert resp.status_code == 200
        payload = resp.json()
        assert payload["cover_letter"] == "Tailored CL"
        assert payload["outreach_message"] == "Tailored Outreach"
        mock_db.update_resume.assert_called_once_with(
            "res-123",
            {"cover_letter": "Tailored CL", "outreach_message": "Tailored Outreach"},
        )


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


class TestResumePdfDownload:
    @patch("app.routers.resumes.store_rendercv_bundle")
    @patch("app.routers.resumes.render_resume_bundle")
    @patch("app.routers.resumes.db")
    async def test_pdf_download_uses_professional_filename(
        self,
        mock_db,
        mock_render_bundle,
        mock_store_bundle,
        client,
        tmp_path,
        mock_resume_record,
    ):
        mock_db.get_resume.return_value = mock_resume_record
        mock_render_bundle.return_value = MagicMock()
        pdf_file = tmp_path / "resume.pdf"
        pdf_file.write_bytes(b"%PDF-1.4 test")
        mock_store_bundle.return_value = [
            {
                "kind": "resume_pdf",
                "storage_path": str(pdf_file),
            }
        ]

        async with client:
            resp = await client.post("/api/v1/resumes/res-123/pdf", json={})

        assert resp.status_code == 200
        content_disposition = resp.headers.get("content-disposition", "")
        assert re.search(
            r'filename="jane_doe_[A-Z0-9]{6}\.pdf"',
            content_disposition,
        )
