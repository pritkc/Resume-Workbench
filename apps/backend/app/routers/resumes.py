"""Resume management endpoints."""

import asyncio
import copy
from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
import logging
import re
import time
import unicodedata
from pathlib import Path
from typing import Any, NoReturn
from uuid import uuid4

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from pydantic import ValidationError
import yaml

from app.config_cache import get_content_language, load_config as _load_config
from app.database import db
from app.llm import llm_trace_scope
from app.pdf import render_resume_pdf, PDFRenderError
from app.config import settings
from app.rendering.rendercv_adapter import (
    parse_rendercv_yaml_sections,
    rendercv_payload_to_yaml_sections,
    RenderCVYamlValidationError,
)
from app.rendering.rendercv_engine import RenderCVRenderError, render_resume_bundle
from app.rendering.theme_profiles import (
    RenderThemeSettings as RenderThemeProfile,
    legacy_to_theme_settings,
    migrate_legacy_theme_settings,
)
from app.services.artifact_service import store_rendercv_bundle
from app.services.tailoring.change_manifest import (
    build_change_manifest,
    build_stage_breakdown,
)

logger = logging.getLogger(__name__)
from app.schemas import (
    GenerateContentResponse,
    ImproveResumeConfirmRequest,
    ImproveResumeRequest,
    ImproveResumeResponse,
    ImproveResumeData,
    RawResume,
    RawYamlSections,
    PipelineTimingSummary,
    RefinementStats,
    RenderResumeRequest,
    ResumeData,
    ResumeDiffSummary,
    ResumeDraftNormalizedResponse,
    ResumeDraftRequest,
    ResumeFieldDiff,
    ResumeFetchData,
    ResumeFetchResponse,
    ResumeListResponse,
    ResumeSummary,
    ResumeUpdateRequest,
    ResumeUploadResponse,
    UpdateCoverLetterRequest,
    UpdateOutreachMessageRequest,
    UpdateTitleRequest,
    normalize_resume_data,
)
from app.services.parser import parse_document, parse_resume_to_json
from app.services.improver import (
    generate_tailored_resume,
    extract_job_keywords,
    generate_improvements,
)
from app.services.cover_letter import (
    build_job_target_title,
    extract_job_target_metadata,
    generate_cover_letter_and_outreach,
    sanitize_job_location,
)
from app.services.resume_codes import (
    build_resume_pdf_filename,
    derive_resume_code,
)
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_PROMPT_OPTIONS

_URL_LIKE_RE = re.compile(r"(?:https?://|www\.)", re.IGNORECASE)
_METADATA_NOISE_RE = re.compile(
    r"\b(?:learn more|click here|apply now|job description|benefits|careers?)\b",
    re.IGNORECASE,
)


def _get_default_prompt_id() -> str:
    """Get configured default prompt id from config file."""
    config = _load_config()
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    prompt_id = config.get("default_prompt_id", DEFAULT_IMPROVE_PROMPT_ID)
    return prompt_id if prompt_id in option_ids else DEFAULT_IMPROVE_PROMPT_ID


def _get_generation_defaults_config() -> dict[str, Any]:
    config = _load_config()
    defaults = config.get("generation_defaults")
    if not isinstance(defaults, dict):
        defaults = {}
    return defaults


def _resolve_prompt_id(request_prompt_id: str | None) -> str:
    option_ids = {option["id"] for option in IMPROVE_PROMPT_OPTIONS}
    if request_prompt_id in option_ids:
        return request_prompt_id

    generation_defaults = _get_generation_defaults_config()
    generation_default_prompt = generation_defaults.get("prompt_id")
    if generation_default_prompt in option_ids:
        return generation_default_prompt

    return _get_default_prompt_id()


def _resolve_auxiliary_include_flags(
    *,
    include_cover_letter: bool | None,
    include_outreach_message: bool | None,
) -> tuple[bool, bool]:
    defaults = _get_generation_defaults_config()

    def _resolve_flag(key: str, requested_value: bool | None) -> bool:
        if requested_value is not None:
            return requested_value
        if key in defaults:
            return bool(defaults.get(key))
        return True

    return (
        _resolve_flag("include_cover_letter", include_cover_letter),
        _resolve_flag("include_outreach_message", include_outreach_message),
    )


def _hash_job_content(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


def _resume_code_from_record(resume: dict[str, Any] | None, *, resume_id: str) -> str:
    if isinstance(resume, dict):
        code = resume.get("resume_code")
        if isinstance(code, str) and code.strip():
            return code.strip().upper()
    return derive_resume_code(resume_id)


def _extract_resume_full_name(resume_data: dict[str, Any] | None) -> str | None:
    if not isinstance(resume_data, dict):
        return None
    personal_info = resume_data.get("personalInfo")
    if not isinstance(personal_info, dict):
        return None
    name = personal_info.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    return None


def _resume_pdf_filename(
    *,
    resume: dict[str, Any],
    resume_id: str,
    resume_data: dict[str, Any] | None,
) -> str:
    return build_resume_pdf_filename(
        full_name=_extract_resume_full_name(resume_data),
        resume_code=_resume_code_from_record(resume, resume_id=resume_id),
        fallback_resume_id=resume_id,
    )


def _normalize_payload(value: Any) -> Any:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [_normalize_payload(item) for item in value]
    if isinstance(value, dict):
        normalized: dict[Any, Any] = {}
        for key, val in value.items():
            normalized_key = (
                unicodedata.normalize("NFC", key) if isinstance(key, str) else key
            )
            normalized[normalized_key] = _normalize_payload(val)
        return normalized
    return value


def _hash_improved_data(data: dict[str, Any]) -> str:
    """Hash canonicalized improved data for preview/confirm validation."""
    normalized = _normalize_payload(data)
    serialized = json.dumps(
        normalized,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,  # Preserve original behavior for hash stability
        default=str,  # Handle non-serializable types gracefully
    )
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _canonicalize_improved_resume_data(data: Any) -> dict[str, Any]:
    """Normalize resume payloads so preview/confirm hash the same shape."""
    payload = data.model_dump() if hasattr(data, "model_dump") else copy.deepcopy(data)
    normalized = normalize_resume_data(copy.deepcopy(payload))
    return ResumeData.model_validate(normalized).model_dump()


def _legacy_improved_data_hash_candidates(data: Any) -> set[str]:
    """Generate backward-compatible hashes for previews stored before canonical hashing."""
    if hasattr(data, "model_dump"):
        legacy_payload = data.model_dump(exclude_defaults=True, exclude_none=True)
    else:
        legacy_payload = copy.deepcopy(data)

    if not isinstance(legacy_payload, dict):
        return set()

    candidates = {_hash_improved_data(legacy_payload)}

    normalized_legacy_payload = normalize_resume_data(copy.deepcopy(legacy_payload))
    candidates.add(_hash_improved_data(normalized_legacy_payload))

    return candidates


def _normalize_personal_info_value(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value).strip()
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, (list, dict)) and not value:
        return ""
    normalized = _normalize_payload(value)
    return json.dumps(
        normalized, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    )


def _resolve_render_theme_settings(theme_settings: Any) -> RenderThemeProfile:
    if theme_settings is None:
        return RenderThemeProfile()
    if hasattr(theme_settings, "model_dump"):
        model_fields_set = getattr(theme_settings, "model_fields_set", set())
        return RenderThemeProfile.from_payload(
            theme_settings.model_dump(exclude_none=True),
            uses_theme_profiles="theme_profiles" in model_fields_set,
        )
    if isinstance(theme_settings, dict):
        return RenderThemeProfile.from_payload(
            theme_settings,
            uses_theme_profiles="theme_profiles" in theme_settings,
        )
    return RenderThemeProfile()


def _coerce_page_size(value: Any) -> str:
    return "LETTER" if value == "LETTER" else "A4"


def _coerce_spacing_level(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(1, min(parsed, 5))


def _coerce_margin_mm(value: Any, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(5, min(parsed, 25))


def _coerce_accent_color(value: Any) -> str:
    if value in {"blue", "green", "orange", "red"}:
        return value
    return "blue"


def _normalize_stored_theme_settings(
    theme_settings: Any, *, resume_id: str
) -> dict[str, Any] | None:
    if theme_settings is None:
        return RenderThemeProfile.from_payload(
            {"theme_id": "classic", "theme_profiles": {}},
            uses_theme_profiles=True,
        ).to_dict()

    try:
        if hasattr(theme_settings, "model_dump"):
            return _resolve_render_theme_settings(theme_settings).to_dict()

        if isinstance(theme_settings, dict):
            if "theme_profiles" in theme_settings:
                return RenderThemeProfile.from_payload(
                    theme_settings,
                    uses_theme_profiles=True,
                ).to_dict()

            if {
                "theme_id",
                "page_size",
                "density_profile",
                "bold_keywords",
                "accent_color",
                "show_contact_icons",
                "margins_mm",
                "design",
                "locale",
                "settings",
            } & set(theme_settings.keys()):
                legacy_settings = RenderThemeProfile.from_payload(
                    theme_settings,
                    uses_theme_profiles=False,
                )
                return migrate_legacy_theme_settings(legacy_settings).to_dict()

            margins = theme_settings.get("margins")
            spacing = theme_settings.get("spacing")
            margins = margins if isinstance(margins, dict) else {}
            spacing = spacing if isinstance(spacing, dict) else {}

            legacy_settings = legacy_to_theme_settings(
                template=str(theme_settings.get("template") or "swiss-single"),
                page_size=_coerce_page_size(theme_settings.get("pageSize")),
                compact_mode=bool(theme_settings.get("compactMode", False)),
                section_spacing=_coerce_spacing_level(spacing.get("section"), 3),
                item_spacing=_coerce_spacing_level(spacing.get("item"), 2),
                line_height=_coerce_spacing_level(spacing.get("lineHeight"), 3),
                accent_color=_coerce_accent_color(theme_settings.get("accentColor")),
                show_contact_icons=bool(theme_settings.get("showContactIcons", False)),
                margin_top=_coerce_margin_mm(margins.get("top"), 10),
                margin_bottom=_coerce_margin_mm(margins.get("bottom"), 10),
                margin_left=_coerce_margin_mm(margins.get("left"), 10),
                margin_right=_coerce_margin_mm(margins.get("right"), 10),
            )
            return migrate_legacy_theme_settings(legacy_settings).to_dict()
    except Exception as exc:
        logger.warning(
            "Falling back to default theme settings for resume %s: %s",
            resume_id,
            exc,
        )

    return RenderThemeProfile.from_payload(
        {"theme_id": "classic", "theme_profiles": {}},
        uses_theme_profiles=True,
    ).to_dict()


def _stored_or_default_theme_settings(resume: dict[str, Any]) -> RenderThemeProfile:
    normalized = _normalize_stored_theme_settings(
        resume.get("theme_settings"),
        resume_id=resume["resume_id"],
    )
    return _resolve_render_theme_settings(normalized)


def _resolve_request_theme_settings(
    *,
    request_theme_settings: Any,
    resume: dict[str, Any],
    application_pack_id: str | None = None,
) -> RenderThemeProfile:
    if request_theme_settings is not None:
        return _resolve_render_theme_settings(request_theme_settings)

    if application_pack_id:
        application_pack = db.get_application_pack(application_pack_id)
        if application_pack and application_pack.get("theme_settings"):
            return _resolve_render_theme_settings(application_pack["theme_settings"])

    return _stored_or_default_theme_settings(resume)


def _sanitize_target_metadata_value(value: Any, *, field: str) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = " ".join(value.strip().split()).strip(" -,:;|")
    if not cleaned:
        return None
    if _URL_LIKE_RE.search(cleaned):
        return None
    if _METADATA_NOISE_RE.search(cleaned):
        return None
    if field in {"role", "company"} and len(cleaned.split()) > 12:
        return None
    if field == "location":
        return sanitize_job_location(cleaned)
    max_len = 90 if field == "location" else 80
    return cleaned[:max_len].rstrip(" ,")


def _compose_target_title(role: str | None, company: str | None) -> str | None:
    if role and company:
        return f"{role} @ {company}"[:80]
    if role:
        return role[:80]
    return None


def _merge_target_metadata(
    *sources: dict[str, Any] | None,
    job_description: str = "",
    job_keywords: dict[str, Any] | None = None,
    title: str | None = None,
) -> tuple[str | None, str | None, str | None]:
    normalized_job_description = job_description if isinstance(job_description, str) else ""
    metadata_from_keywords = extract_job_target_metadata(
        normalized_job_description,
        title=title,
        job_keywords=job_keywords,
    )

    role = None
    company = None
    location = None
    title_candidates: list[str] = []

    if title:
        title_candidates.append(title)

    for source in sources:
        if isinstance(source, dict):
            source_title = source.get("title")
            if isinstance(source_title, str) and source_title.strip():
                title_candidates.append(source_title)

    for source in [*sources, metadata_from_keywords]:
        if not source:
            continue
        role = role or _sanitize_target_metadata_value(source.get("role"), field="role")
        company = company or _sanitize_target_metadata_value(source.get("company"), field="company")
        location = location or _sanitize_target_metadata_value(
            source.get("location"), field="location"
        )

    if not role or not company:
        for candidate in title_candidates:
            parsed = extract_job_target_metadata("", title=candidate)
            role = role or _sanitize_target_metadata_value(parsed.get("role"), field="role")
            company = company or _sanitize_target_metadata_value(
                parsed.get("company"), field="company"
            )
            if role and company:
                break

    if not role:
        for candidate in title_candidates:
            role_candidate = candidate.split("@", maxsplit=1)[0]
            role = _sanitize_target_metadata_value(role_candidate, field="role")
            if role:
                break

    return role, company, location


def _backfill_job_target_metadata(
    *,
    job_id: str,
    job: dict[str, Any],
    job_keywords: dict[str, Any] | None = None,
) -> dict[str, Any]:
    job_content = job.get("content")
    normalized_job_content = job_content if isinstance(job_content, str) else ""
    inferred = extract_job_target_metadata(
        normalized_job_content,
        job_keywords=job_keywords,
    )
    updates: dict[str, Any] = {}
    for key, value in inferred.items():
        if not value:
            continue
        current = _sanitize_target_metadata_value(
            job.get(key),
            field="location" if key == "location" else key,
        )
        if not current:
            updates[key] = value
    if not updates:
        return job

    try:
        updated_job = db.update_job(job_id, updates)
        if isinstance(updated_job, dict):
            return {**job, **updates, **updated_job}
    except Exception as exc:
        logger.warning("Failed to backfill target metadata for job %s: %s", job_id, exc)

    return {**job, **updates}


def _build_processed_resume(
    processed_data: Any, *, resume_id: str
) -> ResumeData | None:
    if not processed_data:
        return None

    if not isinstance(processed_data, dict):
        logger.warning(
            "Ignoring non-dict processed_data for resume %s during fetch.",
            resume_id,
        )
        return None

    normalized_data = normalize_resume_data(copy.deepcopy(processed_data))

    try:
        return ResumeData.model_validate(normalized_data)
    except ValidationError as exc:
        logger.warning(
            "Ignoring invalid processed_data for resume %s during fetch: %s",
            resume_id,
            exc,
        )
        return None


def _default_resume_draft() -> dict[str, Any]:
    return normalize_resume_data(ResumeData().model_dump())


def _default_theme_draft() -> RenderThemeProfile:
    return RenderThemeProfile.from_payload(
        {"theme_id": "classic", "theme_profiles": {}},
        uses_theme_profiles=True,
    )


def _build_resume_fetch_data(
    *,
    resume_id: str,
    resume_code: str | None = None,
    raw_content: str,
    processed_data: dict[str, Any],
    theme_settings: RenderThemeProfile,
    raw_created_at: str | None = None,
    processing_status: str = "ready",
    cover_letter: str | None = None,
    outreach_message: str | None = None,
    parent_id: str | None = None,
    title: str | None = None,
    application_pack_id: str | None = None,
) -> ResumeFetchData:
    created_at = raw_created_at or datetime.now(timezone.utc).isoformat()
    return ResumeFetchData(
        resume_id=resume_id,
        resume_code=resume_code or derive_resume_code(resume_id),
        raw_resume=RawResume(
            id=None,
            content=raw_content,
            content_type="json",
            created_at=created_at,
            processing_status=processing_status,
        ),
        processed_resume=ResumeData.model_validate(normalize_resume_data(copy.deepcopy(processed_data))),
        cover_letter=cover_letter,
        outreach_message=outreach_message,
        parent_id=parent_id,
        title=title,
        application_pack_id=application_pack_id,
        theme_settings=theme_settings.to_dict(),
    )


def _save_resume_payload(
    *,
    resume_id: str,
    updated_data: dict[str, Any],
    theme_settings: RenderThemeProfile | None,
) -> dict[str, Any]:
    updated_content = json.dumps(updated_data, indent=2)
    update_fields: dict[str, Any] = {
        "content": updated_content,
        "content_type": "json",
        "processed_data": updated_data,
        "processing_status": "ready",
    }
    if theme_settings is not None:
        update_fields["theme_settings"] = theme_settings.to_storage_dict()

    updated = db.update_resume(
        resume_id,
        update_fields,
    )
    if not updated:
        raise HTTPException(status_code=500, detail="Failed to update resume")
    return updated


def _normalize_draft_request(
    request: ResumeDraftRequest,
    *,
    base_resume: dict[str, Any] | None = None,
    base_theme_settings: RenderThemeProfile | None = None,
) -> tuple[dict[str, Any], RenderThemeProfile, RawYamlSections]:
    base_resume_data = copy.deepcopy(base_resume) if base_resume else _default_resume_draft()
    base_theme = base_theme_settings or _default_theme_draft()

    try:
        if request.yaml_sections is not None:
            normalized_resume_data, resolved_theme_settings = parse_rendercv_yaml_sections(
                request.yaml_sections.model_dump(),
                base_resume_data=base_resume_data,
                base_theme_settings=(
                    _resolve_render_theme_settings(request.theme_settings)
                    if request.theme_settings is not None
                    else base_theme
                ),
            )
        elif request.processed_resume is not None:
            normalized_resume_data = request.processed_resume.model_dump()
            resolved_theme_settings = (
                _resolve_render_theme_settings(request.theme_settings)
                if request.theme_settings is not None
                else base_theme
            )
        else:
            raise HTTPException(
                status_code=422,
                detail=(
                    "Draft requests must include either processed_resume or yaml_sections."
                ),
            )
    except RenderCVYamlValidationError as exc:
        detail: dict[str, Any] = {
            "type": "yaml_validation",
            "message": str(exc),
        }
        if exc.section:
            detail["section"] = exc.section
        if exc.line is not None:
            detail["line"] = exc.line
        if exc.column is not None:
            detail["column"] = exc.column
        if exc.path:
            detail["path"] = exc.path
        raise HTTPException(status_code=422, detail=detail) from exc
    except yaml.YAMLError as exc:
        raise HTTPException(
            status_code=422,
            detail={"type": "yaml_validation", "message": f"Invalid YAML: {exc}"},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"type": "yaml_validation", "message": str(exc)},
        ) from exc
    except ValidationError as exc:
        errors = exc.errors()
        first_error = errors[0] if errors else {}
        path = [str(part) for part in first_error.get("loc", [])]
        message = first_error.get("msg") or str(exc)
        detail: dict[str, Any] = {
            "type": "yaml_validation" if request.yaml_sections is not None else "validation",
            "message": message,
        }
        if request.yaml_sections is not None:
            detail["section"] = "cv"
        if path:
            detail["path"] = path
        raise HTTPException(status_code=422, detail=detail) from exc

    validated_resume = ResumeData.model_validate(
        normalize_resume_data(copy.deepcopy(normalized_resume_data))
    )
    yaml_sections = RawYamlSections(
        **rendercv_payload_to_yaml_sections(
            validated_resume.model_dump(),
            resolved_theme_settings,
        )
    )
    return validated_resume.model_dump(), resolved_theme_settings, yaml_sections


def _raise_improve_error(
    action: str,
    stage: str,
    error: Exception,
    detail: str,
) -> NoReturn:
    logger.error("Resume %s failed during %s: %s", action, stage, error)
    raise HTTPException(status_code=500, detail=detail)


def _get_original_resume_data(resume: dict[str, Any]) -> dict[str, Any] | None:
    original_data = resume.get("processed_data")
    if not original_data and resume.get("content_type") == "json":
        try:
            original_data = json.loads(resume["content"])
        except json.JSONDecodeError as e:
            logger.warning("Skipping resume diff due to JSON parse failure: %s", e)
    return original_data


def _get_original_markdown(resume: dict[str, Any]) -> str | None:
    """Get the original markdown content from a resume.

    Checks ``original_markdown`` first (persisted at upload), then
    falls back to ``content`` if it's still in markdown format.
    """
    md = resume.get("original_markdown")
    if md and isinstance(md, str):
        return md
    if resume.get("content_type") == "md":
        content = resume.get("content", "")
        if content and isinstance(content, str):
            return content
    return None


def _set_stage(stage_state: dict[str, str] | None, stage: str) -> None:
    if stage_state is not None:
        stage_state["stage"] = stage


class _PipelineTimer:
    """Collect host/sub-event timing entries for a pipeline execution."""

    def __init__(self) -> None:
        self._start_perf = time.perf_counter()
        self._start_at = datetime.now(timezone.utc)
        self._entries: list[dict[str, Any]] = []

    @contextmanager
    def track(
        self,
        host_event: str,
        sub_event: str | None = None,
        metadata: dict[str, Any] | None = None,
    ):
        start_perf = time.perf_counter()
        start_at = datetime.now(timezone.utc)
        try:
            yield
        finally:
            end_at = datetime.now(timezone.utc)
            duration_ms = max(0, int((time.perf_counter() - start_perf) * 1000))
            self._entries.append(
                {
                    "host_event": host_event,
                    "sub_event": sub_event,
                    "started_at": start_at.isoformat(),
                    "ended_at": end_at.isoformat(),
                    "duration_ms": duration_ms,
                    "metadata": metadata,
                }
            )

    def add_entry(
        self,
        *,
        host_event: str,
        sub_event: str | None,
        started_at: datetime,
        ended_at: datetime,
        duration_ms: int,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        self._entries.append(
            {
                "host_event": host_event,
                "sub_event": sub_event,
                "started_at": started_at.isoformat(),
                "ended_at": ended_at.isoformat(),
                "duration_ms": max(0, duration_ms),
                "metadata": metadata,
            }
        )

    def to_summary(self) -> PipelineTimingSummary:
        end_at = datetime.now(timezone.utc)
        total_duration_ms = max(0, int((time.perf_counter() - self._start_perf) * 1000))
        entries = sorted(
            self._entries,
            key=lambda item: item.get("started_at") or "",
        )
        grouped_wall_clock_ms: dict[str, int] = {}
        llm_operations: list[dict[str, Any]] = []
        for entry in entries:
            host_event = str(entry.get("host_event") or "")
            duration_ms = max(0, int(entry.get("duration_ms") or 0))
            if host_event and host_event != "llm":
                grouped_wall_clock_ms[host_event] = (
                    grouped_wall_clock_ms.get(host_event, 0) + duration_ms
                )
                continue
            if host_event == "llm":
                metadata = entry.get("metadata")
                metadata_dict = metadata if isinstance(metadata, dict) else {}
                llm_operations.append(
                    {
                        "operation": str(entry.get("sub_event") or "unknown_operation"),
                        "total_latency_ms": duration_ms,
                        "call_count": int(metadata_dict.get("call_count") or 0),
                        "successes": int(metadata_dict.get("successes") or 0),
                        "failures": int(metadata_dict.get("failures") or 0),
                    }
                )
        llm_operations.sort(key=lambda item: item["total_latency_ms"], reverse=True)
        return PipelineTimingSummary(
            started_at=self._start_at.isoformat(),
            ended_at=end_at.isoformat(),
            total_duration_ms=total_duration_ms,
            entries=entries,
            grouped_wall_clock_ms=grouped_wall_clock_ms,
            llm_operations=llm_operations,
        )


def _parse_iso_to_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def _append_llm_timing_entries(
    timer: _PipelineTimer,
    *,
    trace_id: str,
) -> None:
    calls = db.list_llm_calls(trace_id=trace_id, limit=500)
    if not calls:
        return

    grouped: dict[str, dict[str, Any]] = {}
    for call in calls:
        operation = call.get("operation")
        if not isinstance(operation, str) or not operation.strip():
            operation = "unknown_operation"

        group = grouped.setdefault(
            operation,
            {
                "operation": operation,
                "latency_ms": 0,
                "call_count": 0,
                "successes": 0,
                "failures": 0,
                "started_at": None,
                "ended_at": None,
            },
        )
        group["latency_ms"] += int(call.get("latency_ms") or 0)
        group["call_count"] += 1
        if call.get("success") is True:
            group["successes"] += 1
        elif call.get("success") is False:
            group["failures"] += 1

        created_at = _parse_iso_to_datetime(call.get("created_at"))
        completed_at = _parse_iso_to_datetime(call.get("completed_at")) or created_at
        if created_at and (group["started_at"] is None or created_at < group["started_at"]):
            group["started_at"] = created_at
        if completed_at and (group["ended_at"] is None or completed_at > group["ended_at"]):
            group["ended_at"] = completed_at

    for op in sorted(grouped.values(), key=lambda item: item["latency_ms"], reverse=True):
        now = datetime.now(timezone.utc)
        started_at = op["started_at"] or now
        ended_at = op["ended_at"] or started_at
        timer.add_entry(
            host_event="llm",
            sub_event=op["operation"],
            started_at=started_at,
            ended_at=ended_at,
            duration_ms=int(op["latency_ms"]),
            metadata={
                "call_count": op["call_count"],
                "successes": op["successes"],
                "failures": op["failures"],
            },
        )


async def _generate_tailored_resume_data(
    *,
    resume: dict[str, Any],
    job: dict[str, Any],
    job_keywords: dict[str, Any],
    language: str,
    prompt_id: str,
    stage_state: dict[str, str] | None = None,
) -> Any:
    """Generate tailored resume data through the primary full-resume prompt."""
    original_resume_data = _get_original_resume_data(resume)
    master_resume = db.get_master_resume()
    cleanup_source_data = (
        _get_original_resume_data(master_resume)
        if master_resume
        else original_resume_data
    )
    _set_stage(stage_state, "generate_full_resume")
    tailoring_result = await generate_tailored_resume(
        original_resume=resume["content"],
        job_description=job["content"],
        job_keywords=job_keywords,
        language=language,
        prompt_id=prompt_id,
        original_resume_data=original_resume_data,
        cleanup_source_data=cleanup_source_data,
    )
    return tailoring_result


def _calculate_diff_from_resume(
    resume: dict[str, Any],
    improved_data: dict[str, Any],
) -> tuple[ResumeDiffSummary | None, list[ResumeFieldDiff] | None, str | None]:
    """Calculate resume diffs when structured data is available.

    Returns (summary, changes, error_reason). Error reason is None on success,
    or a string describing why diff calculation failed.
    """
    original_data = _get_original_resume_data(resume)
    if not original_data:
        return None, None, "original_data_missing"
    from app.services.improver import calculate_resume_diff

    try:
        summary, changes = calculate_resume_diff(original_data, improved_data)
        return summary, changes, None
    except Exception as e:
        logger.warning("Skipping resume diff due to calculation failure: %s", e)
        return None, None, f"calculation_error: {str(e)}"


def _validate_confirm_payload(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
    *,
    allowed_personal_info_mismatches: set[str] | None = None,
) -> None:
    if not original_data:
        logger.warning(
            "Skipping confirm payload validation; structured resume data unavailable."
        )
        return
    normalized_original = ResumeData.model_validate(
        normalize_resume_data(copy.deepcopy(original_data))
    ).model_dump()
    normalized_improved = ResumeData.model_validate(
        normalize_resume_data(copy.deepcopy(improved_data))
    ).model_dump()
    original_info = normalized_original.get("personalInfo")
    improved_info = normalized_improved.get("personalInfo")
    # JSON-008: Explicit null checks with clear error messages
    if original_info is None:
        raise ValueError("Original resume missing personalInfo")
    if improved_info is None:
        raise ValueError("Improved resume missing personalInfo")
    if not isinstance(original_info, dict):
        raise ValueError(
            f"Original personalInfo is not a dict: {type(original_info).__name__}"
        )
    if not isinstance(improved_info, dict):
        raise ValueError(
            f"Improved personalInfo is not a dict: {type(improved_info).__name__}"
        )
    fields = set(original_info.keys()) | set(improved_info.keys())
    mismatches = [
        field
        for field in sorted(fields)
        if _normalize_personal_info_value(original_info.get(field))
        != _normalize_personal_info_value(improved_info.get(field))
        and field not in (allowed_personal_info_mismatches or set())
    ]
    if mismatches:
        raise ValueError(f"personalInfo fields changed: {', '.join(mismatches)}")


async def _generate_auxiliary_messages(
    improved_data: dict[str, Any],
    job_content: str,
    job_keywords: dict[str, Any] | None,
    language: str,
    *,
    include_cover_letter: bool,
    include_outreach_message: bool,
) -> tuple[str | None, str | None, str | None, list[str]]:
    """Generate auxiliary content and derive a stable resume title locally.

    Returns (cover_letter, outreach_message, title, warnings).
    """
    cover_letter = None
    outreach_message = None
    title = build_job_target_title(job_content, job_keywords=job_keywords)
    warnings: list[str] = []

    if not include_cover_letter and not include_outreach_message:
        return None, None, title, warnings

    try:
        generated_cover_letter, generated_outreach_message = (
            await generate_cover_letter_and_outreach(
                improved_data,
                job_content,
                language,
            )
        )
        if include_cover_letter:
            cover_letter = generated_cover_letter
        if include_outreach_message:
            outreach_message = generated_outreach_message
    except Exception as exc:
        logger.warning("Combined message generation failed: %s", exc, exc_info=exc)
        warnings.append("Cover letter + outreach package generation failed")

    return cover_letter, outreach_message, title, warnings


def _read_preview_auxiliary_payload(
    generation_run_id: str | None,
) -> dict[str, str | None]:
    """Load previously generated auxiliary outputs from a preview generation run."""

    if not generation_run_id:
        return {}

    try:
        generation_run = db.get_generation_run(generation_run_id)
    except Exception as exc:
        logger.warning(
            "Failed to load generation run %s for auxiliary reuse: %s",
            generation_run_id,
            exc,
        )
        return {}

    if not generation_run:
        return {}

    result_payload = generation_run.get("result_payload")
    if not isinstance(result_payload, dict):
        return {}

    auxiliary = result_payload.get("auxiliary")
    if not isinstance(auxiliary, dict):
        return {}

    return {
        "title": auxiliary.get("title") if isinstance(auxiliary.get("title"), str) else None,
        "cover_letter": (
            auxiliary.get("cover_letter")
            if isinstance(auxiliary.get("cover_letter"), str)
            else None
        ),
        "outreach_message": (
            auxiliary.get("outreach_message")
            if isinstance(auxiliary.get("outreach_message"), str)
            else None
        ),
    }


def _read_preview_tailoring_payload(
    generation_run_id: str | None,
) -> dict[str, Any]:
    """Load preview tailoring metadata for confirm reuse and UI continuity."""

    if not generation_run_id:
        return {}

    try:
        generation_run = db.get_generation_run(generation_run_id)
    except Exception as exc:
        logger.warning(
            "Failed to load generation run %s for tailoring reuse: %s",
            generation_run_id,
            exc,
        )
        return {}

    if not generation_run:
        return {}

    result_payload = generation_run.get("result_payload")
    if not isinstance(result_payload, dict):
        return {}

    return {
        "change_manifest": result_payload.get("change_manifest", []),
        "declared_changes": result_payload.get("declared_changes", []),
        "rejected_declared_changes": result_payload.get("rejected_declared_changes", []),
        "cleanup_changes": result_payload.get("cleanup_changes", []),
        "change_breakdown": result_payload.get("change_breakdown"),
        "raw_llm_resume_data": result_payload.get("raw_llm_resume_data"),
    }


async def _resolve_confirm_auxiliary_messages(
    *,
    generation_run_id: str | None,
    improved_data: dict[str, Any],
    job_content: str,
    job_keywords: dict[str, Any] | None,
    language: str,
    include_cover_letter: bool,
    include_outreach_message: bool,
) -> tuple[str | None, str | None, str | None, list[str]]:
    """Reuse reviewed preview auxiliary outputs before regenerating anything."""

    preview_auxiliary = _read_preview_auxiliary_payload(generation_run_id)
    title = preview_auxiliary.get("title") or build_job_target_title(
        job_content,
        job_keywords=job_keywords,
    )
    cover_letter = preview_auxiliary.get("cover_letter")
    outreach_message = preview_auxiliary.get("outreach_message")
    if not include_cover_letter:
        cover_letter = None
    if not include_outreach_message:
        outreach_message = None

    missing_cover_letter = include_cover_letter and not cover_letter
    missing_outreach_message = include_outreach_message and not outreach_message

    if not missing_cover_letter and not missing_outreach_message:
        return cover_letter, outreach_message, title, []

    generated_cover_letter, generated_outreach, generated_title, warnings = (
        await _generate_auxiliary_messages(
            improved_data,
            job_content,
            job_keywords,
            language,
            include_cover_letter=missing_cover_letter,
            include_outreach_message=missing_outreach_message,
        )
    )
    return (
        cover_letter or generated_cover_letter,
        outreach_message or generated_outreach,
        title or generated_title,
        warnings,
    )


router = APIRouter(prefix="/resumes", tags=["Resumes"])

ALLOWED_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
MAX_FILE_SIZE = 4 * 1024 * 1024  # 4MB


@router.post("/upload", response_model=ResumeUploadResponse)
async def upload_resume(file: UploadFile = File(...)) -> ResumeUploadResponse:
    """Upload and process a resume file (PDF/DOCX).

    Converts the file to Markdown and stores it in the database.
    Optionally parses to structured JSON if LLM is configured.
    """
    request_id = str(uuid4())

    # Validate file type
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {file.content_type}. Allowed: PDF, DOC, DOCX",
        )

    # Read and validate size
    content = await file.read()
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"File too large. Maximum size: {MAX_FILE_SIZE // (1024 * 1024)}MB",
        )

    if len(content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    # Convert to markdown
    try:
        markdown_content = await parse_document(content, file.filename or "resume.pdf")
    except Exception as e:
        logger.error(f"Document parsing failed: {e}")
        raise HTTPException(
            status_code=422,
            detail="Failed to parse document. Please ensure it's a valid PDF or DOCX file.",
        )

    # Store in database first with "processing" status (atomic master assignment)
    # original_markdown is preserved permanently for date reference even after
    # builder saves overwrite `content` with JSON.
    resume = await db.create_resume_atomic_master(
        content=markdown_content,
        content_type="md",
        filename=file.filename,
        processed_data=None,
        processing_status="processing",
        original_markdown=markdown_content,
    )

    # Try to parse to structured JSON (optional, may fail if LLM not configured)
    with llm_trace_scope(
        request_id,
        "resumes.upload",
        {"resume_id": resume["resume_id"], "filename": file.filename},
    ):
        try:
            processed_data = await parse_resume_to_json(markdown_content)
            db.update_resume(
                resume["resume_id"],
                {
                    "processed_data": processed_data,
                    "processing_status": "ready",
                },
            )
            resume["processed_data"] = processed_data
            resume["processing_status"] = "ready"
        except Exception as e:
            # LLM parsing failed, update status to failed
            logger.warning(f"Resume parsing to JSON failed for {file.filename}: {e}")
            db.update_resume(resume["resume_id"], {"processing_status": "failed"})
            resume["processing_status"] = "failed"

    # Return accurate status to client (API-001 fix)
    return ResumeUploadResponse(
        message=(
            f"File {file.filename} uploaded successfully"
            if resume["processing_status"] == "ready"
            else f"File {file.filename} uploaded but parsing failed"
        ),
        request_id=request_id,
        resume_id=resume["resume_id"],
        processing_status=resume["processing_status"],
        is_master=resume.get("is_master", False),
    )


@router.get("", response_model=ResumeFetchResponse)
async def get_resume(resume_id: str = Query(...)) -> ResumeFetchResponse:
    """Fetch resume details by ID.

    Returns both raw markdown and structured data (if available),
    plus cover letter and outreach message if they exist.
    Applies lazy migration for section metadata if needed.
    """
    resume = db.get_resume(resume_id)

    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Get processing status (default to "pending" for old records)
    processing_status = resume.get("processing_status", "pending")

    # Build response
    raw_resume = RawResume(
        id=None,  # TinyDB doesn't have numeric IDs like SQL
        content=resume["content"],
        content_type=resume["content_type"],
        created_at=resume["created_at"],
        processing_status=processing_status,
    )

    # Get processed data if available (no more on-demand parsing)
    processed_resume = _build_processed_resume(
        resume.get("processed_data"),
        resume_id=resume_id,
    )

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=ResumeFetchData(
            resume_id=resume_id,
            resume_code=_resume_code_from_record(resume, resume_id=resume_id),
            raw_resume=raw_resume,
            processed_resume=processed_resume,
            cover_letter=resume.get("cover_letter"),
            outreach_message=resume.get("outreach_message"),
            parent_id=resume.get("parent_id"),
            title=resume.get("title"),
            application_pack_id=resume.get("application_pack_id"),
            theme_settings=_normalize_stored_theme_settings(
                resume.get("theme_settings"),
                resume_id=resume_id,
            ),
        ),
    )


@router.post("/draft/normalize", response_model=ResumeDraftNormalizedResponse)
async def normalize_resume_draft(
    request: ResumeDraftRequest,
) -> ResumeDraftNormalizedResponse:
    resume: dict[str, Any] | None = None
    base_resume_data: dict[str, Any] | None = None
    base_theme_settings: RenderThemeProfile | None = None

    if request.resume_id:
        resume = db.get_resume(request.resume_id)
        if resume:
            base_resume_data = _get_original_resume_data(resume)
            base_theme_settings = _stored_or_default_theme_settings(resume)

    normalized_data, theme_settings, yaml_sections = _normalize_draft_request(
        request,
        base_resume=base_resume_data,
        base_theme_settings=base_theme_settings,
    )

    draft_resume_id = request.resume_id or "draft"
    return ResumeDraftNormalizedResponse(
        request_id=str(uuid4()),
        data=_build_resume_fetch_data(
            resume_id=draft_resume_id,
            raw_content=json.dumps(normalized_data, indent=2),
            processed_data=normalized_data,
            theme_settings=theme_settings,
            raw_created_at=resume.get("created_at") if resume else None,
            cover_letter=resume.get("cover_letter") if resume else None,
            outreach_message=resume.get("outreach_message") if resume else None,
            parent_id=resume.get("parent_id") if resume else None,
            title=resume.get("title") if resume else None,
            application_pack_id=resume.get("application_pack_id") if resume else None,
        ),
        yaml_sections=yaml_sections,
    )


@router.post("/draft/render-preview")
async def render_resume_draft_preview(
    request: ResumeDraftRequest,
) -> dict[str, Any]:
    resume: dict[str, Any] | None = None
    base_resume_data: dict[str, Any] | None = None
    base_theme_settings: RenderThemeProfile | None = None

    if request.resume_id:
        resume = db.get_resume(request.resume_id)
        if resume:
            base_resume_data = _get_original_resume_data(resume)
            base_theme_settings = _stored_or_default_theme_settings(resume)

    normalized_data, theme_settings, _ = _normalize_draft_request(
        request,
        base_resume=base_resume_data,
        base_theme_settings=base_theme_settings,
    )

    try:
        bundle = render_resume_bundle(
            normalized_data,
            theme_settings,
            identifier=(resume.get("title") if resume else None) or request.resume_id or "draft",
        )
        artifacts = store_rendercv_bundle(bundle, resume_id=request.resume_id)
    except RenderCVRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    preview_artifacts = [
        artifact for artifact in artifacts if artifact["kind"] == "resume_preview_png"
    ]

    return {
        "resume_id": request.resume_id or "draft",
        "theme_settings": theme_settings.to_dict(),
        "artifacts": artifacts,
        "preview_artifacts": preview_artifacts,
        "pdf_artifact": next(
            (artifact for artifact in artifacts if artifact["kind"] == "resume_pdf"),
            None,
        ),
    }


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(include_master: bool = Query(False)) -> ResumeListResponse:
    """List resumes, optionally including the master resume."""
    resumes = db.list_resumes()
    application_packs = {
        pack["pack_id"]: pack for pack in db.list_application_packs()
    }
    jobs_by_id: dict[str, dict[str, Any] | None] = {}
    if not include_master:
        resumes = [resume for resume in resumes if not resume.get("is_master", False)]

    resumes.sort(key=lambda item: item.get("updated_at", ""), reverse=True)

    summaries: list[ResumeSummary] = []
    for resume in resumes:
        application_pack = application_packs.get(resume.get("application_pack_id"))
        pack_job_id = (
            application_pack.get("job_id")
            if isinstance(application_pack, dict)
            else None
        )
        job = None
        if isinstance(pack_job_id, str) and pack_job_id.strip():
            if pack_job_id not in jobs_by_id:
                jobs_by_id[pack_job_id] = db.get_job(pack_job_id)
            job = jobs_by_id.get(pack_job_id)

        target_role, target_company, target_location = _merge_target_metadata(
            application_pack,
            job,
            title=resume.get("title"),
        )
        summaries.append(
            ResumeSummary(
                resume_id=resume["resume_id"],
                resume_code=_resume_code_from_record(
                    resume,
                    resume_id=resume["resume_id"],
                ),
                filename=resume.get("filename"),
                is_master=resume.get("is_master", False),
                parent_id=resume.get("parent_id"),
                processing_status=resume.get("processing_status", "pending"),
                created_at=resume.get("created_at", ""),
                updated_at=resume.get("updated_at", ""),
                title=resume.get("title"),
                target_role=target_role,
                target_company=target_company,
                target_location=target_location,
            )
        )

    return ResumeListResponse(request_id=str(uuid4()), data=summaries)


@router.post("/improve/preview", response_model=ImproveResumeResponse)
async def improve_resume_preview_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Preview a tailored resume without persisting it.

    The response includes resume_preview data but leaves resume_id null.
    """
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = get_content_language()
    prompt_id = _resolve_prompt_id(request.prompt_id)
    include_cover_letter, include_outreach_message = _resolve_auxiliary_include_flags(
        include_cover_letter=request.include_cover_letter,
        include_outreach_message=request.include_outreach_message,
    )
    request_id = str(uuid4())

    stage_state = {"stage": "load_job_keywords"}
    detail = "Failed to preview resume. Please try again."
    try:
        with llm_trace_scope(
            request_id,
            "resumes.improve_preview",
            {"resume_id": request.resume_id, "job_id": request.job_id},
        ):
            return await asyncio.wait_for(
                _improve_preview_flow(
                    request=request,
                    resume=resume,
                    job=job,
                    language=language,
                    prompt_id=prompt_id,
                    request_id=request_id,
                    theme_settings=_resolve_request_theme_settings(
                        request_theme_settings=request.theme_settings,
                        resume=resume,
                    ),
                    stage_state=stage_state,
                ),
                timeout=240.0,  # 4-minute hard limit
            )
    except asyncio.TimeoutError:
        logger.error(
            "Improve preview timed out after 240s for resume %s / job %s",
            request.resume_id,
            request.job_id,
        )
        raise HTTPException(
            status_code=504,
            detail="Resume tailoring timed out. Please try again with a shorter job description or a simpler prompt.",
        )
    except Exception as e:
        _raise_improve_error("preview", stage_state["stage"], e, detail)


async def _improve_preview_flow(
    *,
    request: ImproveResumeRequest,
    resume: dict[str, Any],
    job: dict[str, Any],
    language: str,
    prompt_id: str,
    request_id: str,
    theme_settings: RenderThemeProfile,
    stage_state: dict[str, str] | None = None,
) -> ImproveResumeResponse:
    """Inner flow for improve/preview, extracted so it can be wrapped in wait_for."""
    timer = _PipelineTimer()
    include_cover_letter, include_outreach_message = _resolve_auxiliary_include_flags(
        include_cover_letter=request.include_cover_letter,
        include_outreach_message=request.include_outreach_message,
    )
    job_keywords = job.get("job_keywords")
    job_keywords_hash = job.get("job_keywords_hash")
    content_hash = _hash_job_content(job["content"])
    if not job_keywords or job_keywords_hash != content_hash:
        with timer.track("job_keywords", "extract"):
            _set_stage(stage_state, "load_job_keywords")
            job_keywords = await extract_job_keywords(job["content"])
        with timer.track("job_keywords", "persist"):
            _set_stage(stage_state, "persist_job_keywords")
            try:
                updated_job = db.update_job(
                    request.job_id,
                    {"job_keywords": job_keywords, "job_keywords_hash": content_hash},
                )
                if not updated_job:
                    logger.warning(
                        "Failed to persist job keywords for job %s.",
                        request.job_id,
                    )
            except Exception as e:
                logger.warning(
                    "Failed to persist job keywords for job %s: %s",
                    request.job_id,
                    e,
                )
    else:
        now = datetime.now(timezone.utc)
        timer.add_entry(
            host_event="job_keywords",
            sub_event="reuse_cached",
            started_at=now,
            ended_at=now,
            duration_ms=0,
            metadata={"cache_hit": True},
        )
    with timer.track("tailoring", "generate_full_resume"):
        tailoring_result = await _generate_tailored_resume_data(
            resume=resume,
            job=job,
            job_keywords=job_keywords,
            language=language,
            prompt_id=prompt_id,
            stage_state=stage_state,
        )
    improved_data = tailoring_result.resume_data
    response_warnings = list(tailoring_result.warnings)

    refinement_stats: RefinementStats | None = None
    refinement_attempted = False
    refinement_successful = False

    with timer.track("postprocess", "canonicalize_resume"):
        improved_data = _canonicalize_improved_resume_data(improved_data)
        improved_text = json.dumps(improved_data, indent=2)
        preview_hash = _hash_improved_data(improved_data)
    preview_hashes = job.get("preview_hashes")
    if not isinstance(preview_hashes, dict):
        preview_hashes = {}
    preview_hashes[prompt_id] = preview_hash
    # NOTE: preview_hashes updates are last-write-wins; concurrent previews can race.
    with timer.track("job_preview_hash", "persist"):
        _set_stage(stage_state, "persist_preview_hash")
        try:
            updated_job = db.update_job(
                request.job_id,
                {
                    "preview_hash": preview_hash,
                    "preview_prompt_id": prompt_id,
                    "preview_hashes": preview_hashes,
                },
            )
            if not updated_job:
                logger.warning(
                    "Failed to persist preview hash for job %s.", request.job_id
                )
        except Exception as e:
            logger.warning(
                "Failed to persist preview hash for job %s: %s", request.job_id, e
            )
    with timer.track("diff", "calculate"):
        _set_stage(stage_state, "calculate_diff")
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
    if diff_error:
        response_warnings.append(f"Could not calculate changes: {diff_error}")
    with timer.track("improvements", "build_suggestions"):
        improvements = generate_improvements(job_keywords)

    with timer.track("auxiliary_messages", "generate_cover_letter_outreach"):
        _set_stage(stage_state, "generate_auxiliary_messages")
        (
            cover_letter,
            outreach_message,
            generated_title,
            aux_warnings,
        ) = await _generate_auxiliary_messages(
            improved_data,
            job["content"],
            job_keywords,
            language,
            include_cover_letter=include_cover_letter,
            include_outreach_message=include_outreach_message,
        )
    response_warnings.extend(aux_warnings)
    with timer.track("target_metadata", "merge"):
        job = _backfill_job_target_metadata(
            job_id=request.job_id,
            job=job,
            job_keywords=job_keywords,
        )
        target_role, target_company, target_location = _merge_target_metadata(
            job,
            job_description=job["content"],
            job_keywords=job_keywords,
            title=generated_title,
        )
        generated_title = generated_title or _compose_target_title(target_role, target_company)
    with timer.track("llm_trace", "summarize_calls"):
        llm_summary = db.summarize_llm_calls(trace_id=request_id)
    with timer.track("llm_trace", "aggregate_operation_timing"):
        _append_llm_timing_entries(timer, trace_id=request_id)

    with timer.track("application_pack", "create"):
        _set_stage(stage_state, "create_application_pack")
        application_pack = db.create_application_pack(
            base_resume_id=request.resume_id,
            job_id=request.job_id,
            status="preview_ready",
            company=target_company,
            role=target_role,
            location=target_location,
            theme_settings=theme_settings.to_storage_dict(),
        )
    with timer.track("generation_run", "create_preview_run"):
        preview_run = db.create_generation_run(
            run_kind="application_pack_preview",
            status="completed",
            source_resume_id=request.resume_id,
            job_id=request.job_id,
            application_pack_id=application_pack["pack_id"],
            prompt_id=prompt_id,
            request_payload={"prompt_id": prompt_id, "llm_trace_id": request_id},
            result_payload={
                "llm_summary": llm_summary,
                "preview_hash": preview_hash,
                "diff_summary": diff_summary.model_dump() if diff_summary else None,
                "change_manifest": [change.model_dump() for change in tailoring_result.change_manifest],
                "declared_changes": [change.model_dump() for change in tailoring_result.declared_changes],
                "rejected_declared_changes": [
                    change.model_dump() for change in tailoring_result.rejected_declared_changes
                ],
                "cleanup_changes": [change.model_dump() for change in tailoring_result.cleanup_changes],
                "change_breakdown": tailoring_result.stage_breakdown.model_dump(),
                "raw_llm_resume_data": tailoring_result.raw_llm_resume_data,
                "final_resume_data": improved_data,
                "auxiliary": {
                    "title": generated_title,
                    "cover_letter": cover_letter,
                    "outreach_message": outreach_message,
                },
            },
            warnings=response_warnings,
        )
    artifacts: list[dict[str, Any]] = []
    try:
        with timer.track("rendercv", "render_and_store_preview_artifacts"):
            _set_stage(stage_state, "render_preview_artifacts")
            bundle = render_resume_bundle(
                improved_data,
                theme_settings,
                identifier=resume.get("title") or request.resume_id,
            )
            artifacts = store_rendercv_bundle(
                bundle,
                resume_id=request.resume_id,
                application_pack_id=application_pack["pack_id"],
                generation_run_id=preview_run["generation_run_id"],
            )
    except RenderCVRenderError as e:
        response_warnings.append(f"RenderCV preview failed: {str(e)}")

    with timer.track("application_pack", "link_generation_run"):
        db.update_application_pack(
            application_pack["pack_id"],
            {"generation_run_id": preview_run["generation_run_id"]},
        )
    pipeline_timing = timer.to_summary()
    _set_stage(stage_state, "update_generation_run")
    db.update_generation_run(
        preview_run["generation_run_id"],
        {
            "warnings": response_warnings,
            "result_payload": {
                "llm_summary": llm_summary,
                "preview_hash": preview_hash,
                "diff_summary": diff_summary.model_dump() if diff_summary else None,
                "change_manifest": [change.model_dump() for change in tailoring_result.change_manifest],
                "declared_changes": [change.model_dump() for change in tailoring_result.declared_changes],
                "rejected_declared_changes": [
                    change.model_dump() for change in tailoring_result.rejected_declared_changes
                ],
                "cleanup_changes": [change.model_dump() for change in tailoring_result.cleanup_changes],
                "change_breakdown": tailoring_result.stage_breakdown.model_dump(),
                "raw_llm_resume_data": tailoring_result.raw_llm_resume_data,
                "final_resume_data": improved_data,
                "artifact_ids": [artifact["artifact_id"] for artifact in artifacts],
                "auxiliary": {
                    "title": generated_title,
                    "cover_letter": cover_letter,
                    "outreach_message": outreach_message,
                },
                "pipeline_timing": pipeline_timing.model_dump(),
            },
        },
    )

    return ImproveResumeResponse(
        request_id=request_id,
        data=ImproveResumeData(
            request_id=request_id,
            resume_id=None,
            application_pack_id=application_pack["pack_id"],
            generation_run_id=preview_run["generation_run_id"],
            job_id=request.job_id,
            resume_preview=ResumeData.model_validate(improved_data),
            improvements=[
                {
                    "suggestion": imp["suggestion"],
                    "lineNumber": imp.get("lineNumber"),
                }
                for imp in improvements
            ],
            markdownOriginal=resume["content"],
            markdownImproved=improved_text,
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            artifacts=artifacts,
            theme_settings=theme_settings.to_dict(),
            diff_summary=diff_summary,
            detailed_changes=detailed_changes,
            change_manifest=tailoring_result.change_manifest,
            change_breakdown=tailoring_result.stage_breakdown,
            refinement_stats=refinement_stats,
            bold_keywords=tailoring_result.bold_keywords,
            warnings=response_warnings,
            refinement_attempted=refinement_attempted,
            refinement_successful=refinement_successful,
            pipeline_timing=pipeline_timing,
        ),
    )


@router.post("/improve/confirm", response_model=ImproveResumeResponse)
async def improve_resume_confirm_endpoint(
    request: ImproveResumeConfirmRequest,
) -> ImproveResumeResponse:
    """Confirm and persist a tailored resume."""
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = get_content_language()
    theme_settings = _resolve_request_theme_settings(
        request_theme_settings=request.theme_settings,
        resume=resume,
        application_pack_id=request.application_pack_id,
    )
    include_cover_letter, include_outreach_message = _resolve_auxiliary_include_flags(
        include_cover_letter=request.include_cover_letter,
        include_outreach_message=request.include_outreach_message,
    )
    request_id = str(uuid4())

    stage = "serialize_improved_data"
    detail = "Failed to confirm resume. Please try again."
    try:
        improved_data = _canonicalize_improved_resume_data(request.improved_data)
        improved_text = json.dumps(improved_data, indent=2)
        preview_tailoring_payload = _read_preview_tailoring_payload(request.generation_run_id)
        # NOTE: This endpoint relies on preview-hash validation to ensure the payload matches a prior preview.
        # Stronger guarantees would require server-side preview storage or re-running the improvement.
        try:
            allowed_mismatches: set[str] = set()
            job_keywords_for_validation = (
                job.get("job_keywords") if isinstance(job.get("job_keywords"), dict) else None
            )
            if isinstance(job_keywords_for_validation, dict):
                location = job_keywords_for_validation.get("location")
                if isinstance(location, str) and location.strip():
                    allowed_mismatches.add("location")
            _validate_confirm_payload(
                _get_original_resume_data(resume),
                improved_data,
                allowed_personal_info_mismatches=allowed_mismatches,
            )
        except ValueError as e:
            logger.warning("Resume confirm rejected: %s", e)
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )
        preview_hashes = job.get("preview_hashes")
        allowed_hashes: set[str] = set()
        if isinstance(preview_hashes, dict):
            allowed_hashes.update(preview_hashes.values())
        elif isinstance(preview_hashes, list):
            allowed_hashes.update(
                [value for value in preview_hashes if isinstance(value, str)]
            )
        else:
            preview_hash = job.get("preview_hash")
            if isinstance(preview_hash, str):
                allowed_hashes.add(preview_hash)

        if not allowed_hashes:
            logger.warning(
                "Rejecting confirm; preview hash missing for job %s.",
                request.job_id,
            )
            raise HTTPException(
                status_code=400,
                detail="Preview required before confirmation. Please retry preview.",
            )

        request_hashes = {_hash_improved_data(improved_data)}
        request_hashes.update(_legacy_improved_data_hash_candidates(request.improved_data))
        if request_hashes.isdisjoint(allowed_hashes):
            logger.warning("Resume confirm rejected due to preview hash mismatch.")
            raise HTTPException(
                status_code=400,
                detail="Invalid improved resume data. Please retry preview.",
            )

        stage = "calculate_diff"
        response_warnings: list[str] = []
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")
        change_manifest = preview_tailoring_payload.get("change_manifest")
        change_breakdown = preview_tailoring_payload.get("change_breakdown")
        if not isinstance(change_manifest, list):
            change_manifest = build_change_manifest(_get_original_resume_data(resume), improved_data)
        if not isinstance(change_breakdown, dict):
            location_value = None
            location_source = "none"
            personal_info = improved_data.get("personalInfo")
            if isinstance(personal_info, dict):
                location = personal_info.get("location")
                if isinstance(location, str) and location.strip():
                    location_source = "master"
                    location_value = location.strip()
            change_breakdown = build_stage_breakdown(
                declared_changes=[],
                computed_llm_changes=change_manifest,
                applied_changes=change_manifest,
                rejected_declared_changes=[],
                cleanup_only_changes=[],
                location_source=location_source,
                location_value=location_value,
            ).model_dump()

        stage = "generate_auxiliary_messages"
        with llm_trace_scope(
            request_id,
            "resumes.improve_confirm",
            {
                "resume_id": request.resume_id,
                "job_id": request.job_id,
                "application_pack_id": request.application_pack_id,
            },
        ):
            (
                cover_letter,
                outreach_message,
                title,
                aux_warnings,
            ) = await _resolve_confirm_auxiliary_messages(
                generation_run_id=request.generation_run_id,
                improved_data=improved_data,
                job_content=job["content"],
                job_keywords=(
                    job.get("job_keywords")
                    if isinstance(job.get("job_keywords"), dict)
                    else None
                ),
                language=language,
                include_cover_letter=include_cover_letter,
                include_outreach_message=include_outreach_message,
            )
            llm_summary = db.summarize_llm_calls(trace_id=request_id)
        response_warnings.extend(aux_warnings)
        job = _backfill_job_target_metadata(
            job_id=request.job_id,
            job=job,
            job_keywords=job.get("job_keywords") if isinstance(job.get("job_keywords"), dict) else None,
        )
        target_role, target_company, target_location = _merge_target_metadata(
            job,
            job_description=job["content"],
            job_keywords=job.get("job_keywords") if isinstance(job.get("job_keywords"), dict) else None,
            title=title,
        )
        title = title or _compose_target_title(target_role, target_company)

        stage = "create_resume"
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title,
            application_pack_id=request.application_pack_id,
            theme_settings=theme_settings.to_storage_dict(),
        )

        improvements_payload = [imp.model_dump() for imp in request.improvements]
        stage = "create_improvement"
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements_payload,
        )
        application_pack_id = request.application_pack_id
        if application_pack_id:
            db.update_application_pack(
                application_pack_id,
                {
                    "tailored_resume_id": tailored_resume["resume_id"],
                    "status": "confirmed",
                    "company": target_company,
                    "role": target_role,
                    "location": target_location,
                    "theme_settings": theme_settings.to_storage_dict(),
                },
            )
        else:
            created_pack = db.create_application_pack(
                base_resume_id=request.resume_id,
                job_id=request.job_id,
                status="confirmed",
                company=target_company,
                role=target_role,
                location=target_location,
                theme_settings=theme_settings.to_storage_dict(),
            )
            application_pack_id = created_pack["pack_id"]
            db.update_resume(
                tailored_resume["resume_id"], {"application_pack_id": application_pack_id}
            )

        confirm_run = db.create_generation_run(
            run_kind="application_pack_confirm",
            status="completed",
            source_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            application_pack_id=application_pack_id,
            request_payload={
                "preview_generation_run_id": request.generation_run_id,
                "application_pack_id": application_pack_id,
                "llm_trace_id": request_id,
            },
            result_payload={
                "llm_summary": llm_summary,
                "diff_summary": diff_summary.model_dump() if diff_summary else None,
                "change_manifest": change_manifest,
                "declared_changes": preview_tailoring_payload.get("declared_changes", []),
                "rejected_declared_changes": preview_tailoring_payload.get(
                    "rejected_declared_changes", []
                ),
                "cleanup_changes": preview_tailoring_payload.get("cleanup_changes", []),
                "change_breakdown": change_breakdown,
                "raw_llm_resume_data": preview_tailoring_payload.get("raw_llm_resume_data"),
                "final_resume_data": improved_data,
                "auxiliary": {
                    "title": title,
                    "cover_letter": cover_letter,
                    "outreach_message": outreach_message,
                },
            },
            warnings=response_warnings,
        )

        artifacts: list[dict[str, Any]] = []
        try:
            bundle = render_resume_bundle(
                improved_data,
                theme_settings,
                identifier=title or tailored_resume["resume_id"],
            )
            artifacts = store_rendercv_bundle(
                bundle,
                resume_id=tailored_resume["resume_id"],
                application_pack_id=application_pack_id,
                generation_run_id=confirm_run["generation_run_id"],
            )
        except RenderCVRenderError as e:
            response_warnings.append(f"RenderCV final render failed: {str(e)}")

        db.update_application_pack(
            application_pack_id,
            {
                "generation_run_id": confirm_run["generation_run_id"],
                "tailored_resume_id": tailored_resume["resume_id"],
                "status": "confirmed",
            },
        )
        db.update_generation_run(
            confirm_run["generation_run_id"],
            {
                "warnings": response_warnings,
                "result_payload": {
                    "llm_summary": llm_summary,
                    "diff_summary": diff_summary.model_dump() if diff_summary else None,
                    "change_manifest": change_manifest,
                    "declared_changes": preview_tailoring_payload.get("declared_changes", []),
                    "rejected_declared_changes": preview_tailoring_payload.get(
                        "rejected_declared_changes", []
                    ),
                    "cleanup_changes": preview_tailoring_payload.get("cleanup_changes", []),
                    "change_breakdown": change_breakdown,
                    "raw_llm_resume_data": preview_tailoring_payload.get("raw_llm_resume_data"),
                    "final_resume_data": improved_data,
                    "artifact_ids": [artifact["artifact_id"] for artifact in artifacts],
                    "auxiliary": {
                        "title": title,
                        "cover_letter": cover_letter,
                        "outreach_message": outreach_message,
                    },
                },
            },
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                application_pack_id=application_pack_id,
                generation_run_id=confirm_run["generation_run_id"],
                job_id=request.job_id,
                resume_preview=request.improved_data,
                improvements=request.improvements,
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                artifacts=artifacts,
                theme_settings=theme_settings.to_dict(),
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                change_manifest=change_manifest,
                change_breakdown=change_breakdown,
                warnings=response_warnings,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        _raise_improve_error("confirm", stage, e, detail)


@router.post("/improve", response_model=ImproveResumeResponse)
async def improve_resume_endpoint(
    request: ImproveResumeRequest,
) -> ImproveResumeResponse:
    """Improve/tailor a resume for a specific job description.

    Uses LLM to analyze the job and generate an optimized resume version
    with improvement suggestions. Also generates cover letter and outreach
    message together using a single merged message request.
    Persists the tailored resume and returns a non-null resume_id.
    """
    # Fetch resume
    resume = db.get_resume(request.resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Fetch job description
    job = db.get_job(request.job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job description not found")

    language = get_content_language()
    stage_state = {"stage": "load_job_keywords"}
    detail = "Failed to improve resume. Please try again."
    request_id = str(uuid4())
    include_cover_letter, include_outreach_message = _resolve_auxiliary_include_flags(
        include_cover_letter=request.include_cover_letter,
        include_outreach_message=request.include_outreach_message,
    )

    try:
        _set_stage(stage_state, "load_job_keywords")
        with llm_trace_scope(
            request_id,
            "resumes.improve",
            {"resume_id": request.resume_id, "job_id": request.job_id},
        ):
            job_keywords = await extract_job_keywords(job["content"])

        # Generate improved resume in the configured language
        prompt_id = _resolve_prompt_id(request.prompt_id)
        with llm_trace_scope(
            request_id,
            "resumes.improve",
            {
                "resume_id": request.resume_id,
                "job_id": request.job_id,
                "prompt_id": prompt_id,
            },
        ):
            tailoring_result = await _generate_tailored_resume_data(
                resume=resume,
                job=job,
                job_keywords=job_keywords,
                language=language,
                prompt_id=prompt_id,
                stage_state=stage_state,
            )
            improved_data = tailoring_result.resume_data
            response_warnings = list(tailoring_result.warnings)

        refinement_stats: RefinementStats | None = None
        refinement_attempted = False
        refinement_successful = False

        # Convert improved data to JSON string for storage
        improved_text = json.dumps(improved_data, indent=2)

        # Calculate differences between original and improved resume
        _set_stage(stage_state, "calculate_diff")
        diff_summary, detailed_changes, diff_error = _calculate_diff_from_resume(
            resume,
            improved_data,
        )
        if diff_error:
            response_warnings.append(f"Could not calculate changes: {diff_error}")

        # Generate improvement suggestions
        improvements = generate_improvements(job_keywords)

        # Generate cover letter, outreach message, and title.
        _set_stage(stage_state, "generate_auxiliary_messages")
        with llm_trace_scope(
            request_id,
            "resumes.improve",
            {"resume_id": request.resume_id, "job_id": request.job_id},
        ):
            (
                cover_letter,
                outreach_message,
                title,
                aux_warnings,
            ) = await _generate_auxiliary_messages(
                improved_data,
                job["content"],
                job_keywords,
                language,
                include_cover_letter=include_cover_letter,
                include_outreach_message=include_outreach_message,
            )
        response_warnings.extend(aux_warnings)
        job = _backfill_job_target_metadata(
            job_id=request.job_id,
            job=job,
            job_keywords=job_keywords,
        )

        # Store the tailored resume with cover letter, outreach message, and title
        _set_stage(stage_state, "create_resume")
        tailored_resume = db.create_resume(
            content=improved_text,
            content_type="json",
            filename=f"tailored_{resume.get('filename', 'resume')}",
            is_master=False,
            parent_id=request.resume_id,
            processed_data=improved_data,
            processing_status="ready",
            cover_letter=cover_letter,
            outreach_message=outreach_message,
            title=title,
        )

        # Store improvement record
        _set_stage(stage_state, "create_improvement")
        db.create_improvement(
            original_resume_id=request.resume_id,
            tailored_resume_id=tailored_resume["resume_id"],
            job_id=request.job_id,
            improvements=improvements,
        )

        return ImproveResumeResponse(
            request_id=request_id,
            data=ImproveResumeData(
                request_id=request_id,
                resume_id=tailored_resume["resume_id"],
                job_id=request.job_id,
                resume_preview=ResumeData.model_validate(improved_data),
                improvements=[
                    {
                        "suggestion": imp["suggestion"],
                        "lineNumber": imp.get("lineNumber"),
                    }
                    for imp in improvements
                ],
                markdownOriginal=resume["content"],
                markdownImproved=improved_text,
                cover_letter=cover_letter,
                outreach_message=outreach_message,
                # Diff metadata
                diff_summary=diff_summary,
                detailed_changes=detailed_changes,
                change_manifest=tailoring_result.change_manifest,
                change_breakdown=tailoring_result.stage_breakdown,
                refinement_stats=refinement_stats,
                warnings=response_warnings,
                refinement_attempted=refinement_attempted,
                refinement_successful=refinement_successful,
            ),
        )

    except Exception as e:
        _raise_improve_error("improve", stage_state["stage"], e, detail)


@router.patch("/{resume_id}", response_model=ResumeFetchResponse)
async def update_resume_endpoint(
    resume_id: str, resume_payload: ResumeUpdateRequest | ResumeData
) -> ResumeFetchResponse:
    """Update a resume with new structured data."""
    existing = db.get_resume(resume_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    incoming_theme_settings: RenderThemeProfile | None = None
    if isinstance(resume_payload, ResumeUpdateRequest):
        updated_data = resume_payload.processed_resume.model_dump()
        if resume_payload.theme_settings is not None:
            incoming_theme_settings = _resolve_render_theme_settings(
                resume_payload.theme_settings
            )
    else:
        updated_data = resume_payload.model_dump()
    updated = _save_resume_payload(
        resume_id=resume_id,
        updated_data=updated_data,
        theme_settings=incoming_theme_settings,
    )

    return ResumeFetchResponse(
        request_id=str(uuid4()),
        data=_build_resume_fetch_data(
            resume_id=resume_id,
            raw_content=updated["content"],
            processed_data=updated.get("processed_data") or updated_data,
            theme_settings=_resolve_render_theme_settings(
                _normalize_stored_theme_settings(
                    updated.get("theme_settings"),
                    resume_id=resume_id,
                )
            ),
            raw_created_at=updated.get("created_at"),
            processing_status=updated.get("processing_status", "ready"),
            cover_letter=updated.get("cover_letter"),
            outreach_message=updated.get("outreach_message"),
            parent_id=updated.get("parent_id"),
            title=updated.get("title"),
            application_pack_id=updated.get("application_pack_id"),
        ),
    )


@router.patch("/{resume_id}/draft", response_model=ResumeDraftNormalizedResponse)
async def save_resume_draft(
    resume_id: str,
    request: ResumeDraftRequest,
) -> ResumeDraftNormalizedResponse:
    existing = db.get_resume(resume_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Resume not found")

    normalized_data, theme_settings, yaml_sections = _normalize_draft_request(
        request,
        base_resume=_get_original_resume_data(existing),
        base_theme_settings=_stored_or_default_theme_settings(existing),
    )

    updated = _save_resume_payload(
        resume_id=resume_id,
        updated_data=normalized_data,
        theme_settings=theme_settings,
    )

    return ResumeDraftNormalizedResponse(
        request_id=str(uuid4()),
        data=_build_resume_fetch_data(
            resume_id=resume_id,
            raw_content=updated["content"],
            processed_data=updated.get("processed_data") or normalized_data,
            theme_settings=_resolve_render_theme_settings(
                _normalize_stored_theme_settings(
                    updated.get("theme_settings"),
                    resume_id=resume_id,
                )
            ),
            raw_created_at=updated.get("created_at"),
            processing_status=updated.get("processing_status", "ready"),
            cover_letter=updated.get("cover_letter"),
            outreach_message=updated.get("outreach_message"),
            parent_id=updated.get("parent_id"),
            title=updated.get("title"),
            application_pack_id=updated.get("application_pack_id"),
        ),
        yaml_sections=yaml_sections,
    )


@router.post("/{resume_id}/pdf")
async def download_resume_pdf_with_config(
    resume_id: str,
    request: RenderResumeRequest,
) -> Response:
    """Generate a RenderCV PDF using the provided rich config."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = _get_original_resume_data(resume)
    if not resume_data:
        raise HTTPException(
            status_code=409,
            detail="Resume has no structured data for RenderCV rendering.",
        )

    theme_settings = _resolve_render_theme_settings(request.theme_settings)

    try:
        bundle = render_resume_bundle(
            resume_data,
            theme_settings,
            identifier=resume.get("title") or resume_id,
        )
        artifacts = store_rendercv_bundle(bundle, resume_id=resume_id)
        pdf_artifact = next(
            (artifact for artifact in artifacts if artifact["kind"] == "resume_pdf"),
            None,
        )
        if pdf_artifact is None:
            raise HTTPException(
                status_code=500,
                detail="RenderCV did not produce a PDF artifact.",
            )
        pdf_bytes = Path(pdf_artifact["storage_path"]).read_bytes()
    except RenderCVRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    download_name = _resume_pdf_filename(
        resume=resume,
        resume_id=resume_id,
        resume_data=resume_data,
    )
    headers = {"Content-Disposition": f'attachment; filename="{download_name}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.get("/{resume_id}/pdf")
async def download_resume_pdf(
    resume_id: str,
    template: str = Query("swiss-single"),
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    marginTop: int = Query(10, ge=5, le=25),
    marginBottom: int = Query(10, ge=5, le=25),
    marginLeft: int = Query(10, ge=5, le=25),
    marginRight: int = Query(10, ge=5, le=25),
    sectionSpacing: int = Query(3, ge=1, le=5),
    itemSpacing: int = Query(2, ge=1, le=5),
    lineHeight: int = Query(3, ge=1, le=5),
    fontSize: int = Query(3, ge=1, le=5),
    headerScale: int = Query(3, ge=1, le=5),
    headerFont: str = Query("serif", pattern="^(serif|sans-serif|mono)$"),
    bodyFont: str = Query("sans-serif", pattern="^(serif|sans-serif|mono)$"),
    compactMode: bool = Query(False),
    showContactIcons: bool = Query(False),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),
    useSavedThemeSettings: bool = Query(False),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
) -> Response:
    """Generate a PDF for a resume using RenderCV."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = _get_original_resume_data(resume)
    if not resume_data:
        raise HTTPException(
            status_code=409,
            detail="Resume has no structured data for RenderCV rendering.",
        )

    if useSavedThemeSettings:
        theme_settings = _stored_or_default_theme_settings(resume)
    else:
        theme_settings = legacy_to_theme_settings(
            template=template,
            page_size=pageSize,
            compact_mode=compactMode,
            section_spacing=sectionSpacing,
            item_spacing=itemSpacing,
            line_height=lineHeight,
            accent_color=accentColor,
            show_contact_icons=showContactIcons,
            margin_top=marginTop,
            margin_bottom=marginBottom,
            margin_left=marginLeft,
            margin_right=marginRight,
        )

    try:
        bundle = render_resume_bundle(
            resume_data,
            theme_settings,
            identifier=resume.get("title") or resume_id,
        )
        artifacts = store_rendercv_bundle(bundle, resume_id=resume_id)
        pdf_artifact = next(
            (artifact for artifact in artifacts if artifact["kind"] == "resume_pdf"),
            None,
        )
        if pdf_artifact is None:
            raise HTTPException(
                status_code=500,
                detail="RenderCV did not produce a PDF artifact.",
            )
        pdf_bytes = Path(pdf_artifact["storage_path"]).read_bytes()
    except RenderCVRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    download_name = _resume_pdf_filename(
        resume=resume,
        resume_id=resume_id,
        resume_data=resume_data,
    )
    headers = {"Content-Disposition": f'attachment; filename="{download_name}"'}
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@router.post("/{resume_id}/render-preview")
async def render_resume_preview_with_config(
    resume_id: str,
    request: RenderResumeRequest,
) -> dict:
    """Render a preview using the provided rich RenderCV config."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = _get_original_resume_data(resume)
    if not resume_data:
        raise HTTPException(
            status_code=409,
            detail="Resume has no structured data for RenderCV rendering.",
        )

    theme_settings = _resolve_render_theme_settings(request.theme_settings)

    try:
        bundle = render_resume_bundle(
            resume_data,
            theme_settings,
            identifier=resume.get("title") or resume_id,
        )
        artifacts = store_rendercv_bundle(bundle, resume_id=resume_id)
    except RenderCVRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    preview_artifacts = [
        artifact for artifact in artifacts if artifact["kind"] == "resume_preview_png"
    ]

    return {
        "resume_id": resume_id,
        "theme_settings": theme_settings.to_dict(),
        "artifacts": artifacts,
        "preview_artifacts": preview_artifacts,
        "pdf_artifact": next(
            (artifact for artifact in artifacts if artifact["kind"] == "resume_pdf"),
            None,
        ),
    }


@router.get("/{resume_id}/render-preview")
async def render_resume_preview(
    resume_id: str,
    template: str = Query("swiss-single"),
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    marginTop: int = Query(10, ge=5, le=25),
    marginBottom: int = Query(10, ge=5, le=25),
    marginLeft: int = Query(10, ge=5, le=25),
    marginRight: int = Query(10, ge=5, le=25),
    sectionSpacing: int = Query(3, ge=1, le=5),
    itemSpacing: int = Query(2, ge=1, le=5),
    lineHeight: int = Query(3, ge=1, le=5),
    compactMode: bool = Query(False),
    showContactIcons: bool = Query(False),
    accentColor: str = Query("blue", pattern="^(blue|green|orange|red)$"),
    useSavedThemeSettings: bool = Query(False),
) -> dict:
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    resume_data = _get_original_resume_data(resume)
    if not resume_data:
        raise HTTPException(
            status_code=409,
            detail="Resume has no structured data for RenderCV rendering.",
        )

    if useSavedThemeSettings:
        theme_settings = _stored_or_default_theme_settings(resume)
    else:
        theme_settings = legacy_to_theme_settings(
            template=template,
            page_size=pageSize,
            compact_mode=compactMode,
            section_spacing=sectionSpacing,
            item_spacing=itemSpacing,
            line_height=lineHeight,
            accent_color=accentColor,
            show_contact_icons=showContactIcons,
            margin_top=marginTop,
            margin_bottom=marginBottom,
            margin_left=marginLeft,
            margin_right=marginRight,
        )

    try:
        bundle = render_resume_bundle(
            resume_data,
            theme_settings,
            identifier=resume.get("title") or resume_id,
        )
        artifacts = store_rendercv_bundle(bundle, resume_id=resume_id)
    except RenderCVRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    preview_artifacts = [
        artifact for artifact in artifacts if artifact["kind"] == "resume_preview_png"
    ]

    return {
        "resume_id": resume_id,
        "theme_settings": theme_settings.to_dict(),
        "artifacts": artifacts,
        "preview_artifacts": preview_artifacts,
        "pdf_artifact": next(
            (artifact for artifact in artifacts if artifact["kind"] == "resume_pdf"),
            None,
        ),
    }


@router.delete("/{resume_id}")
async def delete_resume(resume_id: str) -> dict:
    """Delete a resume by ID."""
    if not db.delete_resume(resume_id):
        raise HTTPException(status_code=404, detail="Resume not found")

    return {"message": "Resume deleted successfully"}


@router.post("/{resume_id}/retry-processing", response_model=ResumeUploadResponse)
async def retry_processing(resume_id: str) -> ResumeUploadResponse:
    """Retry AI processing for a failed or stuck resume.

    Re-runs parse_resume_to_json() on the stored markdown content.
    Works for resumes with processing_status == "failed" or "processing".
    """
    request_id = str(uuid4())
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    if resume.get("processing_status") not in ("failed", "processing"):
        raise HTTPException(
            status_code=400,
            detail="Only resumes with 'failed' or 'processing' status can be retried.",
        )

    markdown_content = resume.get("content", "")
    if not markdown_content:
        raise HTTPException(
            status_code=400,
            detail="Resume has no stored content to re-process.",
        )

    with llm_trace_scope(
        request_id,
        "resumes.retry_processing",
        {"resume_id": resume_id},
    ):
        try:
            processed_data = await parse_resume_to_json(markdown_content)
            db.update_resume(
                resume_id,
                {
                    "processed_data": processed_data,
                    "processing_status": "ready",
                },
            )
            return ResumeUploadResponse(
                message="Resume processing succeeded on retry",
                request_id=request_id,
                resume_id=resume_id,
                processing_status="ready",
                is_master=resume.get("is_master", False),
            )
        except Exception as e:
            logger.warning(f"Retry processing failed for resume {resume_id}: {e}")
            db.update_resume(resume_id, {"processing_status": "failed"})
            return ResumeUploadResponse(
                message="Retry processing failed",
                request_id=request_id,
                resume_id=resume_id,
                processing_status="failed",
                is_master=resume.get("is_master", False),
            )


@router.patch("/{resume_id}/cover-letter")
async def update_cover_letter(
    resume_id: str, request: UpdateCoverLetterRequest
) -> dict:
    """Update the cover letter for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"cover_letter": request.content})
    return {"message": "Cover letter updated successfully"}


@router.patch("/{resume_id}/outreach-message")
async def update_outreach_message(
    resume_id: str, request: UpdateOutreachMessageRequest
) -> dict:
    """Update the outreach message for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    db.update_resume(resume_id, {"outreach_message": request.content})
    return {"message": "Outreach message updated successfully"}


@router.patch("/{resume_id}/title")
async def update_title(resume_id: str, request: UpdateTitleRequest) -> dict:
    """Update the title for a resume."""
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    title = request.title.strip()[:80]
    db.update_resume(resume_id, {"title": title})
    return {"message": "Title updated successfully"}


@router.post(
    "/{resume_id}/generate-cover-letter", response_model=GenerateContentResponse
)
async def generate_cover_letter_endpoint(resume_id: str) -> GenerateContentResponse:
    """Generate a cover letter on-demand for an existing tailored resume.

    This endpoint allows users to generate a cover letter after a resume has been
    tailored, without needing to re-tailor the entire resume. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Cover letter can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    language = get_content_language()

    # Generate the shared auxiliary package once and return the requested field.
    try:
        cover_letter_content, outreach_content = await generate_cover_letter_and_outreach(
            resume_data,
            job["content"],
            language,
        )
    except Exception as e:
        logger.error(f"Cover letter generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate cover letter. Please try again.",
        )

    # Save both outputs from the merged generation.
    db.update_resume(
        resume_id,
        {
            "cover_letter": cover_letter_content,
            "outreach_message": outreach_content,
        },
    )

    return GenerateContentResponse(
        content=cover_letter_content,
        message="Cover letter generated successfully",
    )


@router.post("/{resume_id}/generate-outreach", response_model=GenerateContentResponse)
async def generate_outreach_endpoint(resume_id: str) -> GenerateContentResponse:
    """Generate an outreach message on-demand for an existing tailored resume.

    This endpoint allows users to generate a cold outreach message after a resume
    has been tailored. It requires:
    - The resume must be a tailored resume (has parent_id)
    - The resume must have an associated job context in the improvements table
    """
    # Get the resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Outreach message can only be generated for tailored resumes. "
            "Please tailor this resume to a job description first.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    # Get resume data
    resume_data = resume.get("processed_data")
    if not resume_data:
        raise HTTPException(
            status_code=400,
            detail="Resume has no processed data. Please re-upload the resume.",
        )

    # Get language setting
    language = get_content_language()

    # Generate the shared auxiliary package once and return the requested field.
    try:
        cover_letter_content, outreach_content = await generate_cover_letter_and_outreach(
            resume_data,
            job["content"],
            language,
        )
    except Exception as e:
        logger.error(f"Outreach message generation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to generate outreach message. Please try again.",
        )

    # Save both outputs from the merged generation.
    db.update_resume(
        resume_id,
        {
            "cover_letter": cover_letter_content,
            "outreach_message": outreach_content,
        },
    )

    return GenerateContentResponse(
        content=outreach_content,
        message="Outreach message generated successfully",
    )


@router.get("/{resume_id}/job-description")
async def get_job_description_for_resume(resume_id: str) -> dict:
    """Get the job description used to tailor this resume.

    This endpoint retrieves the original job description that was used
    to tailor a resume. Only works for tailored resumes (those with parent_id).
    """
    # Get the resume
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # Check if it's a tailored resume (has parent_id)
    if not resume.get("parent_id"):
        raise HTTPException(
            status_code=400,
            detail="Job description is only available for tailored resumes.",
        )

    # Get improvement record to find the job_id
    improvement = db.get_improvement_by_tailored_resume(resume_id)
    if not improvement:
        raise HTTPException(
            status_code=400,
            detail="No job context found for this resume. "
            "The resume may have been created before job tracking was implemented.",
        )

    # Get the job description
    job = db.get_job(improvement["job_id"])
    if not job:
        raise HTTPException(
            status_code=404,
            detail="The associated job description was not found.",
        )

    return {
        "job_id": job["job_id"],
        "content": job["content"],
    }


@router.get("/{resume_id}/cover-letter/pdf")
async def download_cover_letter_pdf(
    resume_id: str,
    pageSize: str = Query("A4", pattern="^(A4|LETTER)$"),
    lang: str | None = Query(None, pattern="^[a-z]{2}(-[A-Z]{2})?$"),
) -> Response:
    """Generate a PDF for a cover letter using headless Chromium.

    Args:
        resume_id: The ID of the resume containing the cover letter
        pageSize: A4 or LETTER
        lang: locale used for print page translations
    """
    resume = db.get_resume(resume_id)
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    cover_letter = resume.get("cover_letter")
    if not cover_letter:
        raise HTTPException(
            status_code=404, detail="No cover letter found for this resume"
        )

    # Build print URL (same pattern as resume PDF)
    url = f"{settings.frontend_base_url}/print/cover-letter/{resume_id}?pageSize={pageSize}"
    if lang:
        url = f"{url}&lang={lang}"

    # Render PDF with cover letter selector
    try:
        pdf_bytes = await render_resume_pdf(
            url, pageSize, selector=".cover-letter-print"
        )
    except PDFRenderError as e:
        raise HTTPException(status_code=503, detail=str(e))

    headers = {
        "Content-Disposition": f'attachment; filename="cover_letter_{resume_id}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)
