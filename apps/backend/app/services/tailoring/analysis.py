"""Job-analysis helpers shared by the tailoring pipeline."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.llm import complete_json
from app.prompts import EXTRACT_KEYWORDS_PROMPT, EXTRACT_KEYWORDS_SYSTEM_PROMPT, PROMPT_VERSIONS
from app.prompts.templates import EXTRACT_JD_INTELLIGENCE_PROMPT, EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT
from app.services.cover_letter import extract_job_target_metadata
from app.services.prompt_utils import sanitize_user_input, trim_job_description_for_prompt

from app.services.tailoring.models import JDIntelligence, TailoringJobAnalysis

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
    """Return a stable list of JD keywords worth covering if supported."""

    combined: list[str] = []
    for key in ("required_skills", "preferred_skills", "keywords"):
        combined.extend(normalize_prompt_list(job_keywords.get(key)))

    deduped: list[str] = []
    seen: set[str] = set()
    for keyword in combined:
        lowered = keyword.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(keyword)
    return deduped


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
    """Return JD keywords already supported by the source resume.

    Kept for backward compatibility — 2.0 pipeline does not call this.
    """

    resume_text = extract_resume_text(resume_source)
    return [
        keyword
        for keyword in collect_job_keywords(job_keywords)
        if keyword_in_text(keyword, resume_text)
    ]


def build_job_analysis(
    job_keywords: dict[str, Any],
    *,
    supported_keywords: list[str],
) -> TailoringJobAnalysis:
    """Create a compact job-analysis model for the primary prompt.

    Kept for backward compatibility — 2.0 pipeline uses build_jd_intelligence.
    """

    analysis = TailoringJobAnalysis(
        core_title=job_keywords.get("core_title"),
        company_name=job_keywords.get("company_name"),
        location=job_keywords.get("location"),
        experience_years=job_keywords.get("experience_years"),
        seniority_level=job_keywords.get("seniority_level"),
        required_skills=normalize_prompt_list(job_keywords.get("required_skills")),
        preferred_skills=normalize_prompt_list(job_keywords.get("preferred_skills")),
        keywords=normalize_prompt_list(job_keywords.get("keywords")),
        key_responsibilities=normalize_prompt_list(job_keywords.get("key_responsibilities")),
        experience_requirements=normalize_prompt_list(job_keywords.get("experience_requirements")),
        education_requirements=normalize_prompt_list(job_keywords.get("education_requirements")),
        supported_keywords_from_resume=supported_keywords,
    )
    return analysis


def job_analysis_to_prompt_json(analysis: TailoringJobAnalysis) -> str:
    """Serialize the compact job analysis as stable prompt JSON."""

    return json.dumps(analysis.to_prompt_dict(), separators=(',', ':'), ensure_ascii=True)


def build_jd_intelligence(job_keywords: dict[str, Any]) -> JDIntelligence:
    """Validate a raw job_keywords dict into a JDIntelligence model.

    The raw dict is expected to already come from extract_jd_intelligence.
    Falls back gracefully when fields are missing.
    """
    return JDIntelligence.model_validate(job_keywords)


def jd_intelligence_to_prompt_json(intelligence: JDIntelligence) -> str:
    """Serialize JDIntelligence as compact prompt JSON (empty fields stripped)."""
    return json.dumps(intelligence.to_prompt_dict(), separators=(',', ':'), ensure_ascii=True)


async def extract_jd_intelligence(job_description: str) -> dict[str, Any]:
    """Extract rich JD intelligence from a job description (2.0 pipeline).

    Returns the raw dict (suitable for caching/storage). Callers that need the
    typed model should call build_jd_intelligence() on the result.

    Also merges target metadata (role, company, location) for backward
    compatibility with cover letter, outreach, and application pack consumers.
    """

    sanitized_jd = sanitize_user_input(job_description)
    prompt = EXTRACT_JD_INTELLIGENCE_PROMPT.format(job_description=sanitized_jd)

    result = await complete_json(
        prompt=prompt,
        system_prompt=EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT,
        operation="job_extract_keywords",
        metadata={
            "job_description_chars": len(job_description),
            "prompt_version": PROMPT_VERSIONS.get("extract_keywords", "unknown"),
        },
    )
    if not isinstance(result, dict):
        result = {}

    # Merge legacy target metadata for backward-compatible consumers
    target_metadata = extract_job_target_metadata(
        job_description,
        job_keywords=result,
    )
    # Only set these if not already populated by the extraction
    if not result.get("core_title"):
        result["core_title"] = target_metadata.get("role")
    if not result.get("company_name"):
        result["company_name"] = target_metadata.get("company")
    if not result.get("location") and isinstance(result.get("location"), type(None)):
        result["location"] = target_metadata.get("location")

    return result


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Extract keywords and target metadata from a job description.

    Delegates to extract_jd_intelligence and also injects legacy flat keys
    (core_title, company_name, location, required_skills, etc.) so that all
    existing consumers continue to work without changes.
    """

    raw = await extract_jd_intelligence(job_description)

    # Build JDIntelligence to produce the legacy dict
    intelligence = build_jd_intelligence(raw)
    legacy = intelligence.to_legacy_keywords()

    # Merge: raw takes precedence; legacy only fills gaps not present in raw
    merged = {**legacy, **raw}
    return merged
