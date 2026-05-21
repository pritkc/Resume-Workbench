"""LLM call helpers for the tailoring pipeline."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from app.config import get_step_llm_config
from app.llm import complete as complete_json, complete_stream
from app.prompts import PROMPT_VERSIONS
from app.services.tailoring.prompting import TailoringPromptContext
from app.services.tailoring.models import TailoringResponseContract
from app.services.tailoring.section_format import (
    extract_streamed_resume_sections,
    parse_resume_section_output,
    to_compact_diff,
)

LiveEventSink = Callable[[str, dict[str, Any]], Awaitable[None]]


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
    event_sink: LiveEventSink | None = None,
    live_metadata: dict[str, Any] | None = None,
) -> PrimaryTailoringResult:
    emitted_sections: dict[str, str] = {}

    async def emit_section_updates(_delta: str, accumulated: str) -> None:
        if event_sink is None:
            return
        for section in extract_streamed_resume_sections(accumulated):
            section_id = str(section.get("section_id") or "")
            content = str(section.get("content") or "")
            if not section_id or emitted_sections.get(section_id) == content:
                continue
            emitted_sections[section_id] = content
            await event_sink(
                "section.updated",
                {
                    **(live_metadata or {}),
                    **section,
                    "content_chars": len(content),
                },
            )

    completion = complete_stream if event_sink is not None else complete_json
    completion_kwargs: dict[str, Any] = {}
    if event_sink is not None:
        completion_kwargs["event_sink"] = event_sink
        completion_kwargs["on_delta"] = emit_section_updates
        completion_kwargs["include_delta_text"] = True
        completion_kwargs["stream_kind"] = "resume_output"

    raw_text = await completion(
        prompt=prompt_context.user_prompt,
        system_prompt=prompt_context.system_prompt,
        config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
        max_tokens=max_tokens,
        timeout_seconds=170,
        retries=1,
        operation="resume_generate_full",
        metadata={
            **(live_metadata or {}),
            "prompt_id": prompt_context.prompt_id,
            "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
            "prompt_hash": prompt_context.prompt_hash,
            "job_description_chars": len(job_description),
            "structured_resume_input": prompt_context.used_structured_resume_input,
            "adaptive_max_tokens": max_tokens,
        },
        retry_hint=prompt_context.retry_hint,
        **completion_kwargs,
    )
    if isinstance(raw_text, dict):
        return PrimaryTailoringResult(compact_diff=raw_text, raw_text="")
    parsed = parse_resume_section_output(raw_text, response_contract)
    if parsed.summary is None and not parsed.bold_keywords:
        retry_completion = complete_stream if event_sink is not None else complete_json
        retry_kwargs: dict[str, Any] = {}
        if event_sink is not None:
            retry_kwargs["event_sink"] = event_sink
            retry_kwargs["on_delta"] = emit_section_updates
            retry_kwargs["include_delta_text"] = True
            retry_kwargs["stream_kind"] = "resume_output"
        raw_text = await retry_completion(
            prompt=prompt_context.user_prompt,
            system_prompt=prompt_context.system_prompt,
            config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
            max_tokens=max(int(max_tokens * 1.2), max_tokens + 1),
            timeout_seconds=170,
            retries=0,
            operation="resume_generate_full",
            metadata={
                **(live_metadata or {}),
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
            **retry_kwargs,
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
