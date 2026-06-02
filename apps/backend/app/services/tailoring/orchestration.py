"""Primary single-prompt tailoring orchestration."""

from __future__ import annotations

from contextlib import nullcontext
import logging
from typing import Any, Awaitable, Callable

from pydantic import ValidationError

from app.config import get_enable_critique, settings
from app.llm import get_llm_trace_id
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID
from app.prompts.tailoring_blocks import TAILORING_MODE_STRATEGY

from app.services.tailoring.change_manifest import (
    build_change_manifest,
    build_stage_breakdown,
    enrich_change_manifest_with_tailored_cells,
    supplement_change_manifest_with_unchanged_cell_rationales,
    validate_declared_changes,
)
from app.services.tailoring.contracts import build_response_contract, compute_adaptive_max_tokens
from app.services.tailoring.diffing import calculate_resume_diff
from app.services.tailoring.models import (
    TailoringLLMResponse,
    TailoringLLMResponseV2,
    TailoringResult,
    TailoringResumePayload,
)
from app.services.tailoring.preservation import (
    apply_compact_diff,
    finalize_tailored_resume,
    rehydrate_tailoring_resume,
)
from app.services.tailoring.skills_observability import build_skills_observability_v1
from app.services.tailoring.validation import DiffValidationResult, validate_compact_diff
from app.services.tailoring.llm_calls import run_primary_tailoring
from app.services.tailoring.prompting import build_prompt_context
from app.services.tailoring.jd_intel_blob import filter_basic_resume_terms

logger = logging.getLogger(__name__)

LiveEventSink = Callable[[str, dict[str, Any]], Awaitable[None]]

# Attached to persisted LLM trace rows (request_context.compact_diff_validation) for UX/debug.
_ORIGIN_COMPACT_VALIDATE_PRIMARY = (
    "orchestration.generate_tailored_resume — after run_primary_tailoring / complete text "
    "(operation resume_generate_full); validate_compact_diff at orchestration.py ~175–187"
)

def _trace_attach_compact_validation(
    *,
    operation: str,
    phase_display: str,
    validation_result: DiffValidationResult,
    origin_note: str,
) -> None:
    if not settings.llm_trace_enabled:
        return
    trace_id = get_llm_trace_id()
    if not trace_id:
        return

    envelope: dict[str, Any] = {
        "phase": phase_display,
        "valid": validation_result.valid,
        "errors": list(validation_result.errors),
        "warnings": list(validation_result.warnings),
        "error_count": len(validation_result.errors),
        "warning_count": len(validation_result.warnings),
        "origin": origin_note,
    }
    try:
        from app.database import db

        ok = db.attach_compact_diff_validation_to_latest_llm_call(
            trace_id=trace_id,
            operation=operation,
            envelope_validation=envelope,
        )
        if not ok:
            logger.debug(
                "No LLM trace row found to attach compact_diff_validation (%s %s)",
                trace_id,
                operation,
            )
    except Exception:
        logger.debug(
            "Failed to persist compact_diff_validation on LLM trace (non-fatal)",
            exc_info=True,
        )


def _log_compact_validation(phase: str, validation_result: DiffValidationResult) -> None:
    """Keep operator logs terse; emit full validator output at DEBUG."""

    if validation_result.valid:
        return
    logger.debug(
        "%s compact diff validation issues (non-fatal): %s",
        phase,
        validation_result.errors,
    )
    logger.warning(
        "%s tailoring output deviates from strict compact envelope (%d issue(s)); "
        "bullet/project/skills quotas are often the trigger — enable DEBUG on %s for the full list",
        phase,
        len(validation_result.errors),
        __name__,
    )


def _check_for_truncation(data: dict[str, Any]) -> None:
    """Log warnings for obvious truncation signs before schema validation."""

    if "workExperience" in data and data["workExperience"] == []:
        logger.warning(
            "Resume has empty workExperience - possible truncation or unusual resume"
        )


def _looks_like_legacy_full_body_response(result: dict[str, Any]) -> bool:
    work_experience = result.get("workExperience")
    personal_projects = result.get("personalProjects")
    return bool(
        isinstance(work_experience, list)
        or isinstance(personal_projects, list)
        or "customSections" in result
        or "personalInfo" in result
        or "education" in result
        or "changes" in result
    )


async def generate_tailored_resume(
    *,
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
    cleanup_source_data: dict[str, Any] | None = None,
    custom_prompt_instructions: str | None = None,
    event_sink: LiveEventSink | None = None,
    live_metadata: dict[str, Any] | None = None,
    timing_recorder: Any | None = None,
) -> TailoringResult:
    """Run the primary tailoring prompt and return the full locally restored resume."""

    def track(host_event: str, sub_event: str):
        if timing_recorder is None:
            return nullcontext()
        return timing_recorder.track(host_event, sub_event)

    resolved_prompt_id = (
        prompt_id if prompt_id in TAILORING_MODE_STRATEGY else DEFAULT_IMPROVE_PROMPT_ID
    )
    with track("tailoring_internal", "resume_payload_projection"):
        prompt_resume_data = TailoringResumePayload.from_resume_data(original_resume_data)
    jd_blob = job_keywords if isinstance(job_keywords, dict) else {}

    with track("tailoring_internal", "response_contract_build"):
        response_contract = build_response_contract(
            prompt_resume_data,
            prompt_id=resolved_prompt_id,
        )
    with track("tailoring_internal", "prompt_context_assembly"):
        prompt_context = build_prompt_context(
            prompt_id=resolved_prompt_id,
            jd_intel_blob=jd_blob,
            response_contract=response_contract,
            resume_payload=prompt_resume_data,
            original_resume_markdown=original_resume,
            original_resume_data=original_resume_data,
            custom_prompt_instructions=custom_prompt_instructions,
        )
    with track("tailoring_internal", "adaptive_token_budget"):
        adaptive_max_tokens = compute_adaptive_max_tokens(response_contract, resolved_prompt_id)
    with track("tailoring_internal", "primary_resume_llm_call"):
        primary_result = await run_primary_tailoring(
            prompt_context,
            response_contract=response_contract,
            job_description=job_description,
            max_tokens=adaptive_max_tokens,
            event_sink=event_sink,
            live_metadata=live_metadata,
        )
    result = primary_result.compact_diff

    # Validate compact diff before applying (log only, don't hard-fail for P1)
    with track("tailoring_internal", "compact_diff_validation"):
        llm_response_v2_pre = TailoringLLMResponseV2.model_validate(result)
        validation_result = validate_compact_diff(
            llm_response_v2_pre.model_dump(exclude_none=False),
            response_contract,
        )
    _log_compact_validation("Primary tailor", validation_result)
    _trace_attach_compact_validation(
        operation="resume_generate_full",
        phase_display="primary_tailor",
        validation_result=validation_result,
        origin_note=_ORIGIN_COMPACT_VALIDATE_PRIMARY,
    )

    critique_analysis: dict[str, object] | None = None
    if resolved_prompt_id == "full" and get_enable_critique():
        logger.info(
            "Skipping critique/rewrite for section-header primary tailoring v1; "
            "rewrite prompts still expect compact JSON."
        )

    _check_for_truncation(result)

    # Try compact v2 format first; fall back to legacy full-body format
    with track("tailoring_internal", "compact_diff_normalization"):
        llm_response_v2 = TailoringLLMResponseV2.model_validate(result)
        legacy_full_body_response = _looks_like_legacy_full_body_response(result)
        has_compact_content = bool(
            llm_response_v2.experience
            or llm_response_v2.projects
            or llm_response_v2.skills is not None
            or llm_response_v2.bold_keywords
            or (llm_response_v2.summary and not legacy_full_body_response)
        )
        if has_compact_content:
            filtered_bold_keywords = filter_basic_resume_terms(llm_response_v2.bold_keywords)
            if filtered_bold_keywords != llm_response_v2.bold_keywords:
                llm_response_v2 = llm_response_v2.model_copy(
                    update={"bold_keywords": filtered_bold_keywords}
                )

    declared_changes: list = []
    with track("tailoring_internal", "apply_compact_diff"):
        if has_compact_content and not legacy_full_body_response and original_resume_data is not None:
            raw_llm_resume_data = apply_compact_diff(
                original_resume_data,
                llm_response_v2.model_dump(exclude_none=False),
            )
        else:
            if not has_compact_content:
                logger.warning("LLM returned no compact content — falling back to legacy full-body parse")
            try:
                llm_response = TailoringLLMResponse.model_validate(result)
                tailored_payload = TailoringResumePayload.model_validate(
                    llm_response.model_dump(exclude={"changes"})
                )
                declared_changes = llm_response.changes
            except ValidationError:
                logger.warning(
                    "Legacy full-body parse failed strict schema validation; "
                    "falling back to tolerant payload extraction."
                )
                tailored_payload = TailoringResumePayload.from_resume_data(result)
                if tailored_payload is None:
                    tailored_payload = TailoringResumePayload()
            raw_llm_resume_data = rehydrate_tailoring_resume(
                tailored_payload,
                original_resume_data=original_resume_data,
            )

    # Build a TailoringResumePayload from the reconstructed dict for finalize
    with track("tailoring_internal", "tailored_payload_rehydrate"):
        tailored_payload = TailoringResumePayload.from_resume_data(raw_llm_resume_data)
        if tailored_payload is None:
            tailored_payload = TailoringResumePayload()

    with track("tailoring_internal", "resume_finalization_cleanup"):
        resume_data, warnings, location_source, location_value = finalize_tailored_resume(
            payload=tailored_payload,
            original_resume_data=original_resume_data,
            original_resume_markdown=original_resume,
            cleanup_source_data=cleanup_source_data,
            job_content=job_description,
            job_keywords=job_keywords,
            prompt_id=prompt_context.prompt_id,
        )
    warnings.extend(primary_result.parse_warnings)
    if primary_result.parse_errors:
        warnings.extend(primary_result.parse_errors)
    with track("tailoring_internal", "change_manifest_build"):
        computed_llm_changes = build_change_manifest(original_resume_data, raw_llm_resume_data)
        applied_changes = build_change_manifest(original_resume_data, resume_data)
    if has_compact_content and not legacy_full_body_response:
        applied_changes = enrich_change_manifest_with_tailored_cells(
            applied_changes,
            llm_response_v2,
        )
        applied_changes = supplement_change_manifest_with_unchanged_cell_rationales(
            applied_changes,
            llm_response_v2,
            original_resume_data,
            resume_data,
        )
    _, cleanup_changes = calculate_resume_diff(raw_llm_resume_data, resume_data)
    _accepted_declared_changes, rejected_declared_changes = validate_declared_changes(
        original_resume_data,
        declared_changes,
    )
    stage_breakdown = build_stage_breakdown(
        declared_changes=declared_changes,
        computed_llm_changes=computed_llm_changes,
        applied_changes=applied_changes,
        rejected_declared_changes=rejected_declared_changes,
        cleanup_only_changes=cleanup_changes,
        location_source=location_source,
        location_value=location_value,
    )
    bold_keywords = llm_response_v2.bold_keywords if has_compact_content else []

    skills_observability: dict[str, Any] | None = None
    if (
        has_compact_content
        and not legacy_full_body_response
        and original_resume_data is not None
        and response_contract.skill_group_ids
    ):
        skills_observability = build_skills_observability_v1(
            original_resume_data,
            resume_data,
            llm_response_v2.skills,
            ordered_group_ids=response_contract.skill_group_ids,
        )

    return TailoringResult(
        resume_data=resume_data,
        warnings=warnings,
        response_contract=response_contract,
        used_structured_resume_input=prompt_context.used_structured_resume_input,
        raw_llm_resume_data=raw_llm_resume_data,
        change_manifest=applied_changes,
        declared_changes=declared_changes,
        rejected_declared_changes=rejected_declared_changes,
        cleanup_changes=cleanup_changes,
        stage_breakdown=stage_breakdown,
        bold_keywords=bold_keywords,
        critique_analysis=critique_analysis,
        skills_observability=skills_observability,
    )


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compatibility wrapper returning only the full resume payload."""

    result = await generate_tailored_resume(
        original_resume=original_resume,
        job_description=job_description,
        job_keywords=job_keywords,
        prompt_id=prompt_id,
        original_resume_data=original_resume_data,
        cleanup_source_data=original_resume_data,
        custom_prompt_instructions=None,
    )
    return result.resume_data
