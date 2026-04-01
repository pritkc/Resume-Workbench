"""Integration tests for application pack endpoints."""

from __future__ import annotations

import copy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.schemas.models import ImproveDiffResult


@pytest.fixture
def client():
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


def _fake_resume_record(sample_resume: dict) -> dict:
    return {
        "resume_id": "res-123",
        "content": "# Jane Doe\nSenior Backend Engineer",
        "content_type": "md",
        "filename": "resume.md",
        "is_master": True,
        "parent_id": None,
        "processed_data": copy.deepcopy(sample_resume),
        "processing_status": "ready",
        "cover_letter": None,
        "outreach_message": None,
        "title": "Jane Doe Resume",
        "original_markdown": "# Jane Doe\nSenior Backend Engineer",
        "created_at": "2026-01-01T00:00:00Z",
        "updated_at": "2026-01-01T00:00:00Z",
    }


def _fake_refinement_result(refined_data: dict) -> SimpleNamespace:
    return SimpleNamespace(
        refined_data=refined_data,
        passes_completed=1,
        keyword_analysis=SimpleNamespace(injectable_keywords=[]),
        ai_phrases_removed=[],
        alignment_report=SimpleNamespace(violations=[]),
        final_match_percentage=88.0,
    )


@pytest.mark.asyncio
async def test_preview_generates_application_pack_metadata(sample_resume: dict, client):
    improved = copy.deepcopy(sample_resume)
    improved["summary"] = "Tailored summary"
    improved["additional"]["technicalSkills"] = improved["additional"]["technicalSkills"] + [
        "BogusSkill"
    ]
    refined = copy.deepcopy(improved)
    refined["additional"]["technicalSkills"] = [
        skill for skill in refined["additional"]["technicalSkills"] if skill != "BogusSkill"
    ]

    with (
        patch("app.routers.resumes.db") as mock_db,
        patch("app.routers.resumes.extract_job_keywords", new=AsyncMock(return_value={"keywords": ["FastAPI"]})),
        patch(
            "app.routers.resumes.run_critic_pass",
            new=AsyncMock(
                return_value={
                    "priority_keywords": ["FastAPI"],
                    "recruiter_gaps": ["Tighter summary"],
                    "strengthen_bullets": ["API impact"],
                    "avoid_claims": ["Kubernetes"],
                    "summary": "Focus on platform work",
                }
            ),
        ),
        patch(
            "app.routers.resumes.generate_resume_diffs",
            new=AsyncMock(return_value=ImproveDiffResult(changes=[], strategy_notes="")),
        ),
        patch("app.routers.resumes.apply_diffs", return_value=(improved, [], [])),
        patch("app.routers.resumes.verify_diff_result", return_value=[]),
        patch("app.routers.resumes.calculate_keyword_match", return_value=55.0),
        patch(
            "app.routers.resumes.refine_resume",
            new=AsyncMock(return_value=_fake_refinement_result(refined)),
        ),
        patch(
            "app.routers.resumes.generate_improvements",
            return_value=[{"suggestion": "Focus on FastAPI", "lineNumber": 1}],
        ),
        patch(
            "app.routers.resumes._generate_auxiliary_messages",
            new=AsyncMock(return_value=("Cover letter", "Outreach", "Tailored Title", [])),
        ),
        patch("app.routers.resumes.render_resume_bundle", return_value=SimpleNamespace()),
        patch(
            "app.routers.resumes.store_rendercv_bundle",
            return_value=[
                {
                    "artifact_id": "art-preview-1",
                    "kind": "resume_preview_png",
                    "mime_type": "image/png",
                    "file_name": "preview.png",
                    "url": "/api/v1/artifacts/art-preview-1",
                }
            ],
        ),
    ):
        mock_db.get_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "Senior Backend Engineer",
            "preview_hashes": {},
        }
        mock_db.update_job.return_value = {"job_id": "job-123"}
        mock_db.get_master_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.create_application_pack.return_value = {"pack_id": "pack-123"}
        mock_db.create_generation_run.return_value = {"generation_run_id": "run-123"}
        mock_db.update_generation_run.return_value = {"generation_run_id": "run-123"}
        mock_db.update_application_pack.return_value = {"pack_id": "pack-123"}

        async with client:
            response = await client.post(
                "/api/v1/application-packs/preview",
                json={"resume_id": "res-123", "job_id": "job-123"},
            )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["application_pack_id"] == "pack-123"
    assert data["generation_run_id"] == "run-123"
    assert data["artifacts"][0]["artifact_id"] == "art-preview-1"
    assert "BogusSkill" not in data["resume_preview"]["additional"]["technicalSkills"]


@pytest.mark.asyncio
async def test_confirm_persists_tailored_resume_and_pack_metadata(sample_resume: dict, client):
    with (
        patch("app.routers.resumes.db") as mock_db,
        patch(
            "app.routers.resumes._generate_auxiliary_messages",
            new=AsyncMock(return_value=("Cover letter", "Outreach", "Tailored Title", [])),
        ),
        patch("app.routers.resumes.render_resume_bundle", return_value=SimpleNamespace()),
        patch(
            "app.routers.resumes.store_rendercv_bundle",
            return_value=[
                {
                    "artifact_id": "art-final-1",
                    "kind": "resume_pdf",
                    "mime_type": "application/pdf",
                    "file_name": "resume.pdf",
                    "url": "/api/v1/artifacts/art-final-1",
                }
            ],
        ),
    ):
        mock_db.get_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "Senior Backend Engineer",
            "preview_hashes": {"default": "allowed-hash"},
        }
        mock_db.create_resume.return_value = {
            **_fake_resume_record(sample_resume),
            "resume_id": "tailored-123",
            "content": "{}",
        }
        mock_db.create_improvement.return_value = {"request_id": "legacy-run"}
        mock_db.create_generation_run.return_value = {"generation_run_id": "confirm-run-123"}
        mock_db.update_application_pack.return_value = {"pack_id": "pack-123"}

        with patch("app.routers.resumes._hash_improved_data", return_value="allowed-hash"):
            async with client:
                response = await client.post(
                    "/api/v1/application-packs/confirm",
                    json={
                        "resume_id": "res-123",
                        "job_id": "job-123",
                        "application_pack_id": "pack-123",
                        "generation_run_id": "preview-run-123",
                        "improved_data": sample_resume,
                        "improvements": [{"suggestion": "Focus on FastAPI", "lineNumber": 1}],
                    },
                )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["resume_id"] == "tailored-123"
    assert data["application_pack_id"] == "pack-123"
    assert data["generation_run_id"] == "confirm-run-123"
    assert data["artifacts"][0]["artifact_id"] == "art-final-1"


@pytest.mark.asyncio
async def test_confirm_rejects_modified_personal_info(sample_resume: dict, client):
    changed_resume = copy.deepcopy(sample_resume)
    changed_resume["personalInfo"]["email"] = "different@example.com"

    with patch("app.routers.resumes.db") as mock_db:
        mock_db.get_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "Senior Backend Engineer",
            "preview_hashes": {"default": "allowed-hash"},
        }

        with patch("app.routers.resumes._hash_improved_data", return_value="allowed-hash"):
            async with client:
                response = await client.post(
                    "/api/v1/application-packs/confirm",
                    json={
                        "resume_id": "res-123",
                        "job_id": "job-123",
                        "application_pack_id": "pack-123",
                        "generation_run_id": "preview-run-123",
                        "improved_data": changed_resume,
                        "improvements": [{"suggestion": "Focus on FastAPI"}],
                    },
                )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_application_packs_supports_company_role_and_date_filters(client):
    with patch("app.routers.application_packs.db") as mock_db:
        mock_db.list_application_packs.return_value = [
            {
                "pack_id": "pack-123",
                "base_resume_id": "res-123",
                "job_id": "job-123",
                "tailored_resume_id": "tailored-123",
                "generation_run_id": "run-123",
                "status": "confirmed",
                "company": "Acme",
                "role": "Backend Engineer",
                "location": "Remote",
                "theme_settings": {
                    "theme_id": "classic",
                    "page_size": "A4",
                    "density_profile": "balanced",
                    "bold_keywords": False,
                    "accent_color": "blue",
                    "show_contact_icons": False,
                    "margins_mm": {"top": 10, "bottom": 10, "left": 10, "right": 10},
                },
                "created_at": "2026-04-01T00:00:00Z",
                "updated_at": "2026-04-01T00:00:00Z",
                "confirmed_at": "2026-04-01T01:00:00Z",
            }
        ]

        async with client:
            response = await client.get(
                "/api/v1/application-packs",
                params={
                    "company": "acme",
                    "role": "backend",
                    "created_from": "2026-04-01T00:00:00Z",
                    "created_to": "2026-04-02T00:00:00Z",
                },
            )

    assert response.status_code == 200
    mock_db.list_application_packs.assert_called_once()
    data = response.json()["data"]
    assert data[0]["company"] == "Acme"
    assert data[0]["role"] == "Backend Engineer"
