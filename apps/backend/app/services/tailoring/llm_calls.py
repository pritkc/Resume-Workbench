"""LLM call helpers for the tailoring pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.config import get_step_llm_config
from app.llm import complete as complete_json
from app.prompts import PROMPT_VERSIONS
from app.services.tailoring.prompting import TailoringPromptContext
from app.services.tailoring.models import TailoringResponseContract
from app.services.tailoring.section_format import parse_resume_section_output, to_compact_diff


@dataclass
class PrimaryTailoringResult:
    compact_diff: dict[str, Any]
    raw_text: str
    parse_warnings: list[str] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)


def tailor_step_name(prompt_id: str) -> str:
    return "tailor_resume_full" if prompt_id == "full" else "tailor_resume_lite"


async def run_primary_tailoring(
    prompt_context: TailoringPromptContext,
    response_contract: TailoringResponseContract,
    job_description: str,
    max_tokens: int = 9000,
) -> PrimaryTailoringResult:
    raw_text = await complete_json(
        prompt=prompt_context.user_prompt,
        system_prompt=prompt_context.system_prompt,
        config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
        max_tokens=max_tokens,
        timeout_seconds=170,
        retries=1,
        operation="resume_generate_full",
        metadata={
            "prompt_id": prompt_context.prompt_id,
            "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
            "prompt_hash": prompt_context.prompt_hash,
            "job_description_chars": len(job_description),
            "structured_resume_input": prompt_context.used_structured_resume_input,
            "adaptive_max_tokens": max_tokens,
        },
        retry_hint=prompt_context.retry_hint,
    )
    if isinstance(raw_text, dict):
        return PrimaryTailoringResult(compact_diff=raw_text, raw_text="")
    parsed = parse_resume_section_output(raw_text, response_contract)
    if parsed.summary is None and not parsed.bold_keywords:
        raw_text = await complete_json(
            prompt=prompt_context.user_prompt,
            system_prompt=prompt_context.system_prompt,
            config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
            max_tokens=max(int(max_tokens * 1.2), max_tokens + 1),
            timeout_seconds=170,
            retries=0,
            operation="resume_generate_full",
            metadata={
                "prompt_id": prompt_context.prompt_id,
                "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
                "prompt_hash": prompt_context.prompt_hash,
                "job_description_chars": len(job_description),
                "structured_resume_input": prompt_context.used_structured_resume_input,
                "adaptive_max_tokens": max_tokens,
                "section_header_retry_reason": "missing_summary_and_bold_keywords",
            },
            retry_hint=(
                "The previous response was missing both SUMMARY and BOLD KEYWORDS. "
                "Return the complete section-header output template as raw text."
            ),
        )
        if isinstance(raw_text, dict):
            return PrimaryTailoringResult(compact_diff=raw_text, raw_text="")
        parsed = parse_resume_section_output(raw_text, response_contract)
    compact_diff = to_compact_diff(parsed, response_contract)
    return PrimaryTailoringResult(
        compact_diff=compact_diff,
        raw_text=raw_text,
        parse_warnings=parsed.warnings,
        parse_errors=parsed.errors,
    )
