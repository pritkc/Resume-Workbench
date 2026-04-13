"""Resume code and filename helpers."""

from __future__ import annotations

import hashlib
import re
import unicodedata

_SAFE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_DEFAULT_CODE = "RESUME"
_CODE_LENGTH = 6
_NAME_PART_MAX_LEN = 24
_NON_ALNUM_RE = re.compile(r"[^A-Za-z0-9]+")


def derive_resume_code(resume_id: str | None) -> str:
    """Derive a short deterministic alphanumeric code from a resume id."""
    if not resume_id:
        return _DEFAULT_CODE

    digest = hashlib.blake2b(resume_id.encode("utf-8"), digest_size=8).digest()
    value = int.from_bytes(digest, byteorder="big", signed=False)
    base = len(_SAFE_CODE_ALPHABET)

    chars: list[str] = []
    for _ in range(_CODE_LENGTH):
        value, remainder = divmod(value, base)
        chars.append(_SAFE_CODE_ALPHABET[remainder])

    return "".join(reversed(chars))


def _normalize_name_token(token: str) -> str:
    normalized = unicodedata.normalize("NFKD", token)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    cleaned = _NON_ALNUM_RE.sub("", ascii_only)
    return cleaned.lower()[:_NAME_PART_MAX_LEN]


def _extract_name_parts(full_name: str | None) -> tuple[str, str]:
    if not full_name:
        return "", ""
    normalized = unicodedata.normalize("NFKD", full_name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    tokens = [part for part in _NON_ALNUM_RE.split(ascii_only) if part]
    if not tokens:
        return "", ""
    first = _normalize_name_token(tokens[0])
    last = _normalize_name_token(tokens[-1]) if len(tokens) > 1 else ""
    return first, last


def build_resume_pdf_filename(
    *,
    full_name: str | None,
    resume_code: str | None,
    fallback_resume_id: str,
) -> str:
    """Build a professional resume filename: first_last_code.pdf."""
    first_name, last_name = _extract_name_parts(full_name)
    code = (resume_code or derive_resume_code(fallback_resume_id)).upper()

    parts: list[str] = []
    if first_name:
        parts.append(first_name)
    if last_name:
        parts.append(last_name)
    parts.append(code)

    filename_stem = "_".join(parts) if parts else f"resume_{code}"
    return f"{filename_stem}.pdf"
