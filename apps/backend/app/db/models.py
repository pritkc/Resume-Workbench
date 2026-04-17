"""SQLAlchemy models for the Phase 6 storage layer."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_key: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)


class Resume(TimestampMixin, Base):
    __tablename__ = "resumes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    resume_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(String(32), nullable=False, default="md")
    filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    pinned_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    parent_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    application_pack_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    processed_data: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    processing_status: Mapped[str] = mapped_column(
        String(32), nullable=False, default="pending"
    )
    cover_letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    outreach_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    original_markdown: Mapped[str | None] = mapped_column(Text, nullable=True)
    theme_settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)


class Job(TimestampMixin, Base):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    job_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    resume_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    job_keywords: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    job_keywords_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    preview_hash: Mapped[str | None] = mapped_column(String(128), nullable=True)
    preview_prompt_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    preview_hashes: Mapped[dict[str, Any] | list[str] | None] = mapped_column(JSON, nullable=True)


class ApplicationPack(TimestampMixin, Base):
    __tablename__ = "application_packs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    pack_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    base_resume_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    job_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    tailored_resume_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    generation_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="preview_ready")
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    theme_settings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GenerationRun(TimestampMixin, Base):
    __tablename__ = "generation_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    generation_run_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    application_pack_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_resume_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    tailored_resume_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    job_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    run_kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="completed")
    prompt_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    request_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    result_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    warnings: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class LLMCall(TimestampMixin, Base):
    __tablename__ = "llm_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    llm_call_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    call_group_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    trace_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    request_scope: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    operation: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    response_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    request_kind: Mapped[str] = mapped_column(String(32), nullable=False)
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    reasoning_effort: Mapped[str | None] = mapped_column(String(64), nullable=True)
    json_mode: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    finish_reason: Mapped[str | None] = mapped_column(String(64), nullable=True)
    prompt_chars: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    prompt_tokens_est: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_chars: Mapped[int | None] = mapped_column(Integer, nullable=True)
    response_tokens_est: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    usage_total_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    estimated_input_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_output_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    estimated_total_cost_usd: Mapped[float | None] = mapped_column(Float, nullable=True)
    error_type: Mapped[str | None] = mapped_column(String(128), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    prompt_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_preview: Mapped[str | None] = mapped_column(Text, nullable=True)
    request_context: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Artifact(Base):
    __tablename__ = "artifacts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    artifact_id: Mapped[str] = mapped_column(
        String(64), unique=True, index=True, nullable=False
    )
    application_pack_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    generation_run_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    resume_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    mime_type: Mapped[str] = mapped_column(String(128), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    artifact_metadata: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )


__all__ = [
    "ApplicationPack",
    "Artifact",
    "Base",
    "GenerationRun",
    "LLMCall",
    "Job",
    "Resume",
    "User",
    "utcnow",
]
