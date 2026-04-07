"""Local resume diff helpers retained for preview UX and safety checks."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any, Callable

from app.schemas import ResumeDiffSummary, ResumeFieldDiff
from app.services.additional_groups import extract_additional_groups

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DiffConfidence:
    added: str
    removed: str
    modified: str


def _format_entry_label(parts: list[str], fallback: str) -> str:
    label = " | ".join([part for part in parts if part])
    return label if label else fallback


def _format_experience_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("title", ""),
            entry.get("company", ""),
            entry.get("years", ""),
        ],
        f"Work experience #{index + 1}",
    )


def _format_education_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("degree", ""),
            entry.get("institution", ""),
            entry.get("years", ""),
        ],
        f"Education #{index + 1}",
    )


def _format_project_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("name", ""),
            entry.get("role", ""),
            entry.get("years", ""),
        ],
        f"Project #{index + 1}",
    )


def _normalize_entry(
    entry: dict[str, Any],
    ignore_keys: set[str] | None,
) -> dict[str, Any]:
    if ignore_keys is None:
        return entry
    return {key: value for key, value in entry.items() if key not in ignore_keys}


def _append_entry_changes(
    changes: list[ResumeFieldDiff],
    field_key: str,
    field_type: str,
    original_items: list[dict[str, Any]],
    improved_items: list[dict[str, Any]],
    formatter: Callable[[dict[str, Any], int], str],
    ignore_keys: set[str] | None = None,
) -> None:
    min_len = min(len(original_items), len(improved_items))

    for idx in range(min_len):
        original_entry = original_items[idx]
        improved_entry = improved_items[idx]
        if _normalize_entry(original_entry, ignore_keys) != _normalize_entry(
            improved_entry, ignore_keys
        ):
            changes.append(
                ResumeFieldDiff(
                    field_path=f"{field_key}[{idx}]",
                    field_type=field_type,
                    change_type="modified",
                    original_value=formatter(original_entry, idx),
                    new_value=formatter(improved_entry, idx),
                    confidence="medium",
                )
            )

    for idx in range(min_len, len(improved_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="added",
                new_value=formatter(improved_items[idx], idx),
                confidence="high",
            )
        )

    for idx in range(min_len, len(original_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="removed",
                original_value=formatter(original_items[idx], idx),
                confidence="medium",
            )
        )


def _normalize_string_list(value: Any, field_name: str) -> list[str]:
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    invalid_count = 0
    for item in value:
        if isinstance(item, str):
            stripped = item.strip()
            if stripped:
                normalized.append(stripped)
            continue
        if isinstance(item, dict):
            candidate = item.get("name") or item.get("label") or item.get("value")
            if isinstance(candidate, str):
                stripped = candidate.strip()
                if stripped:
                    normalized.append(stripped)
                else:
                    invalid_count += 1
            else:
                invalid_count += 1
            continue
        if item is None:
            continue
        invalid_count += 1
    if invalid_count:
        logger.warning("Skipped non-string entries in %s: %d", field_name, invalid_count)
    return normalized


def _build_additional_item_index(value: Any) -> dict[str, tuple[str, str]]:
    index: dict[str, tuple[str, str]] = {}
    for group in extract_additional_groups(value):
        group_id = str(group.get("id", "")).strip()
        for item in _normalize_string_list(group.get("items", []), f"additional.groups[{group_id}]"):
            key = item.casefold()
            if key not in index:
                index[key] = (item, group_id)
    return index


def _format_additional_groups(value: Any) -> str:
    parts: list[str] = []
    for group in extract_additional_groups(value):
        label = str(group.get("label") or group.get("id") or "Additional").strip()
        items = _normalize_string_list(group.get("items", []), f"{label}.items")
        parts.append(f"{label}: {', '.join(items)}" if items else label)
    return " | ".join(parts)


def _extract_description_list(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return []
    return _normalize_string_list(entry.get("description", []), "workExperience.description")


def _append_list_changes(
    changes: list[ResumeFieldDiff],
    field_path: str,
    field_type: str,
    original_items: list[str],
    improved_items: list[str],
    confidences: DiffConfidence,
) -> None:
    matcher = SequenceMatcher(a=original_items, b=improved_items, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            for item in original_items[i1:i2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="removed",
                        original_value=item,
                        confidence=confidences.removed,
                    )
                )
        elif tag == "insert":
            for item in improved_items[j1:j2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="added",
                        new_value=item,
                        confidence=confidences.added,
                    )
                )
        elif tag == "replace":
            original_segment = original_items[i1:i2]
            improved_segment = improved_items[j1:j2]
            segment_len = max(len(original_segment), len(improved_segment))
            for offset in range(segment_len):
                original_value = (
                    original_segment[offset] if offset < len(original_segment) else None
                )
                new_value = (
                    improved_segment[offset] if offset < len(improved_segment) else None
                )
                if original_value is not None and new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="modified",
                            original_value=original_value,
                            new_value=new_value,
                            confidence=confidences.modified,
                        )
                    )
                elif new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="added",
                            new_value=new_value,
                            confidence=confidences.added,
                        )
                    )
                elif original_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="removed",
                            original_value=original_value,
                            confidence=confidences.removed,
                        )
                    )


def count_description_words(data: dict[str, Any]) -> int:
    """Count words across work/project description bullets."""

    sections = [
        data.get("workExperience", []),
        data.get("personalProjects", []),
    ]
    total = 0
    for entries in sections:
        if not isinstance(entries, list):
            continue
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            description = entry.get("description", [])
            if not isinstance(description, list):
                continue
            for item in description:
                if isinstance(item, str):
                    total += len(item.split())
    return total


def calculate_resume_diff(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> tuple[ResumeDiffSummary, list[ResumeFieldDiff]]:
    """Compute the diff between original and improved resumes."""

    changes: list[ResumeFieldDiff] = []

    original_summary = (original.get("summary") or "").strip()
    improved_summary = (improved.get("summary") or "").strip()
    if original_summary != improved_summary:
        if original_summary and not improved_summary:
            change_type = "removed"
        elif improved_summary and not original_summary:
            change_type = "added"
        else:
            change_type = "modified"
        changes.append(
            ResumeFieldDiff(
                field_path="summary",
                field_type="summary",
                change_type=change_type,
                original_value=original_summary or None,
                new_value=improved_summary or None,
                confidence="medium",
            )
        )

    orig_additional_items = _build_additional_item_index(original.get("additional"))
    new_additional_items = _build_additional_item_index(improved.get("additional"))
    orig_additional_keys = set(orig_additional_items)
    new_additional_keys = set(new_additional_items)

    for item_key in [
        key for key in new_additional_items.keys() if key not in orig_additional_keys
    ]:
        item_value, group_id = new_additional_items[item_key]
        changes.append(
            ResumeFieldDiff(
                field_path=f"additional.groups[{group_id}].items",
                field_type="additional_item",
                change_type="added",
                new_value=item_value,
                confidence="high",
            )
        )

    for item_key in [
        key for key in orig_additional_items.keys() if key not in new_additional_keys
    ]:
        item_value, group_id = orig_additional_items[item_key]
        changes.append(
            ResumeFieldDiff(
                field_path=f"additional.groups[{group_id}].items",
                field_type="additional_item",
                change_type="removed",
                original_value=item_value,
                confidence="medium",
            )
        )

    if _format_additional_groups(original.get("additional")) != _format_additional_groups(
        improved.get("additional")
    ):
        changes.append(
            ResumeFieldDiff(
                field_path="additional.groups",
                field_type="additional_group",
                change_type="modified",
                original_value=_format_additional_groups(original.get("additional")) or None,
                new_value=_format_additional_groups(improved.get("additional")) or None,
                confidence="medium",
            )
        )

    original_experiences = original.get("workExperience", [])
    improved_experiences = improved.get("workExperience", [])
    max_experience_len = max(len(original_experiences), len(improved_experiences))
    confidences = DiffConfidence(added="medium", removed="low", modified="medium")
    for idx in range(max_experience_len):
        original_entry = (
            original_experiences[idx] if idx < len(original_experiences) else None
        )
        improved_entry = (
            improved_experiences[idx] if idx < len(improved_experiences) else None
        )
        if not original_entry and not improved_entry:
            continue
        _append_list_changes(
            changes,
            field_path=f"workExperience[{idx}].description",
            field_type="description",
            original_items=_extract_description_list(original_entry),
            improved_items=_extract_description_list(improved_entry),
            confidences=confidences,
        )

    _append_entry_changes(
        changes,
        "workExperience",
        "experience",
        original.get("workExperience", []),
        improved.get("workExperience", []),
        _format_experience_entry,
        {"description"},
    )
    _append_entry_changes(
        changes,
        "education",
        "education",
        original.get("education", []),
        improved.get("education", []),
        _format_education_entry,
    )
    _append_entry_changes(
        changes,
        "personalProjects",
        "project",
        original.get("personalProjects", []),
        improved.get("personalProjects", []),
        _format_project_entry,
    )

    summary = ResumeDiffSummary(
        total_changes=len(changes),
        additional_items_added=len(
            [
                c
                for c in changes
                if c.field_type == "additional_item" and c.change_type == "added"
            ]
        ),
        additional_items_removed=len(
            [
                c
                for c in changes
                if c.field_type == "additional_item" and c.change_type == "removed"
            ]
        ),
        additional_groups_modified=len(
            [
                c
                for c in changes
                if c.field_type == "additional_group" and c.change_type == "modified"
            ]
        ),
        descriptions_modified=len(
            [
                c
                for c in changes
                if c.field_type == "description" and c.change_type == "modified"
            ]
        ),
        high_risk_changes=len([c for c in changes if c.confidence == "high"]),
    )

    return summary, changes
