"""SQLAlchemy-backed compatibility database layer."""

from __future__ import annotations

import asyncio
import copy
import shutil
from datetime import datetime, timezone
from pathlib import Path
from collections.abc import Sequence
from typing import Any
from uuid import uuid4

from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.base import Base
from app.db.models import (
    Artifact,
    GenerationRun,
    Job,
    LLMCall,
    Resume,
    utcnow,
)
from app.db.repositories import application_packs as application_pack_repo
from app.db.repositories import artifacts as artifact_repo
from app.db.repositories import generation_runs as generation_run_repo
from app.db.repositories import jobs as job_repo
from app.db.repositories import llm_calls as llm_call_repo
from app.db.repositories import resumes as resume_repo
from app.services.resume_codes import derive_resume_code
from app.db.session import get_engine, get_session_factory


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.isoformat()


def _serialize_resume(record: Resume) -> dict[str, Any]:
    return {
        "resume_id": record.resume_id,
        "resume_code": derive_resume_code(record.resume_id),
        "content": record.content,
        "content_type": record.content_type,
        "filename": record.filename,
        "is_active": record.is_active,
        "is_pinned": record.is_pinned,
        "pinned_at": _iso(record.pinned_at),
        "parent_id": record.parent_id,
        "application_pack_id": record.application_pack_id,
        "processed_data": record.processed_data,
        "processing_status": record.processing_status,
        "cover_letter": record.cover_letter,
        "outreach_message": record.outreach_message,
        "title": record.title,
        "original_markdown": record.original_markdown,
        "theme_settings": record.theme_settings,
        "cv_metadata": record.cv_metadata,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
    }


def _serialize_job(record: Job) -> dict[str, Any]:
    return {
        "job_id": record.job_id,
        "resume_id": record.resume_id,
        "content": record.content,
        "company": record.company,
        "role": record.role,
        "location": record.location,
        "job_metadata": record.job_metadata,
        "job_keywords": record.job_keywords,
        "job_keywords_hash": record.job_keywords_hash,
        "preview_hash": record.preview_hash,
        "preview_prompt_id": record.preview_prompt_id,
        "preview_hashes": record.preview_hashes,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
    }


def _serialize_generation_run(record: GenerationRun) -> dict[str, Any]:
    return {
        "request_id": record.generation_run_id,
        "generation_run_id": record.generation_run_id,
        "application_pack_id": record.application_pack_id,
        "original_resume_id": record.source_resume_id,
        "tailored_resume_id": record.tailored_resume_id,
        "job_id": record.job_id,
        "run_kind": record.run_kind,
        "status": record.status,
        "prompt_id": record.prompt_id,
        "request_payload": record.request_payload,
        "result_payload": record.result_payload,
        "warnings": record.warnings or [],
        "improvements": (record.result_payload or {}).get("improvements", []),
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
        "completed_at": _iso(record.completed_at),
    }


def _serialize_artifact(record: Artifact) -> dict[str, Any]:
    return {
        "artifact_id": record.artifact_id,
        "application_pack_id": record.application_pack_id,
        "generation_run_id": record.generation_run_id,
        "resume_id": record.resume_id,
        "kind": record.kind,
        "mime_type": record.mime_type,
        "file_name": record.file_name,
        "storage_path": record.storage_path,
        "metadata": record.artifact_metadata,
        "created_at": _iso(record.created_at),
    }


def _serialize_llm_call(record: LLMCall) -> dict[str, Any]:
    return {
        "llm_call_id": record.llm_call_id,
        "call_group_id": record.call_group_id,
        "trace_id": record.trace_id,
        "request_scope": record.request_scope,
        "operation": record.operation,
        "provider": record.provider,
        "model": record.model,
        "model_name": record.model_name,
        "response_model": record.response_model,
        "request_kind": record.request_kind,
        "success": record.success,
        "attempt": record.attempt,
        "max_tokens": record.max_tokens,
        "temperature": record.temperature,
        "reasoning_effort": record.reasoning_effort,
        "json_mode": record.json_mode,
        "latency_ms": record.latency_ms,
        "finish_reason": record.finish_reason,
        "prompt_chars": record.prompt_chars,
        "prompt_tokens_est": record.prompt_tokens_est,
        "response_chars": record.response_chars,
        "response_tokens_est": record.response_tokens_est,
        "usage_input_tokens": record.usage_input_tokens,
        "usage_output_tokens": record.usage_output_tokens,
        "usage_total_tokens": record.usage_total_tokens,
        "estimated_input_cost_usd": record.estimated_input_cost_usd,
        "estimated_output_cost_usd": record.estimated_output_cost_usd,
        "estimated_total_cost_usd": record.estimated_total_cost_usd,
        "error_type": record.error_type,
        "error_message": record.error_message,
        "prompt_preview": record.prompt_preview,
        "response_preview": record.response_preview,
        "request_context": record.request_context,
        "created_at": _iso(record.created_at),
        "updated_at": _iso(record.updated_at),
        "completed_at": _iso(record.completed_at),
    }


class Database:
    """Compatibility wrapper exposing the legacy db.* interface."""

    _active_resume_lock = asyncio.Lock()

    def __init__(
        self,
        *,
        session_factory: sessionmaker[Session] | None = None,
        engine: Engine | None = None,
        data_dir: Path | None = None,
        artifact_dir: Path | None = None,
    ):
        self._session_factory = session_factory
        self._engine = engine
        self.data_dir = data_dir or settings.data_dir
        self.artifact_dir = artifact_dir or settings.artifact_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)

    def _session(self) -> Session:
        factory = self._session_factory or get_session_factory()
        return factory()

    def _admin_engine(self) -> Engine:
        return self._engine or get_engine()

    def close(self) -> None:
        return None

    def create_resume(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        is_active: bool = False,
        parent_id: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        title: str | None = None,
        original_markdown: str | None = None,
        application_pack_id: str | None = None,
        theme_settings: dict[str, Any] | None = None,
        cv_metadata: str | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            record = resume_repo.create_resume(
                session,
                resume_id=str(uuid4()),
                content=content,
                content_type=content_type,
                filename=filename,
                is_active=is_active,
                parent_id=parent_id,
                application_pack_id=application_pack_id,
                processed_data=processed_data,
                processing_status=processing_status,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                title=title,
                original_markdown=original_markdown,
                theme_settings=theme_settings,
                cv_metadata=cv_metadata,
            )
            return _serialize_resume(record)

    async def create_resume_atomic_active(
        self,
        content: str,
        content_type: str = "md",
        filename: str | None = None,
        processed_data: dict[str, Any] | None = None,
        processing_status: str = "pending",
        cover_letter: str | None = None,
        outreach_message: str | None = None,
        original_markdown: str | None = None,
    ) -> dict[str, Any]:
        async with self._active_resume_lock:
            current_active = self.get_active_resume()
            is_active = current_active is None

            if current_active and current_active.get("processing_status") in (
                "failed",
                "processing",
            ):
                self.update_resume(current_active["resume_id"], {"is_active": False})
                is_active = True

            return self.create_resume(
                content=content,
                content_type=content_type,
                filename=filename,
                is_active=is_active,
                processed_data=processed_data,
                processing_status=processing_status,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                original_markdown=original_markdown,
            )

    def duplicate_resume(self, source_resume_id: str) -> dict[str, Any] | None:
        source = self.get_resume(source_resume_id)
        if not source:
            return None
        pd_raw = source.get("processed_data")
        processed_data = copy.deepcopy(pd_raw) if isinstance(pd_raw, dict) else pd_raw
        ts_raw = source.get("theme_settings")
        theme_settings = copy.deepcopy(ts_raw) if isinstance(ts_raw, dict) else ts_raw
        cm_raw = source.get("cv_metadata")
        cv_metadata = cm_raw if isinstance(cm_raw, str) else None
        title = source.get("title")
        base_title = title.strip() if isinstance(title, str) and title.strip() else None
        new_title = f"{base_title} (copy)" if base_title else None
        filename: str | None = None
        fn = source.get("filename")
        if isinstance(fn, str) and fn.strip():
            name = fn.strip()
            dot = name.rfind(".")
            if dot > 0:
                filename = f"{name[:dot]} (copy){name[dot:]}"
            else:
                filename = f"{name} (copy)"
        content = source.get("content")
        if not isinstance(content, str):
            return None
        return self.create_resume(
            content=content,
            content_type=source.get("content_type") or "md",
            filename=filename,
            is_active=False,
            parent_id=None,
            processed_data=processed_data,
            processing_status=source.get("processing_status") or "pending",
            cover_letter=source.get("cover_letter"),
            outreach_message=source.get("outreach_message"),
            title=new_title,
            original_markdown=source.get("original_markdown"),
            theme_settings=theme_settings,
            cv_metadata=cv_metadata,
        )

    def get_resume(self, resume_id: str) -> dict[str, Any] | None:
        with self._session() as session:
            record = resume_repo.get_resume(session, resume_id)
            return _serialize_resume(record) if record else None

    def get_active_resume(self) -> dict[str, Any] | None:
        with self._session() as session:
            record = resume_repo.get_active_resume(session)
            return _serialize_resume(record) if record else None

    def update_resume(self, resume_id: str, updates: dict[str, Any]) -> dict[str, Any]:
        with self._session() as session:
            record = resume_repo.update_resume(session, resume_id, updates)
            if record is None:
                raise ValueError(f"Resume not found: {resume_id}")
            return _serialize_resume(record)

    def delete_resume(self, resume_id: str) -> bool:
        with self._session() as session:
            return resume_repo.delete_resume(session, resume_id)

    def list_resumes(self) -> list[dict[str, Any]]:
        with self._session() as session:
            return [_serialize_resume(record) for record in resume_repo.list_resumes(session)]

    def count_resumes(self) -> int:
        with self._session() as session:
            return resume_repo.count_resumes(session)

    def set_active_resume(self, resume_id: str) -> bool:
        with self._session() as session:
            record = resume_repo.set_active_resume(session, resume_id)
            return record is not None

    def set_resume_pinned(self, resume_id: str, pinned: bool) -> bool:
        with self._session() as session:
            record = resume_repo.set_resume_pinned(session, resume_id, pinned)
            return record is not None

    def create_job(
        self,
        content: str,
        resume_id: str | None = None,
        company: str | None = None,
        role: str | None = None,
        location: str | None = None,
        job_metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            record = job_repo.create_job(
                session,
                job_id=str(uuid4()),
                content=content,
                resume_id=resume_id,
                company=company,
                role=role,
                location=location,
                job_metadata=job_metadata,
            )
            return _serialize_job(record)

    def get_job(self, job_id: str) -> dict[str, Any] | None:
        with self._session() as session:
            record = job_repo.get_job(session, job_id)
            return _serialize_job(record) if record else None

    def update_job(self, job_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        with self._session() as session:
            record = job_repo.update_job(session, job_id, updates)
            return _serialize_job(record) if record else None

    def create_application_pack(
        self,
        base_resume_id: str,
        job_id: str,
        status: str,
        company: str | None = None,
        role: str | None = None,
        location: str | None = None,
        theme_settings: dict[str, Any] | None = None,
        generation_run_id: str | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            record = application_pack_repo.create_application_pack(
                session,
                pack_id=str(uuid4()),
                base_resume_id=base_resume_id,
                job_id=job_id,
                status=status,
                company=company,
                role=role,
                location=location,
                theme_settings=theme_settings,
                generation_run_id=generation_run_id,
            )
            return {
                "pack_id": record.pack_id,
                "base_resume_id": record.base_resume_id,
                "job_id": record.job_id,
                "tailored_resume_id": record.tailored_resume_id,
                "generation_run_id": record.generation_run_id,
                "status": record.status,
                "company": record.company,
                "role": record.role,
                "location": record.location,
                "theme_settings": record.theme_settings,
                "created_at": _iso(record.created_at),
                "updated_at": _iso(record.updated_at),
                "confirmed_at": _iso(record.confirmed_at),
            }

    def update_application_pack(
        self, pack_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        with self._session() as session:
            record = application_pack_repo.update_application_pack(session, pack_id, updates)
            if record is None:
                return None
            return {
                "pack_id": record.pack_id,
                "base_resume_id": record.base_resume_id,
                "job_id": record.job_id,
                "tailored_resume_id": record.tailored_resume_id,
                "generation_run_id": record.generation_run_id,
                "status": record.status,
                "company": record.company,
                "role": record.role,
                "location": record.location,
                "theme_settings": record.theme_settings,
                "created_at": _iso(record.created_at),
                "updated_at": _iso(record.updated_at),
                "confirmed_at": _iso(record.confirmed_at),
            }

    def get_application_pack(self, pack_id: str) -> dict[str, Any] | None:
        with self._session() as session:
            record = application_pack_repo.get_application_pack(session, pack_id)
            if record is None:
                return None
            return {
                "pack_id": record.pack_id,
                "base_resume_id": record.base_resume_id,
                "job_id": record.job_id,
                "tailored_resume_id": record.tailored_resume_id,
                "generation_run_id": record.generation_run_id,
                "status": record.status,
                "company": record.company,
                "role": record.role,
                "location": record.location,
                "theme_settings": record.theme_settings,
                "created_at": _iso(record.created_at),
                "updated_at": _iso(record.updated_at),
                "confirmed_at": _iso(record.confirmed_at),
            }

    def list_application_packs(
        self,
        *,
        company: str | None = None,
        role: str | None = None,
        created_from: datetime | None = None,
        created_to: datetime | None = None,
    ) -> list[dict[str, Any]]:
        with self._session() as session:
            records = application_pack_repo.list_application_packs(
                session,
                company=company,
                role=role,
                created_from=created_from,
                created_to=created_to,
            )
            return [
                {
                    "pack_id": record.pack_id,
                    "base_resume_id": record.base_resume_id,
                    "job_id": record.job_id,
                    "tailored_resume_id": record.tailored_resume_id,
                    "generation_run_id": record.generation_run_id,
                    "status": record.status,
                    "company": record.company,
                    "role": record.role,
                    "location": record.location,
                    "theme_settings": record.theme_settings,
                    "created_at": _iso(record.created_at),
                    "updated_at": _iso(record.updated_at),
                    "confirmed_at": _iso(record.confirmed_at),
                }
                for record in records
            ]

    def create_generation_run(
        self,
        run_kind: str,
        status: str,
        source_resume_id: str | None = None,
        tailored_resume_id: str | None = None,
        job_id: str | None = None,
        application_pack_id: str | None = None,
        prompt_id: str | None = None,
        request_payload: dict[str, Any] | None = None,
        result_payload: dict[str, Any] | None = None,
        warnings: list[str] | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            record = generation_run_repo.create_generation_run(
                session,
                generation_run_id=str(uuid4()),
                run_kind=run_kind,
                status=status,
                source_resume_id=source_resume_id,
                tailored_resume_id=tailored_resume_id,
                job_id=job_id,
                application_pack_id=application_pack_id,
                prompt_id=prompt_id,
                request_payload=request_payload,
                result_payload=result_payload,
                warnings=warnings,
                completed_at=utcnow() if status == "completed" else None,
            )
            return _serialize_generation_run(record)

    def get_generation_run(self, generation_run_id: str) -> dict[str, Any] | None:
        with self._session() as session:
            record = generation_run_repo.get_generation_run(session, generation_run_id)
            return _serialize_generation_run(record) if record else None

    def update_generation_run(
        self, generation_run_id: str, updates: dict[str, Any]
    ) -> dict[str, Any] | None:
        with self._session() as session:
            record = generation_run_repo.update_generation_run(session, generation_run_id, updates)
            return _serialize_generation_run(record) if record else None

    def list_generation_runs(
        self,
        *,
        run_kind: str | Sequence[str] | None = None,
        status: str | None = None,
        application_pack_id: str | None = None,
        source_resume_id: str | None = None,
        tailored_resume_id: str | None = None,
        job_id: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        with self._session() as session:
            records = generation_run_repo.list_generation_runs(
                session,
                run_kind=run_kind,
                status=status,
                application_pack_id=application_pack_id,
                source_resume_id=source_resume_id,
                tailored_resume_id=tailored_resume_id,
                job_id=job_id,
                limit=limit,
            )
            return [_serialize_generation_run(record) for record in records]

    def get_latest_generation_run(
        self,
        *,
        run_kind: str | Sequence[str] | None = None,
        status: str | None = None,
        application_pack_id: str | None = None,
        source_resume_id: str | None = None,
        tailored_resume_id: str | None = None,
        job_id: str | None = None,
    ) -> dict[str, Any] | None:
        with self._session() as session:
            record = generation_run_repo.get_latest_generation_run(
                session,
                run_kind=run_kind,
                status=status,
                application_pack_id=application_pack_id,
                source_resume_id=source_resume_id,
                tailored_resume_id=tailored_resume_id,
                job_id=job_id,
            )
            return _serialize_generation_run(record) if record else None

    def create_artifact(
        self,
        *,
        kind: str,
        mime_type: str,
        file_name: str,
        storage_path: str,
        application_pack_id: str | None = None,
        generation_run_id: str | None = None,
        resume_id: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            record = artifact_repo.create_artifact(
                session,
                artifact_id=str(uuid4()),
                kind=kind,
                mime_type=mime_type,
                file_name=file_name,
                storage_path=storage_path,
                application_pack_id=application_pack_id,
                generation_run_id=generation_run_id,
                resume_id=resume_id,
                artifact_metadata=metadata,
            )
            return _serialize_artifact(record)

    def get_artifact(self, artifact_id: str) -> dict[str, Any] | None:
        with self._session() as session:
            record = artifact_repo.get_artifact(session, artifact_id)
            return _serialize_artifact(record) if record else None

    def create_improvement(
        self,
        original_resume_id: str,
        tailored_resume_id: str,
        job_id: str,
        improvements: list[dict[str, Any]],
    ) -> dict[str, Any]:
        return self.create_generation_run(
            run_kind="legacy_improvement",
            status="completed",
            source_resume_id=original_resume_id,
            tailored_resume_id=tailored_resume_id,
            job_id=job_id,
            result_payload={"improvements": improvements},
        )

    def get_improvement_by_tailored_resume(
        self, tailored_resume_id: str
    ) -> dict[str, Any] | None:
        with self._session() as session:
            record = generation_run_repo.get_latest_improvement_for_tailored_resume(
                session, tailored_resume_id
            )
            return _serialize_generation_run(record) if record else None

    def create_llm_call(self, **values: Any) -> dict[str, Any]:
        with self._session() as session:
            record = llm_call_repo.create_llm_call(session, **values)
            return _serialize_llm_call(record)

    def list_llm_calls(
        self,
        *,
        trace_id: str | None = None,
        call_group_id: str | None = None,
        request_scope: str | None = None,
        operation: str | None = None,
        success: bool | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        with self._session() as session:
            records = llm_call_repo.list_llm_calls(
                session,
                trace_id=trace_id,
                call_group_id=call_group_id,
                request_scope=request_scope,
                operation=operation,
                success=success,
                limit=limit,
            )
            return [_serialize_llm_call(record) for record in records]

    def summarize_llm_calls(
        self,
        *,
        trace_id: str | None = None,
        request_scope: str | None = None,
    ) -> dict[str, Any]:
        with self._session() as session:
            return llm_call_repo.summarize_llm_calls(
                session,
                trace_id=trace_id,
                request_scope=request_scope,
            )

    def get_stats(self) -> dict[str, Any]:
        with self._session() as session:
            total_resumes = len(resume_repo.list_resumes(session))
            total_jobs = len(job_repo.list_jobs(session))
            total_improvements = generation_run_repo.count_generation_runs(session)
            has_active_resume = resume_repo.get_active_resume(session) is not None
        return {
            "total_resumes": total_resumes,
            "total_jobs": total_jobs,
            "total_improvements": total_improvements,
            "has_active_resume": has_active_resume,
        }

    def reset_database(self) -> None:
        engine = self._admin_engine()
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)

        uploads_dir = self.data_dir / "uploads"
        if uploads_dir.exists():
            shutil.rmtree(uploads_dir)
        uploads_dir.mkdir(parents=True, exist_ok=True)

        if self.artifact_dir.exists():
            shutil.rmtree(self.artifact_dir)
        self.artifact_dir.mkdir(parents=True, exist_ok=True)


db = Database()
