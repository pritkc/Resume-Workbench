"""Prompt assembly helpers for the tailoring pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.prompts import (
    DEFAULT_IMPROVE_PROMPT_ID,
    IMPROVE_RESUME_PROMPT,
    IMPROVE_STRATEGY_GUIDANCE,
    TAILORING_MODE_CONSTRAINTS,
    TAILORING_SYSTEM_PROMPT,
    get_language_name,
)

from app.services.tailoring.analysis import job_analysis_to_prompt_json
from app.services.tailoring.models import (
    TailoringJobAnalysis,
    TailoringResponseContract,
    TailoringResumePayload,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TailoringPromptContext:
    prompt_id: str
    output_language: str
    mode_constraint: str
    strategy_primary_goal: str
    response_contract_json: str
    job_analysis_json: str
    job_description_excerpt: str
    original_resume_json: str
    retry_hint: str
    system_prompt: str
    used_structured_resume_input: bool


def _resolve_strategy(prompt_id: str | None) -> tuple[str, dict[str, str], str]:
    selected_prompt_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    strategy_guidance = IMPROVE_STRATEGY_GUIDANCE.get(
        selected_prompt_id,
        IMPROVE_STRATEGY_GUIDANCE[DEFAULT_IMPROVE_PROMPT_ID],
    )
    mode_constraint = TAILORING_MODE_CONSTRAINTS.get(
        selected_prompt_id,
        TAILORING_MODE_CONSTRAINTS[DEFAULT_IMPROVE_PROMPT_ID],
    )
    if selected_prompt_id not in IMPROVE_STRATEGY_GUIDANCE:
        logger.warning(
            "Unknown prompt_id '%s'; using default tailoring guidance.",
            selected_prompt_id,
        )
    return selected_prompt_id, strategy_guidance, mode_constraint


def build_tailoring_retry_hint(response_contract: TailoringResponseContract) -> str:
    top_level_keys = response_contract.top_level_keys
    return (
        "Output one COMPLETE JSON object with these top-level keys only: "
        f"{json.dumps(top_level_keys, ensure_ascii=True)}. "
        "Do not include personalInfo, sectionMeta, or education. "
        "Do not omit arrays or objects, even when they are empty. "
        "Start with { and end with }."
    )


def build_prompt_context(
    *,
    prompt_id: str | None,
    language: str,
    job_analysis: TailoringJobAnalysis,
    job_description_excerpt: str,
    response_contract: TailoringResponseContract,
    resume_payload: TailoringResumePayload | None,
    original_resume_markdown: str,
) -> TailoringPromptContext:
    selected_prompt_id, strategy_guidance, mode_constraint = _resolve_strategy(prompt_id)
    output_language = get_language_name(language)
    resume_input = (
        json.dumps(resume_payload.model_dump(), separators=(',', ':'), ensure_ascii=True)
        if resume_payload is not None
        else original_resume_markdown
    )
    response_contract_json = json.dumps(
        response_contract.model_dump(exclude_none=True),
        separators=(',', ':'),
        ensure_ascii=True,
    )

    return TailoringPromptContext(
        prompt_id=selected_prompt_id,
        output_language=output_language,
        mode_constraint=mode_constraint,
        strategy_primary_goal=strategy_guidance["primary_goal"],
        response_contract_json=response_contract_json,
        job_analysis_json=job_analysis_to_prompt_json(job_analysis),
        job_description_excerpt=job_description_excerpt,
        original_resume_json=resume_input,
        retry_hint=build_tailoring_retry_hint(response_contract),
        system_prompt=TAILORING_SYSTEM_PROMPT,
        used_structured_resume_input=resume_payload is not None,
    )


def render_tailoring_prompt(context: TailoringPromptContext) -> str:
    return IMPROVE_RESUME_PROMPT.format(
        job_description=context.job_description_excerpt,
        job_analysis=context.job_analysis_json,
        original_resume=context.original_resume_json,
        response_contract=context.response_contract_json,
        output_language=context.output_language,
        mode_id=context.prompt_id,
        mode_constraint=context.mode_constraint,
    )

