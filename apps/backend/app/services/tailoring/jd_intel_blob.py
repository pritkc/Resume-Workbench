"""Dynamic JD intelligence blob: dot-path placeholders, compact JSON, keyword harvesting.

Prompts use ``$extract_jd_intel_output`` with optional ``.key.subkey`` suffixes,
resolved from the cached JD JSON (``job_keywords``).
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.cover_letter import extract_job_target_metadata, sanitize_job_location

_JD_PLACEHOLDER = re.compile(
    r"(?<!\$)\$extract_jd_intel_output(?P<path>(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)"
)


def deep_get(obj: Any, dotted_path: str, default: Any = None) -> Any:
    """Return ``obj`` at ``a.b.c`` or ``default`` if any segment is missing."""
    if not dotted_path:
        return obj
    cur: Any = obj
    for seg in dotted_path.split("."):
        if not isinstance(cur, dict) or seg not in cur:
            return default
        cur = cur[seg]
    return cur


def _strip_empty_values(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: dict[str, Any] = {}
        for k, v in obj.items():
            sv = _strip_empty_values(v)
            if sv in (None, "", [], {}):
                continue
            out[k] = sv
        return out
    if isinstance(obj, list):
        return [_strip_empty_values(i) for i in obj]
    return obj


def jd_intel_to_prompt_json(blob: dict[str, Any]) -> str:
    """Compact JSON for prompts (drop empty scalars / lists / dicts)."""
    return json.dumps(_strip_empty_values(blob), separators=(",", ":"), ensure_ascii=True)


def substitute_jd_intel_placeholders(template: str, blob: dict[str, Any]) -> str:
    """Replace ``$extract_jd_intel_output`` and ``$extract_jd_intel_output.key.sub`` with JSON fragments."""

    def _replace(m: re.Match[str]) -> str:
        path_suffix = m.group("path") or ""
        segments = path_suffix.strip(".").split(".") if path_suffix else []
        cur: Any = blob
        for seg in segments:
            if not isinstance(cur, dict) or seg not in cur:
                cur = None
                break
            cur = cur[seg]
        return json.dumps(cur, separators=(",", ":"), ensure_ascii=True)

    return _JD_PLACEHOLDER.sub(_replace, template)


def collect_keyword_strings_from_blob(obj: Any) -> list[str]:
    """Deduped strings taken from list nodes anywhere in the JSON tree."""

    seen: set[str] = set()
    out: list[str] = []

    def visit(node: Any) -> None:
        if isinstance(node, list):
            for item in node:
                if isinstance(item, str):
                    text = item.strip()
                    if not text:
                        continue
                    key = text.casefold()
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append(text)
                else:
                    visit(item)
        elif isinstance(node, dict):
            for v in node.values():
                visit(v)

    visit(obj)
    return out


def enrich_jd_intel_blob(blob: dict[str, Any], job_description: str) -> None:
    """Ensure nested role/company/location exist when the LLM omitted them (mutates ``blob``)."""
    meta = extract_job_target_metadata(job_description, job_keywords=blob)

    role = blob.get("role")
    if not isinstance(role, dict):
        role = {}
        blob["role"] = role
    if not str(role.get("title") or "").strip() and meta.get("role"):
        role["title"] = meta["role"]

    company = blob.get("company")
    if not isinstance(company, dict):
        company = {}
        blob["company"] = company
    if not str(company.get("name") or "").strip() and meta.get("company"):
        company["name"] = meta["company"]

    raw_loc = blob.get("location")
    extracted = sanitize_job_location(raw_loc) if isinstance(raw_loc, str) else None
    if extracted:
        blob["location"] = extracted
    elif meta.get("location"):
        blob["location"] = meta["location"] or ""
    elif blob.get("location") is None:
        blob["location"] = ""
