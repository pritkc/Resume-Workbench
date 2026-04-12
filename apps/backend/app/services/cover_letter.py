"""Cover letter, outreach message, and job target metadata helpers."""

import json
import re
from typing import Any

from app.llm import complete
from app.prompts import (
    COVER_LETTER_SYSTEM_PROMPT,
    OUTREACH_SYSTEM_PROMPT,
    PROMPT_VERSIONS,
    get_language_name,
)
from app.prompts.templates import (
    COVER_LETTER_PROMPT,
    OUTREACH_MESSAGE_PROMPT,
)
from app.services.message_profiles import CandidatePromptProfile
from app.services.prompt_utils import sanitize_user_input, trim_job_description_for_prompt

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
_TITLE_TRAILING_QUALIFIER_RE = re.compile(
    r"""
    \s*
    (?:
        (?:\(|\[)\s*
        (?:
            remote(?:\s*\([^)]+\))?
            |hybrid(?:\s+in\s+[^)\]]+)?
            |on-?site(?:\s+in\s+[^)\]]+)?
            |full[-\s]?time
            |part[-\s]?time
            |contract(?:or)?
            |temporary
            |temp-to-hire
            |intern(?:ship)?
            |freelance
        )
        \s*(?:\)|\])
        |
        (?:[-|/:,]\s*|\s+in\s+)
        (?:
            remote(?:\s*\([^)]+\))?
            |hybrid(?:\s+in\s+[^\n|•]+)?
            |on-?site(?:\s+in\s+[^\n|•]+)?
            |full[-\s]?time
            |part[-\s]?time
            |contract(?:or)?
            |temporary
            |temp-to-hire
            |intern(?:ship)?
            |freelance
        )
    )
    \s*$
    """,
    re.IGNORECASE | re.VERBOSE,
)

MAX_MESSAGE_JOB_DESCRIPTION_CHARS = 2200

_COVER_LETTER_RETRY_HINT = (
    "Return one complete cover letter in plain text only. Stay between 95 and 165 words, "
    "use 3 tight paragraphs (4 only if needed), human direct tone, end with a complete closing sentence. "
    "No placeholders, markdown, draft notes, signature blocks, or em dashes."
)
_OUTREACH_RETRY_HINT = (
    "Return one complete outreach message in plain text only. Stay between 50 and 95 words, "
    "3-4 short sentences, specific opening, one low-friction ask at the end. "
    "No placeholders, template openers, or signature block. Do not stop mid-sentence."
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


def _strip_known_suffix(value: str, suffix: str | None) -> str | None:
    cleaned_value = _clean_metadata_value(value)
    cleaned_suffix = _clean_metadata_value(suffix)
    if not cleaned_value or not cleaned_suffix:
        return cleaned_value

    updated = cleaned_value
    suffix_patterns = (
        rf"\s*(?:\(|\[)\s*{re.escape(cleaned_suffix)}\s*(?:\)|\])\s*$",
        rf"\s*(?:@|\bat\b|[-|/:,])\s*{re.escape(cleaned_suffix)}\s*$",
        rf"\s+in\s+{re.escape(cleaned_suffix)}\s*$",
    )
    for pattern in suffix_patterns:
        updated = re.sub(pattern, "", updated, flags=re.IGNORECASE)
    return _clean_metadata_value(updated)


def _normalize_role_title(
    value: str | None,
    *,
    company: str | None = None,
    location: str | None = None,
) -> str | None:
    normalized = _clean_metadata_value(value)
    previous = None

    while normalized and normalized != previous:
        previous = normalized
        normalized = _strip_known_suffix(normalized, company)
        normalized = _strip_known_suffix(normalized, location)
        normalized = _clean_metadata_value(_TITLE_TRAILING_QUALIFIER_RE.sub("", normalized))

    return normalized


def _get_keyword_metadata_value(job_keywords: dict[str, Any] | None, *keys: str) -> str | None:
    if not isinstance(job_keywords, dict):
        return None

    for key in keys:
        value = job_keywords.get(key)
        if isinstance(value, str):
            cleaned = _clean_metadata_value(value)
            if cleaned:
                return cleaned
    return None


def extract_job_target_metadata(
    job_description: str,
    *,
    title: str | None = None,
    job_keywords: dict[str, Any] | None = None,
) -> dict[str, str | None]:
    """Infer structured target-job metadata without a schema migration."""

    role_title = _get_keyword_metadata_value(job_keywords, "core_title", "role", "title")
    title_role, title_company = _extract_role_company_from_title(role_title)
    company = _get_keyword_metadata_value(job_keywords, "company_name", "company")
    company = company or title_company
    location = _get_keyword_metadata_value(job_keywords, "location")
    role = _normalize_role_title(title_role or role_title, company=company, location=location)

    if title:
        fallback_role, fallback_company = _extract_role_company_from_title(title)
        role = role or fallback_role
        company = company or fallback_company

    if not role or not company:
        fallback_title = _extract_title_from_job_description(job_description)
        extracted_role, extracted_company = _extract_role_company_from_title(fallback_title)
        role = role or extracted_role
        company = company or extracted_company

    return {
        "role": _clean_metadata_value(role),
        "company": _clean_metadata_value(company),
        "location": location or _extract_location_from_job_description(job_description),
    }


def build_job_target_title(
    job_description: str,
    *,
    title: str | None = None,
    job_keywords: dict[str, Any] | None = None,
) -> str | None:
    metadata = extract_job_target_metadata(
        job_description,
        title=title,
        job_keywords=job_keywords,
    )
    role = metadata.get("role")
    company = metadata.get("company")
    if role and company:
        return f"{role} @ {company}"[:80]
    if role:
        return role[:80]
    return None


def _build_message_prompt_inputs(
    resume_data: dict[str, Any],
    job_description: str,
) -> dict[str, str]:
    """Build compact prompt inputs for cover-letter and outreach generation."""

    profile = CandidatePromptProfile.from_resume_data(resume_data)
    job_target = extract_job_target_metadata(job_description)
    sanitized_jd = trim_job_description_for_prompt(
        sanitize_user_input(job_description),
        max_chars=MAX_MESSAGE_JOB_DESCRIPTION_CHARS,
    )
    return {
        "job_target": json.dumps(
            {key: value for key, value in job_target.items() if value},
            separators=(',', ':'),
            ensure_ascii=True,
        ),
        "job_description": sanitized_jd,
        "resume_profile": profile.to_prompt_json(),
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
    prompt_inputs = _build_message_prompt_inputs(resume_data, job_description)

    prompt = COVER_LETTER_PROMPT.format(
        job_target=prompt_inputs["job_target"],
        job_description=prompt_inputs["job_description"],
        resume_profile=prompt_inputs["resume_profile"],
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt=COVER_LETTER_SYSTEM_PROMPT,
        max_tokens=2048,
        retries=3,
        retry_hint=_COVER_LETTER_RETRY_HINT,
        retry_max_tokens=4096,
        operation="cover_letter_generate",
        metadata={
            "job_description_chars": len(job_description),
            "prompt_job_description_chars": len(prompt_inputs["job_description"]),
            "candidate_profile_chars": len(prompt_inputs["resume_profile"]),
            "prompt_version": PROMPT_VERSIONS.get("cover_letter", "unknown"),
        },
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
    prompt_inputs = _build_message_prompt_inputs(resume_data, job_description)

    prompt = OUTREACH_MESSAGE_PROMPT.format(
        job_target=prompt_inputs["job_target"],
        job_description=prompt_inputs["job_description"],
        resume_profile=prompt_inputs["resume_profile"],
        output_language=output_language,
    )

    result = await complete(
        prompt=prompt,
        system_prompt=OUTREACH_SYSTEM_PROMPT,
        max_tokens=1536,
        retries=3,
        retry_hint=_OUTREACH_RETRY_HINT,
        retry_max_tokens=3072,
        operation="outreach_generate",
        metadata={
            "job_description_chars": len(job_description),
            "prompt_job_description_chars": len(prompt_inputs["job_description"]),
            "candidate_profile_chars": len(prompt_inputs["resume_profile"]),
            "prompt_version": PROMPT_VERSIONS.get("outreach", "unknown"),
        },
    )

    return result.strip()
