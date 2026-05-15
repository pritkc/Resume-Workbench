"""Job-analysis helpers shared by the tailoring pipeline."""

from __future__ import annotations

import logging
import re
from typing import Any

from app.config import get_step_llm_config
from app.llm import complete as complete_json
from app.prompts import PROMPT_VERSIONS, LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT
from app.prompts.extract_jd_intel import build_messages as build_jd_intel_messages
from app.services.prompt_utils import sanitize_user_input

from app.services.tailoring.jd_intel_blob import (
    collect_keyword_strings_from_blob,
    enrich_jd_intel_blob,
    filter_resume_keyword_sources,
)
from app.services.tailoring.section_format import (
    is_section_jd_wrapper,
    jd_keywords_from_section_blob,
    section_jd_wrapper,
)

logger = logging.getLogger(__name__)

MAX_PROMPT_LIST_ITEMS = 12


def normalize_prompt_list(value: Any, *, limit: int = MAX_PROMPT_LIST_ITEMS) -> list[str]:
    """Normalize prompt lists into a short, deduplicated string list."""

    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        lowered = text.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        normalized.append(text)
        if len(normalized) >= limit:
            break
    return normalized


def collect_job_keywords(job_keywords: dict[str, Any]) -> list[str]:
    """Return deduped strings harvested from list nodes anywhere in the JD blob."""
    if is_section_jd_wrapper(job_keywords):
        return jd_keywords_from_section_blob(job_keywords)
    return collect_keyword_strings_from_blob(job_keywords)


def keyword_in_text(keyword: str, text: str) -> bool:
    """Check for a whole-keyword match."""

    pattern = rf"\b{re.escape(keyword.casefold())}\b"
    return bool(re.search(pattern, text.casefold()))


def extract_resume_text(value: Any) -> str:
    """Flatten nested resume JSON into searchable text."""

    parts: list[str] = []

    def visit(node: Any) -> None:
        if isinstance(node, str):
            stripped = node.strip()
            if stripped:
                parts.append(stripped)
            return
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if isinstance(node, dict):
            for item in node.values():
                visit(item)

    visit(value)
    return "\n".join(parts)


def find_supported_keywords(job_keywords: dict[str, Any], resume_source: Any) -> list[str]:
    """Return JD keywords already supported by the source resume."""

    resume_text = extract_resume_text(resume_source)
    return [
        keyword
        for keyword in collect_job_keywords(job_keywords)
        if keyword_in_text(keyword, resume_text)
    ]


async def extract_jd_intelligence(job_description: str) -> dict[str, Any]:
    """Extract JD intelligence as section-header text wrapped in a JSON-compatible dict."""

    sanitized_jd = sanitize_user_input(job_description)
    system_prompt, prompt = build_jd_intel_messages(sanitized_jd)

    result = await complete_json(
        prompt=prompt,
        system_prompt=system_prompt,
        config=get_step_llm_config("extract_jd_intel"),
        max_tokens=1200,
        timeout_seconds=90,
        operation=LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT,
        metadata={
            "job_description_chars": len(job_description),
            "prompt_version": PROMPT_VERSIONS.get(
                "jd_intelligence_user",
                PROMPT_VERSIONS.get("extract_keywords", "unknown"),
            ),
        },
    )
    if isinstance(result, dict):
        enrich_jd_intel_blob(result, job_description)
        filter_resume_keyword_sources(result)
        return result
    if not isinstance(result, str):
        result = ""
    return section_jd_wrapper(result)


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Alias for :func:`extract_jd_intelligence` (cached ``job_keywords`` JSON blob)."""
    return await extract_jd_intelligence(job_description)
