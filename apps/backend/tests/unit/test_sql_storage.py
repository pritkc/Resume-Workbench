"""Tests for the SQLAlchemy-backed storage layer."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Database
from app.db.base import Base


def create_test_database(tmp_path: Path) -> Database:
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    SessionFactory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    return Database(
        session_factory=SessionFactory,
        engine=engine,
        data_dir=tmp_path / "data",
        artifact_dir=tmp_path / "artifacts",
    )


def test_resume_and_job_crud_round_trip(tmp_path: Path) -> None:
    database = create_test_database(tmp_path)

    resume = database.create_resume(
        content="# Jane Doe",
        content_type="md",
        filename="resume.md",
        is_master=True,
        processed_data={"summary": "Test"},
        processing_status="ready",
    )
    job = database.create_job(
        content="Senior Backend Engineer",
        resume_id=resume["resume_id"],
        company="Acme",
        role="Backend Engineer",
        location="Remote",
    )

    fetched_resume = database.get_resume(resume["resume_id"])
    fetched_job = database.get_job(job["job_id"])

    assert fetched_resume is not None
    assert fetched_resume["is_master"] is True
    assert fetched_resume["filename"] == "resume.md"
    assert fetched_job is not None
    assert fetched_job["company"] == "Acme"
    assert fetched_job["role"] == "Backend Engineer"


def test_generation_runs_replace_legacy_improvements(tmp_path: Path) -> None:
    database = create_test_database(tmp_path)

    source = database.create_resume(content="# Source", is_master=True)
    tailored = database.create_resume(content='{"summary": "Tailored"}', content_type="json")
    job = database.create_job(content="JD", resume_id=source["resume_id"])
    improvement = database.create_improvement(
        original_resume_id=source["resume_id"],
        tailored_resume_id=tailored["resume_id"],
        job_id=job["job_id"],
        improvements=[{"suggestion": "Add FastAPI"}],
    )

    looked_up = database.get_improvement_by_tailored_resume(tailored["resume_id"])

    assert improvement["run_kind"] == "legacy_improvement"
    assert looked_up is not None
    assert looked_up["job_id"] == job["job_id"]
    assert looked_up["improvements"] == [{"suggestion": "Add FastAPI"}]


def test_application_pack_artifact_and_reset_flow(tmp_path: Path) -> None:
    database = create_test_database(tmp_path)

    resume = database.create_resume(content="# Base", is_master=True)
    job = database.create_job(content="JD", resume_id=resume["resume_id"])
    pack = database.create_application_pack(
        base_resume_id=resume["resume_id"],
        job_id=job["job_id"],
        status="preview_ready",
        company="Acme",
    )
    run = database.create_generation_run(
        run_kind="application_pack_preview",
        status="completed",
        source_resume_id=resume["resume_id"],
        job_id=job["job_id"],
        application_pack_id=pack["pack_id"],
    )
    artifact_file = tmp_path / "artifacts" / "preview.png"
    artifact_file.parent.mkdir(parents=True, exist_ok=True)
    artifact_file.write_bytes(b"png")
    artifact = database.create_artifact(
        kind="resume_preview_png",
        mime_type="image/png",
        file_name="preview.png",
        storage_path=str(artifact_file),
        application_pack_id=pack["pack_id"],
        generation_run_id=run["generation_run_id"],
        resume_id=resume["resume_id"],
    )

    stats_before = database.get_stats()
    database.reset_database()
    stats_after = database.get_stats()

    assert artifact["kind"] == "resume_preview_png"
    assert stats_before["total_resumes"] == 1
    assert stats_before["total_jobs"] == 1
    assert stats_before["total_improvements"] == 1
    assert stats_after["total_resumes"] == 0
    assert stats_after["total_jobs"] == 0
    assert stats_after["total_improvements"] == 0
