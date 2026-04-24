"""Cover letter, outreach message, and job target metadata helpers."""

import asyncio
import json
import re
from typing import Any

from app.config import get_step_llm_config
from app.llm import complete
from app.prompts import PROMPT_VERSIONS
from app.prompts.cover_letter import build_messages as cover_letter_build_messages
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
COMBINED_MESSAGE_TIMEOUT_SECONDS = 150
COMBINED_MESSAGE_MAX_TOKENS = 2600
_COMBINED_COVER_START = "<<COVER_LETTER>>"
_COMBINED_COVER_END = "<<END_COVER_LETTER>>"
_COMBINED_OUTREACH_START = "<<OUTREACH_MESSAGE>>"
_COMBINED_OUTREACH_END = "<<END_OUTREACH_MESSAGE>>"

_COMBINED_MESSAGES_RETRY_HINT = (
    "Return both messages with the exact wrapper tags: "
    "<<COVER_LETTER>>, <<END_COVER_LETTER>>, <<OUTREACH_MESSAGE>>, "
    "and <<END_OUTREACH_MESSAGE>>. Include no extra commentary."
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
        # JDIntelligence 2.0 shape: nested role/company objects (flat core_title may be missing).
        if isinstance(value, dict):
            nested_key = "title" if key == "role" else "name" if key == "company" else None
            if nested_key:
                nested = value.get(nested_key)
                if isinstance(nested, str):
                    cleaned = _clean_metadata_value(nested)
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


def _coerce_message_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _strip_fenced_wrapper(content: str) -> str:
    stripped = content.strip()
    if stripped.startswith("```") and stripped.endswith("```"):
        lines = stripped.splitlines()
        if len(lines) >= 2:
            return "\n".join(lines[1:-1]).strip()
    return stripped


def _extract_tagged_block(
    content: str,
    *,
    start_tag: str,
    end_tag: str,
    next_start_tag: str | None = None,
) -> str:
    pattern = re.compile(
        re.escape(start_tag) + r"\s*(.*?)\s*" + re.escape(end_tag),
        re.IGNORECASE | re.DOTALL,
    )
    match = pattern.search(content)
    if match:
        return match.group(1).strip()

    start_match = re.search(re.escape(start_tag), content, re.IGNORECASE)
    if not start_match:
        return ""

    tail = content[start_match.end() :]
    if next_start_tag:
        next_match = re.search(re.escape(next_start_tag), tail, re.IGNORECASE)
        if next_match:
            tail = tail[: next_match.start()]
    else:
        end_match = re.search(re.escape(end_tag), tail, re.IGNORECASE)
        if end_match:
            tail = tail[: end_match.start()]

    return tail.strip()


def _parse_combined_message_json_fallback(content: str) -> tuple[str, str]:
    stripped = content.strip()
    start_idx = stripped.find("{")
    end_idx = stripped.rfind("}")
    if start_idx == -1 or end_idx == -1 or end_idx <= start_idx:
        return "", ""

    try:
        parsed = json.loads(stripped[start_idx : end_idx + 1])
    except json.JSONDecodeError:
        return "", ""

    return (
        _coerce_message_text(parsed.get("cover_letter")),
        _coerce_message_text(parsed.get("outreach_message")),
    )


def _parse_combined_message_heading_fallback(content: str) -> tuple[str, str]:
    cover_match = re.search(
        r"(?is)\bcover\s*letter\s*[:\-]\s*(.*?)\s*(?=\boutreach(?:\s*message)?\s*[:\-]|$)",
        content,
    )
    outreach_match = re.search(
        r"(?is)\boutreach(?:\s*message)?\s*[:\-]\s*(.*)$",
        content,
    )
    return (
        cover_match.group(1).strip() if cover_match else "",
        outreach_match.group(1).strip() if outreach_match else "",
    )


def parse_combined_message_response(content: str) -> tuple[str, str]:
    """Parse the merged auxiliary response without relying on strict JSON."""

    normalized = _strip_fenced_wrapper(content)
    cover_letter = _extract_tagged_block(
        normalized,
        start_tag=_COMBINED_COVER_START,
        end_tag=_COMBINED_COVER_END,
        next_start_tag=_COMBINED_OUTREACH_START,
    )
    outreach_message = _extract_tagged_block(
        normalized,
        start_tag=_COMBINED_OUTREACH_START,
        end_tag=_COMBINED_OUTREACH_END,
    )
    if cover_letter and outreach_message:
        return cover_letter, outreach_message

    json_cover_letter, json_outreach_message = _parse_combined_message_json_fallback(
        normalized
    )
    cover_letter = cover_letter or json_cover_letter
    outreach_message = outreach_message or json_outreach_message
    if cover_letter and outreach_message:
        return cover_letter, outreach_message

    heading_cover_letter, heading_outreach_message = _parse_combined_message_heading_fallback(
        normalized
    )
    cover_letter = cover_letter or heading_cover_letter
    outreach_message = outreach_message or heading_outreach_message
    if cover_letter and outreach_message:
        return cover_letter, outreach_message

    raise ValueError("Combined message generation returned incomplete content")


def _build_message_metadata(
    *,
    job_description: str,
    prompt_inputs: dict[str, str],
    prompt_version: str,
) -> dict[str, Any]:
    return {
        "job_description_chars": len(job_description),
        "prompt_job_description_chars": len(prompt_inputs["job_description"]),
        "candidate_profile_chars": len(prompt_inputs["resume_profile"]),
        "prompt_version": prompt_version,
    }


async def generate_cover_letter_and_outreach(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> tuple[str, str]:
    """Generate cover letter and outreach message together in one LLM call."""
    del language
    prompt_inputs = _build_message_prompt_inputs(resume_data, job_description)
    system, user = cover_letter_build_messages(
        job_target=prompt_inputs["job_target"],
        job_description=prompt_inputs["job_description"],
        resume_profile=prompt_inputs["resume_profile"],
    )
    content = await asyncio.wait_for(
        complete(
            prompt=user,
            system_prompt=system,
            config=get_step_llm_config("cover_letter"),
            max_tokens=COMBINED_MESSAGE_MAX_TOKENS,
            retries=2,
            retry_hint=_COMBINED_MESSAGES_RETRY_HINT,
            retry_max_tokens=3200,
            operation="cover_letter_outreach_generate",
            metadata=_build_message_metadata(
                job_description=job_description,
                prompt_inputs=prompt_inputs,
                prompt_version=PROMPT_VERSIONS.get("cover_letter_outreach", "unknown"),
            ),
        ),
        timeout=COMBINED_MESSAGE_TIMEOUT_SECONDS,
    )
    return parse_combined_message_response(content)


async def generate_cover_letter(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> str:
    """Generate the cover-letter field via the shared auxiliary package call."""
    cover_letter, _outreach_message = await generate_cover_letter_and_outreach(
        resume_data,
        job_description,
        language,
    )
    return cover_letter


async def generate_outreach_message(
    resume_data: dict[str, Any],
    job_description: str,
    language: str = "en",
) -> str:
    """Generate the outreach field via the shared auxiliary package call."""
    _cover_letter, outreach_message = await generate_cover_letter_and_outreach(
        resume_data,
        job_description,
        language,
    )
    return outreach_message
