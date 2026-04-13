"""Primary single-prompt tailoring orchestration."""

from __future__ import annotations

import logging
from typing import Any

from pydantic import ValidationError

from app.llm import complete_json
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_STRATEGY_GUIDANCE, PROMPT_VERSIONS

from app.services.tailoring.analysis import (
    build_jd_intelligence,
)
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
from app.services.tailoring.prompting import build_prompt_context, render_tailoring_prompt

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
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
    cleanup_source_data: dict[str, Any] | None = None,
) -> TailoringResult:
    """Run the primary tailoring prompt and return the full locally restored resume."""

    resolved_prompt_id = (
        prompt_id if prompt_id in IMPROVE_STRATEGY_GUIDANCE else DEFAULT_IMPROVE_PROMPT_ID
    )
    prompt_resume_data = TailoringResumePayload.from_resume_data(original_resume_data)
    jd_intelligence = build_jd_intelligence(job_keywords)

    response_contract = build_response_contract(
        prompt_resume_data,
        prompt_id=resolved_prompt_id,
    )
    prompt_context = build_prompt_context(
        prompt_id=resolved_prompt_id,
        language=language,
        jd_intelligence=jd_intelligence,
        response_contract=response_contract,
        resume_payload=prompt_resume_data,
        original_resume_markdown=original_resume,
    )
    prompt = render_tailoring_prompt(prompt_context)

    result = await complete_json(
        prompt=prompt,
        system_prompt=prompt_context.system_prompt,
        max_tokens=15000,
        retries=1,
        operation="resume_generate_full",
        metadata={
            "prompt_id": prompt_context.prompt_id,
            "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
            "job_description_chars": len(job_description),
            "structured_resume_input": prompt_context.used_structured_resume_input,
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
    )


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Compatibility wrapper returning only the full resume payload."""

    result = await generate_tailored_resume(
        original_resume=original_resume,
        job_description=job_description,
        job_keywords=job_keywords,
        language=language,
        prompt_id=prompt_id,
        original_resume_data=original_resume_data,
        cleanup_source_data=original_resume_data,
    )
    return result.resume_data
