"""Helpers for backend section metadata synthesis and preservation."""

from __future__ import annotations

import copy
import re
from typing import Any

from app.schemas.models import DEFAULT_SECTION_META

_CUSTOM_ID_RE = re.compile(r"^custom_(\d+)$")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")


def _clone_base_meta(base_resume_data: dict[str, Any] | None) -> list[dict[str, Any]]:
    base_meta = copy.deepcopy(base_resume_data.get("sectionMeta") or []) if base_resume_data else []
    if base_meta:
        return base_meta
    return copy.deepcopy(DEFAULT_SECTION_META)


def _humanize_section_key(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        return "Custom Section"
    pieces = [part for part in re.split(r"[_\-\s]+", stripped) if part]
    if not pieces:
        return stripped
    return " ".join(piece.capitalize() for piece in pieces)


def _next_custom_index(base_meta: list[dict[str, Any]]) -> int:
    indices = [
        int(match.group(1))
        for meta in base_meta
        for match in [_CUSTOM_ID_RE.match(str(meta.get("id", "")).strip())]
        if match is not None
    ]
    return max(indices, default=0)


def _next_order(base_meta: list[dict[str, Any]]) -> int:
    return max((int(meta.get("order", 0)) for meta in base_meta), default=0)


def _resolve_section_type(section: dict[str, Any]) -> str:
    raw_value = section.get("sectionType", "")
    section_type = getattr(raw_value, "value", raw_value)
    section_type = str(section_type).strip()
    return section_type or "text"


def _existing_custom_meta(
    base_meta: list[dict[str, Any]],
) -> tuple[
    list[dict[str, Any]],
    dict[str, dict[str, Any]],
    dict[str, dict[str, Any]],
]:
    default_meta = [meta for meta in base_meta if meta.get("isDefault", True)]
    custom_meta = [meta for meta in base_meta if not meta.get("isDefault", True)]
    by_key = {
        str(meta.get("key", "")).strip().casefold(): meta
        for meta in custom_meta
        if str(meta.get("key", "")).strip()
    }
    by_display = {
        str(meta.get("displayName", "")).strip().casefold(): meta
        for meta in custom_meta
        if str(meta.get("displayName", "")).strip()
    }
    return default_meta, by_key, by_display


def build_section_meta_for_keyed_custom_sections(
    custom_sections: dict[str, dict[str, Any]],
    *,
    base_resume_data: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return section metadata for stored resume custom sections keyed by section key."""

    base_meta = _clone_base_meta(base_resume_data)
    default_meta, existing_by_key, existing_by_display = _existing_custom_meta(base_meta)
    next_custom_index = _next_custom_index(base_meta)
    next_order = _next_order(base_meta)

    resolved_custom_meta: list[dict[str, Any]] = []
    for section_key, section in custom_sections.items():
        if not isinstance(section, dict):
            continue

        existing = existing_by_key.get(section_key.casefold())
        display_name = (
            str(existing.get("displayName", "")).strip()
            if existing
            else _humanize_section_key(section_key)
        )
        if not display_name:
            display_name = _humanize_section_key(section_key)

        if existing is None:
            existing = existing_by_display.get(display_name.casefold())

        if existing is not None:
            meta = copy.deepcopy(existing)
            meta["key"] = section_key
            meta["displayName"] = display_name
            meta["sectionType"] = _resolve_section_type(section)
            resolved_custom_meta.append(meta)
            continue

        next_custom_index += 1
        next_order += 1
        resolved_custom_meta.append(
            {
                "id": section_key or f"custom_{next_custom_index}",
                "key": section_key,
                "displayName": display_name,
                "sectionType": _resolve_section_type(section),
                "isDefault": False,
                "isVisible": True,
                "order": next_order,
            }
        )

    return [*copy.deepcopy(default_meta), *resolved_custom_meta]


def build_section_meta_for_titled_custom_sections(
    custom_sections: dict[str, dict[str, Any]],
    *,
    base_resume_data: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return section metadata for imported custom sections keyed by display title."""

    base_meta = _clone_base_meta(base_resume_data)
    default_meta, existing_by_key, existing_by_display = _existing_custom_meta(base_meta)
    next_custom_index = _next_custom_index(base_meta)
    next_order = _next_order(base_meta)

    resolved_custom_meta: list[dict[str, Any]] = []
    for display_name, section in custom_sections.items():
        if not isinstance(section, dict):
            continue

        key_hint = _slugify_section_key(display_name)
        existing = existing_by_display.get(display_name.casefold()) or existing_by_key.get(
            key_hint.casefold()
        )
        if existing is not None:
            meta = copy.deepcopy(existing)
            meta["displayName"] = display_name
            meta["sectionType"] = _resolve_section_type(section)
            resolved_custom_meta.append(meta)
            continue

        next_custom_index += 1
        next_order += 1
        generated_key = f"custom_{next_custom_index}"
        resolved_custom_meta.append(
            {
                "id": generated_key,
                "key": generated_key,
                "displayName": display_name,
                "sectionType": _resolve_section_type(section),
                "isDefault": False,
                "isVisible": True,
                "order": next_order,
            }
        )

    return [*copy.deepcopy(default_meta), *resolved_custom_meta]


def rehydrate_section_meta(
    custom_sections: dict[str, dict[str, Any]] | None,
    *,
    base_resume_data: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    """Return section metadata for a tailored resume using local state only."""

    if not isinstance(custom_sections, dict):
        custom_sections = {}
    return build_section_meta_for_keyed_custom_sections(
        custom_sections,
        base_resume_data=base_resume_data,
    )


def _slugify_section_key(value: str) -> str:
    normalized = _NON_ALNUM_RE.sub("_", value.strip().lower()).strip("_")
    return normalized or "custom_section"
