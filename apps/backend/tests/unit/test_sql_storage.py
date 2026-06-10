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
            is_active=True,
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
        assert fetched_resume["is_active"] is True
        assert fetched_resume["filename"] == "resume.md"
        assert fetched_job is not None
        assert fetched_job["company"] == "Acme"
        assert fetched_job["role"] == "Backend Engineer"


def test_generation_runs_replace_legacy_improvements(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
        source = database.create_resume(content="# Source", is_active=True)
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
        resume = database.create_resume(content="# Base", is_active=True)
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


def test_active_resume_swap_pin_and_list_order(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
        first = database.create_resume(content="# First", is_active=True)
        second = database.create_resume(content="# Second", is_active=False)

        assert database.get_active_resume() is not None
        assert database.get_active_resume()["resume_id"] == first["resume_id"]
        assert database.count_resumes() == 2

        assert database.set_active_resume(second["resume_id"]) is True
        assert database.get_resume(first["resume_id"])["is_active"] is False
        assert database.get_resume(second["resume_id"])["is_active"] is True

        assert database.set_resume_pinned(first["resume_id"], True) is True
        pinned_first = database.get_resume(first["resume_id"])
        assert pinned_first["is_pinned"] is True
        assert pinned_first["pinned_at"] is not None

        ids = [r["resume_id"] for r in database.list_resumes()]
        assert ids[0] == first["resume_id"]

        assert database.set_resume_pinned(first["resume_id"], False) is True
        assert database.get_resume(first["resume_id"])["is_pinned"] is False
        assert database.get_resume(first["resume_id"])["pinned_at"] is None


def test_duplicate_resume_copies_content_and_clears_lineage(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
        source = database.create_resume(
            content="# Source",
            content_type="md",
            filename="base.md",
            is_active=True,
            processed_data={"summary": "S"},
            processing_status="ready",
            title="Engineer",
        )
        dup = database.duplicate_resume(source["resume_id"])
        assert dup is not None
        assert dup["resume_id"] != source["resume_id"]
        assert dup["parent_id"] is None
        assert dup["is_active"] is False
        assert dup["processed_data"] == {"summary": "S"}
        assert dup["title"] == "Engineer (copy)"


def test_map_llm_trace_ids_from_generation_run_payload(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
        master = database.create_resume(content="# M", is_active=True)
        tailored = database.create_resume(
            content="{}",
            content_type="json",
            parent_id=master["resume_id"],
            is_active=False,
        )
        job = database.create_job(content="JD", resume_id=master["resume_id"])
        preview = database.create_generation_run(
            run_kind="application_pack_preview",
            status="completed",
            source_resume_id=master["resume_id"],
            tailored_resume_id=tailored["resume_id"],
            job_id=job["job_id"],
            request_payload={"llm_trace_id": "trace-preview-xyz"},
        )
        database.create_generation_run(
            run_kind="application_pack_confirm",
            status="completed",
            source_resume_id=master["resume_id"],
            tailored_resume_id=tailored["resume_id"],
            job_id=job["job_id"],
            request_payload={
                "preview_generation_run_id": preview["generation_run_id"],
                "llm_trace_id": "trace-confirm-other",
            },
        )
        assert database.map_llm_trace_ids_for_resume_ids([tailored["resume_id"]]) == {
            tailored["resume_id"]: "trace-preview-xyz"
        }
        assert database.map_llm_trace_ids_for_resume_ids([master["resume_id"]]) == {}


def test_map_llm_trace_ids_fallback_when_no_preview_link(tmp_path: Path) -> None:
    """Confirm-only runs without ``preview_generation_run_id`` still expose their trace."""
    with create_test_database(tmp_path) as database:
        master = database.create_resume(content="# M", is_active=True)
        tailored = database.create_resume(
            content="{}",
            content_type="json",
            parent_id=master["resume_id"],
            is_active=False,
        )
        job = database.create_job(content="JD", resume_id=master["resume_id"])
        database.create_generation_run(
            run_kind="application_pack_confirm",
            status="completed",
            source_resume_id=master["resume_id"],
            tailored_resume_id=tailored["resume_id"],
            job_id=job["job_id"],
            request_payload={"llm_trace_id": "trace-legacy-only"},
        )
        assert database.map_llm_trace_ids_for_resume_ids([tailored["resume_id"]]) == {
            tailored["resume_id"]: "trace-legacy-only"
        }


def test_compact_diff_validation_merges_into_latest_matching_llm_trace_row(tmp_path: Path) -> None:
    """``attach_compact_diff_validation_to_latest_llm_call`` updates the newest matching row."""

    from datetime import datetime, timezone

    with create_test_database(tmp_path) as database:
        ts_early = datetime(2025, 1, 1, tzinfo=timezone.utc)
        ts_late = datetime(2025, 2, 1, tzinfo=timezone.utc)

        database.create_llm_call(
            llm_call_id=f"a-{uuid4().hex}",
            call_group_id=f"g-{uuid4().hex}",
            trace_id="trace-env",
            request_scope="unit",
            operation="resume_generate_full",
            provider="test",
            model="test/model",
            model_name="test-model",
            request_kind="json",
            success=True,
            json_mode=True,
            prompt_chars=10,
            request_context={"note": "older"},
            completed_at=ts_early,
        )
        database.create_llm_call(
            llm_call_id=f"b-{uuid4().hex}",
            call_group_id=f"g-{uuid4().hex}",
            trace_id="trace-env",
            request_scope="unit",
            operation="resume_generate_full",
            provider="test",
            model="test/model",
            model_name="test-model",
            request_kind="json",
            success=True,
            json_mode=True,
            prompt_chars=11,
            request_context={"note": "target"},
            completed_at=ts_late,
        )

        envelope = {
            "phase": "primary_tailor",
            "valid": False,
            "errors": ["x: why missing"],
            "warnings": [],
            "error_count": 1,
            "warning_count": 0,
            "origin": "test fixture",
        }
        merged = database.attach_compact_diff_validation_to_latest_llm_call(
            trace_id="trace-env",
            operation="resume_generate_full",
            envelope_validation=envelope,
        )
        assert merged is True

        refreshed = database.list_llm_calls(
            trace_id="trace-env", operation="resume_generate_full", limit=10
        )
        by_llm_call = {r["llm_call_id"]: r["request_context"] or {} for r in refreshed}

        with_envelope = [
            ctx for ctx in by_llm_call.values() if isinstance(ctx.get("compact_diff_validation"), dict)
        ]
        assert len(with_envelope) == 1
        assert with_envelope[0]["note"] == "target"
        assert with_envelope[0]["compact_diff_validation"] == envelope

        without_envelope = [
            ctx
            for ctx in by_llm_call.values()
            if ctx.get("note") == "older" and "compact_diff_validation" not in ctx
        ]
        assert len(without_envelope) == 1


def test_llm_calls_filter_and_merge_by_resume_code(tmp_path: Path) -> None:
    with create_test_database(tmp_path) as database:
        first_id = f"a-{uuid4().hex}"
        second_id = f"b-{uuid4().hex}"
        database.create_llm_call(
            llm_call_id=first_id,
            call_group_id=f"g-{uuid4().hex}",
            trace_id="trace-preview",
            request_scope="resumes.improve_preview",
            operation="resume_generate_full",
            provider="test",
            model="test/model",
            model_name="test-model",
            request_kind="text",
            success=True,
            json_mode=False,
            prompt_chars=10,
            request_context={"source_resume_code": "SRC123"},
        )
        database.create_llm_call(
            llm_call_id=second_id,
            call_group_id=f"g-{uuid4().hex}",
            trace_id="trace-aux",
            request_scope="resumes.generate_auxiliary_package",
            operation="cover_letter_outreach_generate",
            provider="test",
            model="test/model",
            model_name="test-model",
            request_kind="text",
            success=True,
            json_mode=False,
            prompt_chars=11,
            request_context={"resume_code": "TAIL99"},
        )

        assert database.merge_llm_call_context_for_trace(
            "trace-preview",
            {"resume_code": "TAIL99", "tailored_resume_code": "TAIL99"},
        ) == 1

        rows = database.list_llm_calls(resume_code="TAIL99", limit=10)
        assert {row["llm_call_id"] for row in rows} == {first_id, second_id}

        summary = database.summarize_llm_calls(resume_code="TAIL99")
        assert summary["total_calls"] == 2
        assert {op["operation"] for op in summary["operations"]} == {
            "resume_generate_full",
            "cover_letter_outreach_generate",
        }
