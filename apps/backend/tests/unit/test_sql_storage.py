"""Tests for the SQLAlchemy-backed storage layer."""

from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker

from app.config import Settings
from app.database import Database
from app.db.base import Base


@contextmanager
def create_test_database(tmp_path: Path) -> Iterator[Database]:
    database_url = Settings().effective_database_url
    schema = f"test_sql_storage_{uuid4().hex}"
    admin_engine = create_engine(database_url, isolation_level="AUTOCOMMIT")

    try:
        with admin_engine.connect() as connection:
            connection.execute(text(f'CREATE SCHEMA "{schema}"'))
    except OperationalError as exc:
        admin_engine.dispose()
        pytest.skip(f"Postgres storage tests require a reachable DATABASE_URL: {exc}")

    engine = create_engine(database_url, pool_pre_ping=True)

    @event.listens_for(engine, "connect")
    def set_search_path(dbapi_connection, _connection_record) -> None:
        with dbapi_connection.cursor() as cursor:
            cursor.execute(f'SET search_path TO "{schema}"')

    Base.metadata.create_all(bind=engine)
    SessionFactory = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    database = Database(
        session_factory=SessionFactory,
        engine=engine,
        data_dir=tmp_path / "data",
        artifact_dir=tmp_path / "artifacts",
    )

    try:
        yield database
    finally:
        engine.dispose()
        with admin_engine.connect() as connection:
            connection.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
        admin_engine.dispose()


def test_resume_and_job_crud_round_trip(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
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
    with create_test_database(tmp_path) as database:
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
    with create_test_database(tmp_path) as database:
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
