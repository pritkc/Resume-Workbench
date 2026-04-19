"""Parse and serialize the app-only `metadata` YAML section (non-RenderCV)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

import yaml

from app.rendering.rendercv_adapter import RenderCVYamlValidationError
from app.rendering.theme_profiles import RenderThemeSettings

logger = logging.getLogger(__name__)

METADATA_SECTION_MAX_CHARS = 65536

DEFAULT_METADATA_YAML = """metadata:
  role: ""
  company: ""
  location: ""
  bold_keywords: []
"""


@dataclass(frozen=True)
class CvMetadataFields:
    role: str
    company: str
    location: str
    bold_keywords: list[str]


def _clean_str(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        return ""
    return " ".join(value.split()).strip()


def _clean_keyword_list(value: Any) -> list[str]:
    if value is None:
        return []
    if not isinstance(value, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        word = " ".join(item.split()).strip()
        if len(word) < 2:
            continue
        key = word.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(word)
    out.sort(key=len, reverse=True)
    return out


def parse_cv_metadata_yaml(
    raw: str,
    *,
    section: str = "metadata",
) -> CvMetadataFields:
    """Parse the metadata YAML section. Root key must be `metadata:` with four allowed inner keys."""
    text = raw.strip() if isinstance(raw, str) else ""
    if not text:
        return CvMetadataFields(role="", company="", location="", bold_keywords=[])

    if len(text) > METADATA_SECTION_MAX_CHARS:
        raise RenderCVYamlValidationError(
            f"{section.upper()} YAML exceeds maximum length ({METADATA_SECTION_MAX_CHARS} characters).",
            section=section,
        )

    try:
        parsed = yaml.safe_load(text)
    except yaml.YAMLError as exc:
        mark = getattr(exc, "problem_mark", None)
        line = getattr(mark, "line", None)
        column = getattr(mark, "column", None)
        message = getattr(exc, "problem", None) or getattr(exc, "context", None) or str(exc)
        raise RenderCVYamlValidationError(
            f"{section.upper()} YAML is invalid: {message}",
            section=section,
            line=(line + 1) if isinstance(line, int) else None,
            column=(column + 1) if isinstance(column, int) else None,
        ) from exc

    if parsed is None:
        return CvMetadataFields(role="", company="", location="", bold_keywords=[])

    if not isinstance(parsed, dict):
        raise RenderCVYamlValidationError(
            f"{section.upper()} YAML must decode to an object.",
            section=section,
        )

    inner = parsed.get("metadata")
    if inner is None or not isinstance(inner, dict):
        raise RenderCVYamlValidationError(
            f"{section.upper()} YAML must have a top-level `metadata:` mapping.",
            section=section,
        )

    allowed = {"role", "company", "location", "bold_keywords"}
    unknown = [k for k in inner if k not in allowed]
    if unknown:
        logger.info("Ignoring unknown metadata keys: %s", unknown)

    role = _clean_str(inner.get("role"))
    company = _clean_str(inner.get("company"))
    location = _clean_str(inner.get("location"))
    bold_keywords = _clean_keyword_list(inner.get("bold_keywords"))

    return CvMetadataFields(
        role=role,
        company=company,
        location=location,
        bold_keywords=bold_keywords,
    )


def serialize_cv_metadata_yaml(fields: CvMetadataFields) -> str:
    """Canonical YAML for `yaml_sections.metadata` (root `metadata:`)."""
    payload = {
        "metadata": {
            "role": fields.role,
            "company": fields.company,
            "location": fields.location,
            "bold_keywords": fields.bold_keywords,
        }
    }
    return yaml.safe_dump(
        payload,
        sort_keys=False,
        allow_unicode=True,
    )


def cv_metadata_fields_from_theme(theme: RenderThemeSettings) -> CvMetadataFields:
    """Build metadata fields from current theme (empty targets; keywords from runtime settings)."""
    from app.rendering.rendercv_adapter import _resolve_bold_keywords

    return CvMetadataFields(
        role="",
        company="",
        location="",
        bold_keywords=_resolve_bold_keywords(theme),
    )


def apply_cv_metadata_to_theme(
    theme: RenderThemeSettings,
    bold_keywords: list[str],
) -> RenderThemeSettings:
    """Set runtime bold keyword list; `bold_keywords` bool is true iff list non-empty."""
    settings = dict(theme.settings) if theme.settings else {}
    settings["bold_keywords"] = bold_keywords
    from dataclasses import replace

    return replace(
        theme,
        bold_keywords=len(bold_keywords) > 0,
        settings=settings,
    )


def target_strings_from_metadata(resume: dict[str, Any]) -> CvMetadataFields | None:
    """Load targets from persisted `cv_metadata` column; returns None if missing/empty."""
    raw = resume.get("cv_metadata")
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        return parse_cv_metadata_yaml(raw)
    except RenderCVYamlValidationError:
        return None
