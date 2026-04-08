"""Helpers for flexible skills label/value groups."""

from __future__ import annotations

import copy
import re
from collections import Counter
from typing import Any

DEFAULT_SKILL_GROUP_SPECS: tuple[tuple[str, str], ...] = (
    ("technicalSkills", "Technical Skills"),
    ("languages", "Languages"),
    ("certificationsTraining", "Training & Certifications"),
    ("awards", "Awards"),
)

DEFAULT_SKILL_GROUP_LABELS_BY_ID: dict[str, str] = dict(DEFAULT_SKILL_GROUP_SPECS)
DEFAULT_SKILL_GROUP_IDS: tuple[str, ...] = tuple(
    group_id for group_id, _label in DEFAULT_SKILL_GROUP_SPECS
)

_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-*•]+|\d+[.)])\s*")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_CAMEL_BOUNDARY_RE = re.compile(r"(?<=[a-z0-9])(?=[A-Z])")


def _split_description_lines(value: str) -> list[str]:
    items: list[str] = []
    for raw_line in re.split(r"\r?\n+", value):
        line = _BULLET_PREFIX_RE.sub("", raw_line.strip())
        if line:
            items.append(line)
    return items


def coerce_string_list(value: Any) -> list[str]:
    """Coerce nested/string values into a clean list of strings."""
    if value is None:
        return []

    if isinstance(value, str):
        return _split_description_lines(value)

    if isinstance(value, list):
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                items.extend(_split_description_lines(entry))
                continue
            if isinstance(entry, (int, float)):
                text = str(entry).strip()
                if text:
                    items.append(text)
                continue
            if isinstance(entry, dict):
                candidate = (
                    entry.get("value")
                    or entry.get("label")
                    or entry.get("name")
                    or entry.get("title")
                    or entry.get("details")
                    or entry.get("summary")
                    or entry.get("bullet")
                )
                if isinstance(candidate, str):
                    items.extend(_split_description_lines(candidate))
                elif isinstance(candidate, (int, float)):
                    items.append(str(candidate))
        return items

    if isinstance(value, (int, float)):
        text = str(value).strip()
        return [text] if text else []

    return []


def default_skill_groups() -> list[dict[str, Any]]:
    """Return the starter skills groups used for new/blank resumes."""
    return [
        {"id": group_id, "label": label, "values": []}
        for group_id, label in DEFAULT_SKILL_GROUP_SPECS
    ]


def default_skills_section() -> dict[str, Any]:
    return {"groups": default_skill_groups()}


def default_additional_groups() -> list[dict[str, Any]]:
    return default_skill_groups()


def default_additional_info() -> dict[str, Any]:
    return default_skills_section()


def prettify_skill_group_label(value: str) -> str:
    if not value:
        return "Skills"
    if value in DEFAULT_SKILL_GROUP_LABELS_BY_ID:
        return DEFAULT_SKILL_GROUP_LABELS_BY_ID[value]
    spaced = _CAMEL_BOUNDARY_RE.sub(" ", value)
    spaced = spaced.replace("_", " ").replace("-", " ").strip()
    return " ".join(piece.capitalize() if piece else "" for piece in spaced.split()) or "Skills"


def prettify_additional_group_label(value: str) -> str:
    return prettify_skill_group_label(value)


def _slugify(value: str) -> str:
    slug = _NON_ALNUM_RE.sub("_", value.strip().lower()).strip("_")
    return slug or "group"


def generate_skill_group_id(existing_ids: set[str], label: str) -> str:
    base = _slugify(label)
    if base in DEFAULT_SKILL_GROUP_LABELS_BY_ID and base not in existing_ids:
        return base
    candidate = base
    counter = 2
    while candidate in existing_ids:
        candidate = f"{base}_{counter}"
        counter += 1
    return candidate


def _normalize_group_dict(
    raw_group: Any,
    *,
    index: int,
    existing_ids: set[str],
) -> dict[str, Any]:
    if isinstance(raw_group, str):
        label = f"Additional {index + 1}"
        group_id = generate_skill_group_id(existing_ids, label)
        existing_ids.add(group_id)
        return {"id": group_id, "label": label, "values": coerce_string_list(raw_group)}

    if not isinstance(raw_group, dict):
        label = f"Additional {index + 1}"
        group_id = generate_skill_group_id(existing_ids, label)
        existing_ids.add(group_id)
        return {"id": group_id, "label": label, "values": coerce_string_list(raw_group)}

    raw_id = raw_group.get("id") or raw_group.get("key")
    raw_label = raw_group.get("label") or raw_group.get("title") or raw_group.get("name")
    label = ""
    if isinstance(raw_label, str) and raw_label.strip():
        label = raw_label.strip()

    if isinstance(raw_id, str) and raw_id.strip():
        group_id = raw_id.strip()
    elif label:
        group_id = generate_skill_group_id(existing_ids, label)
    else:
        fallback_label = f"Additional {index + 1}"
        group_id = generate_skill_group_id(existing_ids, fallback_label)
        label = fallback_label

    if group_id in DEFAULT_SKILL_GROUP_LABELS_BY_ID and not label:
        label = DEFAULT_SKILL_GROUP_LABELS_BY_ID[group_id]
    elif not label:
        label = prettify_skill_group_label(group_id)

    if group_id in existing_ids:
        group_id = generate_skill_group_id(existing_ids, label)
    existing_ids.add(group_id)

    values = coerce_string_list(
        raw_group.get("values")
        if "values" in raw_group
        else raw_group.get("items")
        if "items" in raw_group
        else raw_group.get("strings")
        if "strings" in raw_group
        else raw_group.get("content")
    )

    return {"id": group_id, "label": label, "values": values}


def _groups_from_mapping(
    mapping: dict[str, Any],
    *,
    existing_ids: set[str],
) -> list[dict[str, Any]]:
    if not mapping:
        return []

    groups: list[dict[str, Any]] = []
    legacy_keys_present = [key for key in mapping if key in DEFAULT_SKILL_GROUP_LABELS_BY_ID]
    extra_keys = [
        key
        for key in mapping
        if key not in DEFAULT_SKILL_GROUP_LABELS_BY_ID and key != "groups"
    ]

    if legacy_keys_present:
        for group_id, default_label in DEFAULT_SKILL_GROUP_SPECS:
            existing_ids.add(group_id)
            groups.append(
                {
                    "id": group_id,
                    "label": default_label,
                    "values": coerce_string_list(mapping.get(group_id)),
                }
            )

    for key in extra_keys:
        groups.append(
            _normalize_group_dict(
                {"id": key, "label": prettify_skill_group_label(key), "values": mapping.get(key)},
                index=len(groups),
                existing_ids=existing_ids,
            )
        )

    return groups


def normalize_skill_groups(
    value: Any,
    *,
    seed_defaults_if_empty: bool = True,
) -> dict[str, Any]:
    """Normalize legacy and grouped skills payloads to `{'groups': [...]}`."""
    existing_ids: set[str] = set()

    if value is None:
        return default_skills_section() if seed_defaults_if_empty else {"groups": []}

    if isinstance(value, list):
        groups = [
            _normalize_group_dict(raw_group, index=index, existing_ids=existing_ids)
            for index, raw_group in enumerate(value)
        ]
        if not groups and seed_defaults_if_empty:
            groups = default_skill_groups()
        return {"groups": groups}

    if isinstance(value, dict):
        payload = value.get("skills") if isinstance(value.get("skills"), dict) else value
        if isinstance(payload.get("groups"), list):
            groups = [
                _normalize_group_dict(raw_group, index=index, existing_ids=existing_ids)
                for index, raw_group in enumerate(payload.get("groups") or [])
            ]

            extras = _groups_from_mapping(
                {
                    key: item
                    for key, item in payload.items()
                    if key != "groups" and key not in {"sectionType", "text", "items", "strings", "values"}
                },
                existing_ids=existing_ids,
            )

            groups.extend(
                extra_group
                for extra_group in extras
                if not any(group["id"] == extra_group["id"] for group in groups)
            )

            if not groups and seed_defaults_if_empty:
                groups = default_skill_groups()
            return {"groups": groups}

        groups = _groups_from_mapping(payload, existing_ids=existing_ids)
        if not groups and seed_defaults_if_empty:
            groups = default_skill_groups()
        return {"groups": groups}

    return default_skills_section() if seed_defaults_if_empty else {"groups": []}


def normalize_additional_groups(
    value: Any,
    *,
    seed_defaults_if_empty: bool = True,
) -> dict[str, Any]:
    groups = normalize_skill_groups(value, seed_defaults_if_empty=seed_defaults_if_empty)["groups"]
    return {
        "groups": [
            {
                "id": group.get("id", ""),
                "label": group.get("label", ""),
                "items": coerce_string_list(group.get("values")),
            }
            for group in groups
        ]
    }


def extract_skill_groups(value: Any) -> list[dict[str, Any]]:
    return normalize_skill_groups(value, seed_defaults_if_empty=False)["groups"]


def extract_additional_groups(value: Any) -> list[dict[str, Any]]:
    return extract_skill_groups(value)


def flatten_additional_items(value: Any) -> list[str]:
    groups = extract_skill_groups(value)
    items: list[str] = []
    for group in groups:
        items.extend(coerce_string_list(group.get("values")))
    return items


def additional_items_counter(value: Any) -> Counter[str]:
    return Counter(item.casefold() for item in flatten_additional_items(value) if item)


def additional_items_match(original: Any, candidate: Any) -> bool:
    return additional_items_counter(original) == additional_items_counter(candidate)


def restore_missing_additional_items(original: Any, candidate: Any) -> dict[str, Any]:
    """Append any original skill values missing from the candidate payload."""
    original_groups = extract_skill_groups(original)
    candidate_groups = copy.deepcopy(extract_skill_groups(candidate))
    if not original_groups:
        return {"groups": candidate_groups}

    existing_ids = {str(group.get("id", "")).strip() for group in candidate_groups if group.get("id")}
    current_counter = additional_items_counter(candidate_groups)
    original_counter = additional_items_counter(original_groups)
    missing_counter = original_counter - current_counter
    if not missing_counter:
        return {"groups": candidate_groups}

    by_id = {
        str(group.get("id", "")).strip(): group
        for group in candidate_groups
        if isinstance(group, dict) and group.get("id")
    }

    for original_group in original_groups:
        group_id = str(original_group.get("id", "")).strip()
        target_group = by_id.get(group_id)
        if target_group is None:
            label = str(original_group.get("label") or prettify_skill_group_label(group_id))
            resolved_id = group_id or generate_skill_group_id(existing_ids, label)
            existing_ids.add(resolved_id)
            target_group = {"id": resolved_id, "label": label, "values": []}
            candidate_groups.append(target_group)
            by_id[resolved_id] = target_group

        target_items = coerce_string_list(target_group.get("values"))
        for item in coerce_string_list(original_group.get("values")):
            key = item.casefold()
            if missing_counter.get(key, 0) <= 0:
                continue
            target_items.append(item)
            missing_counter[key] -= 1
        target_group["values"] = target_items

    return {"groups": candidate_groups}


DEFAULT_ADDITIONAL_GROUP_SPECS = DEFAULT_SKILL_GROUP_SPECS
DEFAULT_ADDITIONAL_GROUP_LABELS_BY_ID = DEFAULT_SKILL_GROUP_LABELS_BY_ID
DEFAULT_ADDITIONAL_GROUP_IDS = DEFAULT_SKILL_GROUP_IDS


def generate_additional_group_id(existing_ids: set[str], label: str) -> str:
    return generate_skill_group_id(existing_ids, label)
