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


def sanitize_user_input(text: str) -> str:
    """Redact obvious prompt-injection attempts from freeform input."""

    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized, flags=re.IGNORECASE)
    return sanitized


def trim_job_description_for_prompt(
    job_description: str,
    *,
    max_chars: int = MAX_PROMPT_JD_CHARS,
) -> str:
    """Trim long job descriptions so prompt payloads stay focused."""

    if len(job_description) <= max_chars:
        return job_description
    return job_description[:max_chars]
