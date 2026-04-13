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
_ROLE_ONLY_LINE_RE = re.compile(
    r"^[A-Za-z][A-Za-z0-9/&,+\-\s]{2,79}$",
)
_URL_LIKE_RE = re.compile(r"(?:https?://|www\.)", re.IGNORECASE)
_METADATA_NOISE_RE = re.compile(
    r"\b(?:learn more|click here|apply now|job description|benefits|careers?)\b",
    re.IGNORECASE,
)
_ROLE_KEYWORD_RE = re.compile(
    r"\b(?:engineer|developer|analyst|scientist|manager|architect|specialist|consultant|administrator|lead|intern)\b",  # noqa: E501
    re.IGNORECASE,
)
_US_STATE_CODES = {
    "AL",
    "AK",
    "AZ",
    "AR",
    "CA",
    "CO",
    "CT",
    "DE",
    "FL",
    "GA",
    "HI",
    "ID",
    "IL",
    "IN",
    "IA",
    "KS",
    "KY",
    "LA",
    "ME",
    "MD",
    "MA",
    "MI",
    "MN",
    "MS",
    "MO",
    "MT",
    "NE",
    "NV",
    "NH",
    "NJ",
    "NM",
    "NY",
    "NC",
    "ND",
    "OH",
    "OK",
    "OR",
    "PA",
    "RI",
    "SC",
    "SD",
    "TN",
    "TX",
    "UT",
    "VT",
    "VA",
    "WA",
    "WV",
    "WI",
    "WY",
    "DC",
}
_US_STATE_NAME_TO_CODE = {
    "alabama": "AL",
    "alaska": "AK",
    "arizona": "AZ",
    "arkansas": "AR",
    "california": "CA",
    "colorado": "CO",
    "connecticut": "CT",
    "delaware": "DE",
    "florida": "FL",
    "georgia": "GA",
    "hawaii": "HI",
    "idaho": "ID",
    "illinois": "IL",
    "indiana": "IN",
    "iowa": "IA",
    "kansas": "KS",
    "kentucky": "KY",
    "louisiana": "LA",
    "maine": "ME",
    "maryland": "MD",
    "massachusetts": "MA",
    "michigan": "MI",
    "minnesota": "MN",
    "mississippi": "MS",
    "missouri": "MO",
    "montana": "MT",
    "nebraska": "NE",
    "nevada": "NV",
    "new hampshire": "NH",
    "new jersey": "NJ",
    "new mexico": "NM",
    "new york": "NY",
    "north carolina": "NC",
    "north dakota": "ND",
    "ohio": "OH",
    "oklahoma": "OK",
    "oregon": "OR",
    "pennsylvania": "PA",
    "rhode island": "RI",
    "south carolina": "SC",
    "south dakota": "SD",
    "tennessee": "TN",
    "texas": "TX",
    "utah": "UT",
    "vermont": "VT",
    "virginia": "VA",
    "washington": "WA",
    "west virginia": "WV",
    "wisconsin": "WI",
    "wyoming": "WY",
    "district of columbia": "DC",
}
_STATE_NAME_ALTERNATION = "|".join(
    sorted(
        (re.escape(name) for name in _US_STATE_NAME_TO_CODE),
        key=len,
        reverse=True,
    )
)
_CITY_STATE_ABBR_RE = re.compile(
    r"\b(?P<city>[A-Za-z][A-Za-z .'\-]{0,58}?),\s*(?P<state>[A-Za-z]{2})\b"
)
_CITY_STATE_NAME_RE = re.compile(
    rf"\b(?P<city>[A-Za-z][A-Za-z .'\-]{{0,58}}?),\s*(?P<state_name>{_STATE_NAME_ALTERNATION})\b",  # noqa: E501
    re.IGNORECASE,
)
_LOCATION_PATTERNS = (
    re.compile(r"\blocation\s*[:\-]\s*(?P<location>[^\n|•]+)", re.IGNORECASE),
    re.compile(
        r"\b(?:on-?site|onsite|hybrid|remote)\s+(?:at|in|from)\s+(?P<location>[^\n|•]+)",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:based|located)\s+in\s+(?P<location>[^\n|•]+)", re.IGNORECASE),
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
    "No placeholders, markdown, draft notes, signature blocks, or em dashes. "
    "Return the final answer immediately."
)
_OUTREACH_RETRY_HINT = (
    "Return one complete outreach message in plain text only. Stay between 50 and 95 words, "
    "3-4 short sentences, specific opening, one low-friction ask at the end. "
    "No placeholders, template openers, or signature block. Do not stop mid-sentence. "
    "Return the final answer immediately."
)


def _clean_metadata_value(value: str | None) -> str | None:
    if not value:
        return None
    cleaned = " ".join(value.strip().split())
    cleaned = cleaned.strip(" -,:;|")
    return cleaned[:120] if cleaned else None


def _sanitize_metadata_value(value: str | None, *, field: str) -> str | None:
    cleaned = _clean_metadata_value(value)
    if not cleaned:
        return None
    if _URL_LIKE_RE.search(cleaned):
        return None
    if _METADATA_NOISE_RE.search(cleaned):
        return None
    if field in {"role", "company"} and len(cleaned.split()) > 12:
        return None
    if field == "location":
        return sanitize_job_location(cleaned)
    max_len = 90 if field == "location" else 80
    return cleaned[:max_len].rstrip(" ,")


def _normalize_city_name(value: str | None) -> str | None:
    cleaned = _clean_metadata_value(value)
    if not cleaned:
        return None
    cleaned = re.sub(r"^location\s*[:\-]\s*", "", cleaned, flags=re.IGNORECASE)
    qualifier_match = re.search(
        r"(?:on-?site|onsite|hybrid|remote|based|located|this role|role)[^,]*\b(?:at|in|from)\s+(?P<city>.+)$",  # noqa: E501
        cleaned,
        flags=re.IGNORECASE,
    )
    if qualifier_match:
        cleaned = qualifier_match.group("city")
    cleaned = re.sub(r"^(?:at|in|from)\s+", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip(" ,")
    cleaned = " ".join(cleaned.split())
    if not cleaned or len(cleaned.split()) > 5:
        return None
    if any(char.isdigit() for char in cleaned):
        return None
    if not re.fullmatch(r"[A-Za-z .'\-]+", cleaned):
        return None
    lowered = cleaned.lower()
    if lowered in {"remote", "hybrid", "onsite", "on-site"}:
        return None
    return cleaned.title()


def sanitize_job_location(value: str | None) -> str | None:
    """Normalize location to strict City, ST format; otherwise return None."""

    cleaned = _clean_metadata_value(value)
    if not cleaned:
        return None
    if _URL_LIKE_RE.search(cleaned) or _METADATA_NOISE_RE.search(cleaned):
        return None

    match = _CITY_STATE_ABBR_RE.search(cleaned)
    if match:
        city = _normalize_city_name(match.group("city"))
        state = match.group("state").upper()
        if city and state in _US_STATE_CODES:
            return f"{city}, {state}"

    match = _CITY_STATE_NAME_RE.search(cleaned)
    if match:
        city = _normalize_city_name(match.group("city"))
        state = _US_STATE_NAME_TO_CODE.get(match.group("state_name").strip().lower())
        if city and state:
            return f"{city}, {state}"

    return None


def _extract_role_company_from_title(title: str | None) -> tuple[str | None, str | None]:
    cleaned_title = _clean_metadata_value(title)
    if not cleaned_title:
        return None, None

    match = _TITLE_ROLE_COMPANY_RE.match(cleaned_title)
    if not match:
        return None, None

    return (
        _sanitize_metadata_value(match.group("role"), field="role"),
        _sanitize_metadata_value(match.group("company"), field="company"),
    )


def _extract_location_from_job_description(job_description: str) -> str | None:
    for pattern in _LOCATION_PATTERNS:
        match = pattern.search(job_description)
        if match:
            location = sanitize_job_location(match.group("location"))
            if location:
                return location
    return sanitize_job_location(job_description)


def _extract_title_from_job_description(job_description: str) -> str | None:
    match = _ROLE_AT_COMPANY_RE.search(job_description)
    if match:
        role = " ".join(match.group("role").split())
        company = " ".join(match.group("company").split())
        if role and company:
            return f"{role} @ {company}"[:80]
        if role:
            return role[:80]

    for raw_line in job_description.splitlines():
        candidate = _clean_metadata_value(raw_line)
        if not candidate:
            continue
        # Treat only short headline-like lines as title candidates.
        if len(candidate.split()) > 12 or any(char in candidate for char in ".!?;"):
            continue
        role, company = _extract_role_company_from_title(candidate)
        if role and company:
            return f"{role} @ {company}"[:80]
        break

    return None


def _extract_role_only_from_job_description(job_description: str) -> str | None:
    for raw_line in job_description.splitlines():
        candidate = _sanitize_metadata_value(raw_line, field="role")
        if not candidate:
            continue
        if candidate.endswith(":") or "." in candidate:
            continue
        if not _ROLE_ONLY_LINE_RE.match(candidate):
            continue
        if _ROLE_KEYWORD_RE.search(candidate):
            return candidate
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

    role_title = _sanitize_metadata_value(
        _get_keyword_metadata_value(job_keywords, "core_title", "role", "title"),
        field="role",
    )
    title_role, title_company = _extract_role_company_from_title(role_title)
    company = _sanitize_metadata_value(
        _get_keyword_metadata_value(job_keywords, "company_name", "company"),
        field="company",
    )
    company = company or title_company
    location = _sanitize_metadata_value(
        _get_keyword_metadata_value(job_keywords, "location"),
        field="location",
    )
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

    if not role:
        role = _extract_role_only_from_job_description(job_description)

    return {
        "role": _sanitize_metadata_value(role, field="role"),
        "company": _sanitize_metadata_value(company, field="company"),
        "location": _sanitize_metadata_value(
            location or _extract_location_from_job_description(job_description),
            field="location",
        ),
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
