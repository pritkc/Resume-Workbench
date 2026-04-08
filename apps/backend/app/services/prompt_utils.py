"""Shared prompt-sanitization and trimming helpers."""

from __future__ import annotations

import re

_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?above",
    r"forget\s+(everything|all)",
    r"new\s+instructions?:",
    r"system\s*:",
    r"<\s*/?\s*system\s*>",
    r"\[\s*INST\s*\]",
    r"\[\s*/\s*INST\s*\]",
]

MAX_PROMPT_JD_CHARS = 4000

_SECTION_HEADER_RE = re.compile(
    r"^(?:#{1,3}\s+|[A-Z][A-Za-z &/]+:\s*$|[A-Z][A-Za-z &/]{2,}(?:\n|$))",
    re.MULTILINE,
)

_HIGH_PRIORITY_PATTERNS = re.compile(
    r"(?:require|qualificat|must.have|minimum|essential|skill|technical|experience|responsibilit|what.you)",
    re.IGNORECASE,
)

_LOW_PRIORITY_PATTERNS = re.compile(
    r"(?:about\s+(?:us|the\s+company)|equal\s+opportunity|benefits|perks|our\s+(?:mission|culture|values)|eeo|we\s+(?:offer|provide)|compensation|disclaimer)",
    re.IGNORECASE,
)


def sanitize_user_input(text: str) -> str:
    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized, flags=re.IGNORECASE)
    return sanitized


def _split_jd_sections(text: str) -> list[tuple[str, str]]:
    headers = list(_SECTION_HEADER_RE.finditer(text))
    if not headers:
        return [("", text)]
    sections: list[tuple[str, str]] = []
    if headers[0].start() > 0:
        sections.append(("", text[: headers[0].start()]))
    for i, match in enumerate(headers):
        end = headers[i + 1].start() if i + 1 < len(headers) else len(text)
        header = match.group().strip().rstrip(":")
        body = text[match.end() : end]
        sections.append((header, body))
    return sections


def _section_priority(header: str, body: str) -> int:
    combined = header + " " + body[:200]
    if _LOW_PRIORITY_PATTERNS.search(combined):
        return 2
    if _HIGH_PRIORITY_PATTERNS.search(combined):
        return 0
    return 1


def trim_job_description_for_prompt(
    job_description: str,
    *,
    max_chars: int = MAX_PROMPT_JD_CHARS,
) -> str:
    if len(job_description) <= max_chars:
        return job_description

    sections = _split_jd_sections(job_description)
    if len(sections) <= 1:
        return job_description[:max_chars]

    prioritized = sorted(
        sections,
        key=lambda s: (_section_priority(s[0], s[1]), sections.index(s)),
    )

    result_parts: list[str] = []
    used = 0
    for header, body in prioritized:
        chunk = (header + "\n" + body).strip() if header else body.strip()
        if used + len(chunk) > max_chars:
            remaining = max_chars - used
            if remaining > 100:
                result_parts.append(chunk[:remaining])
            break
        result_parts.append(chunk)
        used += len(chunk) + 1

    return "\n\n".join(result_parts)
