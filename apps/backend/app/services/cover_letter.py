"""Cover letter, outreach message, and resume title generation service."""

import json
import logging
import re
from typing import Any

from app.llm import complete
from app.prompts.templates import (
    COVER_LETTER_PROMPT,
    GENERATE_TITLE_PROMPT,
    OUTREACH_MESSAGE_PROMPT,
)
from app.prompts import get_language_name

logger = logging.getLogger(__name__)

_ROLE_AT_COMPANY_RE = re.compile(
    r"\bAs an?\s+(?P<role>.+?)\s+at\s+(?P<company>[^,\n\.]+)",
    re.IGNORECASE,
)
_TITLE_ROLE_COMPANY_RE = re.compile(
    r"^(?P<role>.+?)\s*(?:@|\bat\b)\s*(?P<company>.+)$",
    re.IGNORECASE,
)
_LOCATION_PATTERNS = (
    re.compile(r"\blocation\s*[:\-]\s*(?P<location>[^\n|•]+)", re.IGNORECASE),
    re.compile(r"\b(?P<location>remote(?:\s*\([^)]+\))?)\b", re.IGNORECASE),
    re.compile(r"\b(?P<location>hybrid(?:\s+in\s+[^\n|•]+)?)\b", re.IGNORECASE),
    re.compile(r"\b(?P<location>on-?site(?:\s+in\s+[^\n|•]+)?)\b", re.IGNORECASE),
)


def _clean_metadata_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = " ".join(value.strip().split())
    cleaned = cleaned.strip(" -,:;|")
    return cleaned[:120] if cleaned else None


def _extract_role_company_from_title(title: str | None) -> tuple[str | None, str | None]:
    cleaned_title = _clean_metadata_value(title)
    if not cleaned_title:
        return None, None

    match = _TITLE_ROLE_COMPANY_RE.match(cleaned_title)
    if not match:
        return None, None

    return (
        _clean_metadata_value(match.group("role")),
        _clean_metadata_value(match.group("company")),
    )


def _extract_location_from_job_description(job_description: str) -> str | None:
    for pattern in _LOCATION_PATTERNS:
        match = pattern.search(job_description)
        if match:
            location = _clean_metadata_value(match.group("location"))
            if location:
                return location
    return None


def _normalize_title_result(value: str) -> str:
    title = value.strip().strip("\"'")
    return title[:80]


def _looks_truncated_title(value: str) -> bool:
    stripped = value.strip()
    if not stripped:
        return True
    if len(stripped) < 6:
        return True
    return False


def _extract_title_from_job_description(job_description: str) -> str | None:
    match = _ROLE_AT_COMPANY_RE.search(job_description)
    if match:
        role = " ".join(match.group("role").split())
        company = " ".join(match.group("company").split())
        if role and company:
            return f"{role} @ {company}"[:80]
        if role:
            return role[:80]
    return None


def extract_job_target_metadata(
    job_description: str,
    *,
    title: str | None = None,
) -> dict[str, str | None]:
    """Infer structured target-job metadata without a schema migration."""

    role, company = _extract_role_company_from_title(title)

    if not role or not company:
        fallback_title = _extract_title_from_job_description(job_description)
        extracted_role, extracted_company = _extract_role_company_from_title(fallback_title)
        role = role or extracted_role
        company = company or extracted_company

    return {
        "role": _clean_metadata_value(role),
        "company": _clean_metadata_value(company),
        "location": _extract_location_from_job_description(job_description),
    }


async def generate_cover_letter(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> str:
    """Generate a cover letter based on resume and job description.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated cover letter as plain text
    """
    output_language = get_language_name(language)

    prompt = COVER_LETTER_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data),
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional career coach and resume writer. Write compelling, personalized cover letters.",
        max_tokens=2048,
        operation="cover_letter_generate",
        metadata={"job_description_chars": len(job_description)},
    )

    return result.strip()


async def generate_outreach_message(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> str:
    """Generate a cold outreach message for networking.

    Args:
        resume_data: Structured resume data (ResumeData format)
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated outreach message as plain text
    """
    output_language = get_language_name(language)

    prompt = OUTREACH_MESSAGE_PROMPT.format(
        job_description=job_description,
        resume_data=json.dumps(resume_data),
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You are a professional networking coach. Write genuine, engaging cold outreach messages.",
        max_tokens=1024,
        operation="outreach_generate",
        metadata={"job_description_chars": len(job_description)},
    )

    return result.strip()


async def generate_resume_title(
    job_description: str,
    language: str = "en",
) -> str:
    """Generate a short descriptive title from a job description.

    Args:
        job_description: Target job description text
        language: Output language code (en, es, zh, ja)

    Returns:
        Generated title like "Senior Frontend Engineer @ Stripe"
    """
    output_language = get_language_name(language)

    prompt = GENERATE_TITLE_PROMPT.format(
        job_description=job_description,
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt="You extract job titles and company names from job descriptions.",
        max_tokens=256,
        temperature=0.3,
        operation="resume_title_generate",
        metadata={"job_description_chars": len(job_description)},
    )

    # Strip quotes and whitespace, truncate to 80 chars
    title = _normalize_title_result(result)
    if not _looks_truncated_title(title):
        return title

    fallback_title = _extract_title_from_job_description(job_description)
    if fallback_title:
        logger.warning(
            "Resume title generation appeared truncated; using JD-derived fallback title '%s'",
            fallback_title,
        )
        return fallback_title

    return title
