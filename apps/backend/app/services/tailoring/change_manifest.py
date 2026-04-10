"""Indexed change-manifest helpers for tailoring observability."""

from __future__ import annotations

import copy
import re
from difflib import SequenceMatcher
from typing import Any

from app.schemas import ResumeChange, TailoringStageBreakdown
from app.services.additional_groups import normalize_skill_groups

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")
_METRIC_RE = re.compile(r"\$?\b\d+(?:\.\d+)?(?:[kKmMbBxX%])?\b")
_ALLOWED_PATH_PATTERNS = (
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.summary$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.(?:summary|tech_stacks)$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^skills\.groups$"),
    re.compile(r"^customSections\.[^.]+\.text$"),
    re.compile(r"^customSections\.[^.]+\.items\[\d+\]\.description(\[\d+\])?$"),
)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_clean_text(item) for item in value if _clean_text(item)]


def _description_list(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return []
    description = _text_list(entry.get("description"))
    if description:
        return description
    return _text_list(entry.get("highlights"))


def _append_summary_change(
    changes: list[ResumeChange],
    *,
    path: str,
    original: str | None,
    updated: str | None,
    reason: str,
) -> None:
    original_text = _clean_text(original)
    updated_text = _clean_text(updated)
    if original_text == updated_text:
        return
    changes.append(
        ResumeChange(
            path=path,
            action="replace",
            original=original_text or None,
            value=updated_text,
            reason=reason,
        )
    )


def _append_list_changes(
    changes: list[ResumeChange],
    *,
    base_path: str,
    original_items: list[str],
    updated_items: list[str],
    reason: str,
) -> None:
    matcher = SequenceMatcher(a=original_items, b=updated_items, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            for offset, item in enumerate(original_items[i1:i2], start=i1):
                changes.append(
                    ResumeChange(
                        path=f"{base_path}[{offset}]",
                        action="remove",
                        original=item,
                        value="",
                        reason=reason,
                    )
                )
            continue
        if tag == "insert":
            for item in updated_items[j1:j2]:
                changes.append(
                    ResumeChange(
                        path=base_path,
                        action="append",
                        original=None,
                        value=item,
                        reason=reason,
                    )
                )
            continue

        original_segment = original_items[i1:i2]
        updated_segment = updated_items[j1:j2]
        segment_len = max(len(original_segment), len(updated_segment))
        for offset in range(segment_len):
            original_value = (
                original_segment[offset] if offset < len(original_segment) else None
            )
            updated_value = (
                updated_segment[offset] if offset < len(updated_segment) else None
            )
            if original_value is not None and updated_value is not None:
                changes.append(
                    ResumeChange(
                        path=f"{base_path}[{i1 + offset}]",
                        action="replace",
                        original=original_value,
                        value=updated_value,
                        reason=reason,
                    )
                )
            elif updated_value is not None:
                changes.append(
                    ResumeChange(
                        path=base_path,
                        action="append",
                        original=None,
                        value=updated_value,
                        reason=reason,
                    )
                )
            elif original_value is not None:
                changes.append(
                    ResumeChange(
                        path=f"{base_path}[{i1 + offset}]",
                        action="remove",
                        original=original_value,
                        value="",
                        reason=reason,
                    )
                )


def _normalize_skills(value: Any) -> list[dict[str, Any]]:
    normalized = normalize_skill_groups(value, seed_defaults_if_empty=False)
    return copy.deepcopy(normalized.get("groups", []))


def build_change_manifest(
    original: dict[str, Any] | None,
    updated: dict[str, Any] | None,
) -> list[ResumeChange]:
    """Build indexed path changes between two canonical resume-like payloads."""

    if not isinstance(original, dict) or not isinstance(updated, dict):
        return []

    changes: list[ResumeChange] = []

    _append_summary_change(
        changes,
        path="summary",
        original=original.get("summary"),
        updated=updated.get("summary"),
        reason="Updated summary for job alignment.",
    )

    for section_key in ("workExperience", "personalProjects"):
        original_entries = original.get(section_key, [])
        updated_entries = updated.get(section_key, [])
        if not isinstance(original_entries, list) or not isinstance(updated_entries, list):
            continue
        for index, (original_entry, updated_entry) in enumerate(zip(original_entries, updated_entries)):
            if not isinstance(original_entry, dict) or not isinstance(updated_entry, dict):
                continue
            base_path = f"{section_key}[{index}]"
            # personalProjects uses 'tech_stacks' in LLM payloads (mapped back to 'summary')
            orig_summary = original_entry.get("summary") or original_entry.get("tech_stacks")
            updated_summary = updated_entry.get("summary") or updated_entry.get("tech_stacks")
            _append_summary_change(
                changes,
                path=f"{base_path}.summary",
                original=orig_summary,
                updated=updated_summary,
                reason="Updated section summary for job alignment.",
            )
            _append_list_changes(
                changes,
                base_path=f"{base_path}.description",
                original_items=_description_list(original_entry),
                updated_items=_description_list(updated_entry),
                reason="Updated bullet content for job alignment.",
            )

    original_skills = _normalize_skills(original.get("skills") or original.get("additional"))
    updated_skills = _normalize_skills(updated.get("skills") or updated.get("additional"))
    if original_skills != updated_skills:
        changes.append(
            ResumeChange(
                path="skills.groups",
                action="regroup",
                original=None,
                value=updated_skills,
                reason="Regrouped or relabeled skills for the target job.",
            )
        )

    original_custom = original.get("customSections", {})
    updated_custom = updated.get("customSections", {})
    if isinstance(original_custom, dict) and isinstance(updated_custom, dict):
        for key, updated_section in updated_custom.items():
            original_section = original_custom.get(key)
            if not isinstance(updated_section, dict) or not isinstance(original_section, dict):
                continue
            section_type = _clean_text(updated_section.get("sectionType"))
            if section_type == "text":
                _append_summary_change(
                    changes,
                    path=f"customSections.{key}.text",
                    original=original_section.get("text"),
                    updated=updated_section.get("text"),
                    reason="Updated custom text section for job alignment.",
                )
            if section_type == "itemList":
                original_items = original_section.get("items", [])
                updated_items = updated_section.get("items", [])
                if not isinstance(original_items, list) or not isinstance(updated_items, list):
                    continue
                for index, (original_item, updated_item) in enumerate(zip(original_items, updated_items)):
                    if not isinstance(original_item, dict) or not isinstance(updated_item, dict):
                        continue
                    _append_list_changes(
                        changes,
                        base_path=f"customSections.{key}.items[{index}].description",
                        original_items=_description_list(original_item),
                        updated_items=_description_list(updated_item),
                        reason="Updated custom section bullets for job alignment.",
                    )

    return changes


def _is_allowed_path(path: str) -> bool:
    return any(pattern.match(path) for pattern in _ALLOWED_PATH_PATTERNS)


def _resolve_path(data: dict[str, Any], path: str) -> tuple[Any, bool]:
    custom_section_match = re.match(
        r"^customSections\.([^.]+)\.(text|items(?:\[\d+\])?\.description(?:\[\d+\])?)$",
        path,
    )
    if custom_section_match:
        key = custom_section_match.group(1)
        remainder = custom_section_match.group(2)
        custom_sections = data.get("customSections")
        if not isinstance(custom_sections, dict) or key not in custom_sections:
            return None, False
        current: Any = custom_sections[key]
        synthetic_path = remainder
    else:
        current = data
        synthetic_path = path

    for segment_match in _PATH_SEGMENT_RE.finditer(synthetic_path):
        key = segment_match.group(1)
        index_str = segment_match.group(2)
        if not isinstance(current, dict) or key not in current:
            return None, False
        current = current[key]
        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return None, False
            current = current[index]
    return current, True


def validate_declared_changes(
    original: dict[str, Any] | None,
    declared_changes: list[ResumeChange],
) -> tuple[list[ResumeChange], list[ResumeChange]]:
    """Validate declared LLM changes against the allowed canonical paths."""

    if not isinstance(original, dict):
        return [], list(declared_changes)

    accepted: list[ResumeChange] = []
    rejected: list[ResumeChange] = []
    for change in declared_changes:
        if not _is_allowed_path(change.path):
            rejected.append(change)
            continue
        actual_value, resolved = _resolve_path(original, change.path)
        if not resolved:
            rejected.append(change)
            continue
        if change.original is not None:
            if isinstance(actual_value, str):
                actual_text = actual_value.strip()
            elif isinstance(actual_value, list) and change.action == "append":
                actual_text = ""
            else:
                actual_text = _clean_text(actual_value)
            if actual_text.casefold() != change.original.strip().casefold():
                rejected.append(change)
                continue
        accepted.append(change)
    return accepted, rejected


def count_numeric_claim_changes(changes: list[ResumeChange]) -> int:
    """Count changes whose new values include numeric claims."""

    count = 0
    for change in changes:
        value = change.value
        values = value if isinstance(value, list) else [value]
        for item in values:
            text = _clean_text(item)
            if text and _METRIC_RE.search(text):
                count += 1
                break
    return count


def build_stage_breakdown(
    *,
    declared_changes: list[ResumeChange],
    computed_llm_changes: list[ResumeChange],
    applied_changes: list[ResumeChange],
    rejected_declared_changes: list[ResumeChange],
    cleanup_only_changes: list[Any],
    location_source: str,
    location_value: str | None,
) -> TailoringStageBreakdown:
    """Build the compact stage-by-stage accounting block for UI/API use."""

    skill_changes = len(
        [change for change in applied_changes if change.path.startswith("skills.groups")]
    )
    return TailoringStageBreakdown(
        llm_declared_changes=len(declared_changes),
        llm_computed_changes=len(computed_llm_changes),
        llm_applied_changes=len(applied_changes),
        llm_rejected_changes=len(rejected_declared_changes),
        cleanup_only_changes=len(cleanup_only_changes),
        numeric_claim_changes=count_numeric_claim_changes(computed_llm_changes),
        numeric_claim_rejections=count_numeric_claim_changes(rejected_declared_changes),
        skill_changes=skill_changes,
        final_render_changes=len(applied_changes),
        location_source=location_source if location_source in {"jd", "master", "none"} else "none",
        location_value=location_value,
    )
