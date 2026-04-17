"""Prompt assembly helpers for the tailoring pipeline."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Callable

from app.prompts import DEFAULT_IMPROVE_PROMPT_ID, get_prompt
from app.prompts.tailoring_blocks import TAILORING_MODE_STRATEGY

from app.services.tailoring.analysis import jd_intelligence_to_prompt_json
from app.services.tailoring.models import (
    JDIntelligence,
    TailoringResponseContract,
    TailoringResumePayload,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class TailoringPromptContext:
    prompt_id: str
    output_language: str
    response_contract_json: str
    job_intelligence_json: str
    original_resume_json: str
    retry_hint: str
    system_prompt: str
    user_prompt: str
    used_structured_resume_input: bool


def assemble_tailoring_system_prompt(mode: str) -> str:
    mod = get_prompt("tailor_resume_full" if mode == "full" else "tailor_resume_lite")
    system, _ = mod.build_messages(
        original_resume="{}",
        job_intelligence="{}",
        response_contract="{}",
        output_language="English",
    )
    return system


def render_tailoring_user_prompt(
    *,
    mode_id: str,
    job_intelligence_json: str,
    original_resume_json: str,
    response_contract_json: str,
    output_language: str,
) -> str:
    mod = get_prompt("tailor_resume_full" if mode_id == "full" else "tailor_resume_lite")
    _, user = mod.build_messages(
        original_resume=original_resume_json,
        job_intelligence=job_intelligence_json,
        response_contract=response_contract_json,
        output_language=output_language,
    )
    return user


def build_tailoring_retry_hint(response_contract: TailoringResponseContract) -> str:
    return (
        'Output a JSON object with keys "summary", "experience", "projects", "skills", "bold_keywords". '
        "summary: one sentence. "
        "experience/projects: object keyed by 0-based entry index with a bullets sub-object. "
        "skills: array of {label, values} objects. "
        "bold_keywords: array of 10-20 keyword strings. "
        "Do not include personalInfo, sectionMeta, education, id, company, location, or dates. "
        "Start with { and end with }."
    )


def _resolve_mode(prompt_id: str | None) -> str:
    selected = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    if selected not in TAILORING_MODE_STRATEGY:
        logger.warning(
            "Unknown prompt_id '%s'; falling back to default '%s'.",
            selected,
            DEFAULT_IMPROVE_PROMPT_ID,
        )
        selected = DEFAULT_IMPROVE_PROMPT_ID
    return selected


def build_prompt_context(
    *,
    prompt_id: str | None,
    language: str,
    jd_intelligence: JDIntelligence,
    response_contract: TailoringResponseContract,
    resume_payload: TailoringResumePayload | None,
    original_resume_markdown: str,
) -> TailoringPromptContext:
    from app.prompts._constants import get_language_name

    selected_mode = _resolve_mode(prompt_id)
    output_language = get_language_name(language)

    resume_input = (
        json.dumps(resume_payload.model_dump(), separators=(",", ":"), ensure_ascii=True)
        if resume_payload is not None
        else original_resume_markdown
    )
    response_contract_json = json.dumps(
        response_contract.to_prompt_dict(),
        separators=(",", ":"),
        ensure_ascii=True,
    )
    job_json = jd_intelligence_to_prompt_json(jd_intelligence)

    mod = get_prompt("tailor_resume_full" if selected_mode == "full" else "tailor_resume_lite")
    system_prompt, user_prompt = mod.build_messages(
        original_resume=resume_input,
        job_intelligence=job_json,
        response_contract=response_contract_json,
        output_language=output_language,
    )

    return TailoringPromptContext(
        prompt_id=selected_mode,
        output_language=output_language,
        response_contract_json=response_contract_json,
        job_intelligence_json=job_json,
        original_resume_json=resume_input,
        retry_hint=build_tailoring_retry_hint(response_contract),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        used_structured_resume_input=resume_payload is not None,
    )


def render_tailoring_prompt(context: TailoringPromptContext) -> str:
    return context.user_prompt


@dataclass
class PipelineStep:
    name: str
    build_messages: Callable[..., tuple[str, str]] | None = None
    enabled: bool = True
    model_override: str | None = None
    max_tokens: int = 15000
    operation: str = "tailoring_step"
    metadata_keys: list[str] = field(default_factory=list)


DEFAULT_TAILORING_PIPELINE: list[PipelineStep] = [
    PipelineStep(
        name="jd_intelligence",
        build_messages=None,
        enabled=False,
        operation="job_extract_keywords",
        max_tokens=4096,
    ),
    PipelineStep(
        name="primary_tailor",
        build_messages=None,
        operation="resume_generate_full",
        max_tokens=15000,
    ),
    PipelineStep(
        name="critic",
        build_messages=None,
        enabled=False,
        operation="tailoring_critic",
        max_tokens=2048,
    ),
]
