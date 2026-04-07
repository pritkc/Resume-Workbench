"""Integration tests for application pack endpoints."""

from __future__ import annotations

import copy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.additional_groups import normalize_additional_groups


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


def _group_items(resume_data: dict, group_id: str) -> list[str]:
    resume_data["additional"] = normalize_additional_groups(resume_data.get("additional"))
    for group in resume_data["additional"]["groups"]:
        if group["id"] == group_id:
            return group["items"]
    raise AssertionError(f"Missing additional group: {group_id}")


def _fake_tailoring_result(
    resume_data: dict,
    warnings: list[str] | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        resume_data=copy.deepcopy(resume_data),
        warnings=warnings or [],
        response_contract=None,
        used_structured_resume_input=True,
    )


@pytest.mark.asyncio
async def test_preview_generates_application_pack_metadata(sample_resume: dict, client):
    improved = copy.deepcopy(sample_resume)
    improved["summary"] = "Tailored summary"
    _group_items(improved, "technicalSkills").append("BogusSkill")
    service_output = copy.deepcopy(improved)
    _group_items(service_output, "technicalSkills").remove("BogusSkill")

    with (
        patch("app.routers.resumes.db") as mock_db,
        patch("app.routers.resumes.extract_job_keywords", new=AsyncMock(return_value={"keywords": ["FastAPI"]})),
        patch(
            "app.routers.resumes.generate_tailored_resume",
            new=AsyncMock(return_value=_fake_tailoring_result(service_output)),
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
        mock_db.get_application_pack.return_value = None
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
    technical_group = next(
        group
        for group in data["resume_preview"]["additional"]["groups"]
        if group["id"] == "technicalSkills"
    )
    assert "BogusSkill" not in technical_group["items"]


@pytest.mark.asyncio
async def test_preview_uses_generation_defaults_and_request_scoped_flags(
    sample_resume: dict, client
):
    improved = copy.deepcopy(sample_resume)
    improved["summary"] = "Tailored summary"
    auxiliary_messages = AsyncMock(
        return_value=("Cover letter", None, "Tailored Title", [])
    )

    with (
        patch("app.routers.resumes.db") as mock_db,
        patch(
            "app.routers.resumes._load_config",
            return_value={
                "default_prompt_id": "keywords",
                "generation_defaults": {
                    "include_cover_letter": False,
                    "include_outreach_message": True,
                    "prompt_id": "full",
                },
            },
        ),
        patch(
            "app.routers.resumes.extract_job_keywords",
            new=AsyncMock(return_value={"keywords": ["FastAPI"]}),
        ),
        patch(
            "app.routers.resumes.generate_tailored_resume",
            new=AsyncMock(return_value=_fake_tailoring_result(improved)),
        ),
        patch(
            "app.routers.resumes.generate_improvements",
            return_value=[{"suggestion": "Focus on FastAPI", "lineNumber": 1}],
        ),
        patch("app.routers.resumes._generate_auxiliary_messages", new=auxiliary_messages),
        patch("app.routers.resumes.render_resume_bundle", return_value=SimpleNamespace()),
        patch("app.routers.resumes.store_rendercv_bundle", return_value=[]),
    ):
        mock_db.get_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.get_job.return_value = {
            "job_id": "job-123",
            "content": "Senior Backend Engineer",
            "preview_hashes": {},
        }
        mock_db.get_application_pack.return_value = None
        mock_db.update_job.return_value = {"job_id": "job-123"}
        mock_db.get_master_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.create_application_pack.return_value = {"pack_id": "pack-123"}
        mock_db.create_generation_run.return_value = {"generation_run_id": "run-123"}
        mock_db.update_generation_run.return_value = {"generation_run_id": "run-123"}
        mock_db.update_application_pack.return_value = {"pack_id": "pack-123"}

        async with client:
            response = await client.post(
                "/api/v1/application-packs/preview",
                json={
                    "resume_id": "res-123",
                    "job_id": "job-123",
                    "include_cover_letter": True,
                    "include_outreach_message": False,
                },
            )

    assert response.status_code == 200
    assert mock_db.create_generation_run.call_args.kwargs["prompt_id"] == "full"
    assert auxiliary_messages.await_args.args[3:] == ("en", True, False)


@pytest.mark.asyncio
async def test_preview_uses_primary_full_generation(
    sample_resume: dict, client
):
    improved = copy.deepcopy(sample_resume)
    improved["summary"] = "Fallback tailored summary"
    primary_generate = AsyncMock(return_value=_fake_tailoring_result(improved))

    with (
        patch("app.routers.resumes.db") as mock_db,
        patch("app.routers.resumes.extract_job_keywords", new=AsyncMock(return_value={"keywords": ["FastAPI"]})),
        patch("app.routers.resumes.generate_tailored_resume", new=primary_generate),
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
        mock_db.get_application_pack.return_value = None
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
    assert data["resume_preview"]["summary"] == "Fallback tailored summary"
    assert data["refinement_attempted"] is False
    assert data["refinement_successful"] is False
    primary_generate.assert_awaited_once()


@pytest.mark.asyncio
async def test_confirm_accepts_round_tripped_preview_payload(sample_resume: dict, client):
    improved = copy.deepcopy(sample_resume)
    improved["summary"] = "Round-tripped tailored summary"
    improved.pop("sectionMeta", None)
    improved.pop("customSections", None)

    job_record = {
        "job_id": "job-123",
        "content": "Senior Backend Engineer",
        "preview_hashes": {},
    }
    application_pack = {
        "pack_id": "pack-123",
        "theme_settings": None,
    }

    def update_job(_job_id: str, updates: dict):
        job_record.update(updates)
        return job_record

    with (
        patch("app.routers.resumes.db") as mock_db,
        patch(
            "app.routers.resumes.extract_job_keywords",
            new=AsyncMock(return_value={"keywords": ["FastAPI"]}),
        ),
        patch(
            "app.routers.resumes.generate_tailored_resume",
            new=AsyncMock(return_value=_fake_tailoring_result(improved)),
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
            side_effect=[
                [
                    {
                        "artifact_id": "art-preview-1",
                        "kind": "resume_preview_png",
                        "mime_type": "image/png",
                        "file_name": "preview.png",
                        "url": "/api/v1/artifacts/art-preview-1",
                    }
                ],
                [
                    {
                        "artifact_id": "art-final-1",
                        "kind": "resume_pdf",
                        "mime_type": "application/pdf",
                        "file_name": "resume.pdf",
                        "url": "/api/v1/artifacts/art-final-1",
                    }
                ],
            ],
        ),
    ):
        mock_db.get_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.get_job.side_effect = lambda _job_id: job_record
        mock_db.get_application_pack.return_value = application_pack
        mock_db.update_job.side_effect = update_job
        mock_db.get_master_resume.return_value = _fake_resume_record(sample_resume)
        mock_db.create_application_pack.return_value = application_pack
        mock_db.create_generation_run.side_effect = [
            {"generation_run_id": "preview-run-123"},
            {"generation_run_id": "confirm-run-123"},
        ]
        mock_db.update_generation_run.return_value = {"generation_run_id": "preview-run-123"}
        mock_db.update_application_pack.return_value = application_pack
        mock_db.create_resume.return_value = {
            **_fake_resume_record(sample_resume),
            "resume_id": "tailored-123",
            "content": "{}",
        }
        mock_db.create_improvement.return_value = {"request_id": "legacy-run"}

        async with client:
            preview_response = await client.post(
                "/api/v1/application-packs/preview",
                json={"resume_id": "res-123", "job_id": "job-123"},
            )

            assert preview_response.status_code == 200
            preview_data = preview_response.json()["data"]

            confirm_response = await client.post(
                "/api/v1/application-packs/confirm",
                json={
                    "resume_id": "res-123",
                    "job_id": "job-123",
                    "application_pack_id": preview_data["application_pack_id"],
                    "generation_run_id": preview_data["generation_run_id"],
                    "improved_data": preview_data["resume_preview"],
                    "improvements": preview_data["improvements"],
                },
            )

    assert confirm_response.status_code == 200
    confirm_data = confirm_response.json()["data"]
    assert confirm_data["resume_id"] == "tailored-123"
    assert confirm_data["application_pack_id"] == "pack-123"
    assert confirm_data["generation_run_id"] == "confirm-run-123"


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
        mock_db.get_application_pack.return_value = {
            "pack_id": "pack-123",
            "theme_settings": None,
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
        mock_db.get_application_pack.return_value = {"pack_id": "pack-123", "theme_settings": None}

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
