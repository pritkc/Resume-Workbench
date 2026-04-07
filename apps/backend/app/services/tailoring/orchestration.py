"""Primary single-prompt tailoring orchestration."""

from __future__ import annotations

import logging
from typing import Any

from app.llm import complete_json
from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, IMPROVE_STRATEGY_GUIDANCE

from app.services.tailoring.analysis import (
    build_job_analysis,
    find_supported_keywords,
    sanitize_user_input,
    trim_job_description_for_prompt,
)
from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import TailoringResult, TailoringResumePayload
from app.services.tailoring.preservation import finalize_tailored_resume
from app.services.tailoring.prompting import build_prompt_context, render_tailoring_prompt

logger = logging.getLogger(__name__)


def _check_for_truncation(data: dict[str, Any]) -> None:
    """Log warnings for obvious truncation signs before schema validation."""

    if "workExperience" in data and data["workExperience"] == []:
        logger.warning(
            "Resume has empty workExperience - possible truncation or unusual resume"
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
    supported_keywords = find_supported_keywords(
        job_keywords,
        prompt_resume_data.model_dump() if prompt_resume_data is not None else original_resume,
    )
    job_analysis = build_job_analysis(
        job_keywords,
        supported_keywords=supported_keywords,
    )

    sanitized_jd = trim_job_description_for_prompt(
        sanitize_user_input(job_description)
    )
    response_contract = build_response_contract(
        prompt_resume_data,
        prompt_id=resolved_prompt_id,
    )
    prompt_context = build_prompt_context(
        prompt_id=resolved_prompt_id,
        language=language,
        job_analysis=job_analysis,
        job_description_excerpt=sanitized_jd,
        response_contract=response_contract,
        resume_payload=prompt_resume_data,
        original_resume_markdown=original_resume,
    )
    prompt = render_tailoring_prompt(prompt_context)

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON.",
        max_tokens=8192,
        retries=1,
        operation="resume_generate_full",
        metadata={
            "prompt_id": prompt_context.prompt_id,
            "job_description_chars": len(job_description),
            "supported_keywords_count": len(supported_keywords),
            "structured_resume_input": prompt_context.used_structured_resume_input,
        },
        retry_hint=prompt_context.retry_hint,
    )

    _check_for_truncation(result)
    tailored_payload = TailoringResumePayload.model_validate(result)
    resume_data, warnings = finalize_tailored_resume(
        payload=tailored_payload,
        original_resume_data=original_resume_data,
        original_resume_markdown=original_resume,
        cleanup_source_data=cleanup_source_data,
        job_content=job_description,
        job_keywords=job_keywords,
        prompt_id=prompt_context.prompt_id,
    )
    return TailoringResult(
        resume_data=resume_data,
        warnings=warnings,
        response_contract=response_contract,
        used_structured_resume_input=prompt_context.used_structured_resume_input,
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
