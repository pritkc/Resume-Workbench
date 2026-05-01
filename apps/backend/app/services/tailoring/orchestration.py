"""Primary single-prompt tailoring orchestration."""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import ValidationError

from app.config import get_enable_critique, get_step_llm_config
from app.llm import complete_json
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, PROMPT_VERSIONS
from app.prompts.tailoring_blocks import TAILORING_MODE_STRATEGY

from app.services.tailoring.change_manifest import (
    build_change_manifest,
    build_stage_breakdown,
    validate_declared_changes,
)
from app.services.tailoring.contracts import build_response_contract
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
from app.services.tailoring.validation import validate_compact_diff
from app.prompts.critique_resume import build_messages as build_critique_messages
from app.prompts.rewrite_resume import build_messages as build_rewrite_messages
from app.services.tailoring.llm_calls import run_primary_tailoring
from app.services.tailoring.prompting import build_prompt_context

logger = logging.getLogger(__name__)


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
) -> TailoringResult:
    """Run the primary tailoring prompt and return the full locally restored resume."""

    resolved_prompt_id = (
        prompt_id if prompt_id in TAILORING_MODE_STRATEGY else DEFAULT_IMPROVE_PROMPT_ID
    )
    prompt_resume_data = TailoringResumePayload.from_resume_data(original_resume_data)
    jd_blob = job_keywords if isinstance(job_keywords, dict) else {}

    response_contract = build_response_contract(
        prompt_resume_data,
        prompt_id=resolved_prompt_id,
    )
    prompt_context = build_prompt_context(
        prompt_id=resolved_prompt_id,
        jd_intel_blob=jd_blob,
        response_contract=response_contract,
        resume_payload=prompt_resume_data,
        original_resume_markdown=original_resume,
        original_resume_data=original_resume_data,
    )
    result = await run_primary_tailoring(
        prompt_context,
        job_description=job_description,
    )

    # Validate compact diff before applying (log only, don't hard-fail for P1)
    llm_response_v2_pre = TailoringLLMResponseV2.model_validate(result)
    validation_result = validate_compact_diff(
        llm_response_v2_pre.model_dump(exclude_none=True),
        response_contract,
    )
    if not validation_result.valid:
        logger.warning(
            "Compact diff validation errors (non-fatal): %s", validation_result.errors
        )

    critique_analysis: dict[str, object] | None = None
    if resolved_prompt_id == "full" and get_enable_critique():
        primary_tailor_json = json.dumps(result, separators=(",", ":"), ensure_ascii=True)

        c_sys, c_user = build_critique_messages(
            tailor_resume_full_output=primary_tailor_json,
            jd_intel_blob=prompt_context.jd_intel_blob,
            original_resume=prompt_context.original_resume_json,
        )
        critique_raw = await complete_json(
            prompt=c_user,
            system_prompt=c_sys,
            config=get_step_llm_config("critique_resume"),
            max_tokens=4096,
            retries=1,
            operation="critique_resume",
            metadata={
                "prompt_version": PROMPT_VERSIONS.get("critique_resume", "unknown"),
            },
        )
        critique_analysis = critique_raw if isinstance(critique_raw, dict) else None

        critique_s = json.dumps(critique_raw, separators=(",", ":"), ensure_ascii=True)
        r_sys, r_user = build_rewrite_messages(
            original_resume=prompt_context.original_resume_json,
            tailor_resume_full_output=primary_tailor_json,
            critique_resume_output=critique_s,
            jd_intel_blob=prompt_context.jd_intel_blob,
            response_contract=prompt_context.response_contract_json,
        )
        result = await complete_json(
            prompt=r_user,
            system_prompt=r_sys,
            config=get_step_llm_config("rewrite_resume"),
            max_tokens=15000,
            retries=1,
            operation="rewrite_resume",
            metadata={
                "prompt_version": PROMPT_VERSIONS.get("rewrite_resume", "unknown"),
                "prompt_id": prompt_context.prompt_id,
            },
            retry_hint=prompt_context.retry_hint,
        )

    _check_for_truncation(result)

    # Try compact v2 format first; fall back to legacy full-body format
    llm_response_v2 = TailoringLLMResponseV2.model_validate(result)
    legacy_full_body_response = _looks_like_legacy_full_body_response(result)
    has_compact_content = bool(
        llm_response_v2.experience
        or llm_response_v2.projects
        or llm_response_v2.skills is not None
        or llm_response_v2.bold_keywords
        or (llm_response_v2.summary and not legacy_full_body_response)
    )

    declared_changes: list = []
    if has_compact_content and not legacy_full_body_response and original_resume_data is not None:
        raw_llm_resume_data = apply_compact_diff(
            original_resume_data,
            llm_response_v2.model_dump(exclude_none=True),
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
    tailored_payload = TailoringResumePayload.from_resume_data(raw_llm_resume_data)
    if tailored_payload is None:
        tailored_payload = TailoringResumePayload()

    resume_data, warnings, location_source, location_value = finalize_tailored_resume(
        payload=tailored_payload,
        original_resume_data=original_resume_data,
        original_resume_markdown=original_resume,
        cleanup_source_data=cleanup_source_data,
        job_content=job_description,
        job_keywords=job_keywords,
        prompt_id=prompt_context.prompt_id,
    )
    computed_llm_changes = build_change_manifest(original_resume_data, raw_llm_resume_data)
    applied_changes = build_change_manifest(original_resume_data, resume_data)
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
    )
    return result.resume_data
