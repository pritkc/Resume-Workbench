"""Legacy diff applier kept only for tests and backwards-compatible imports."""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

from app.schemas.models import ResumeChange
from app.services.additional_groups import additional_items_match, normalize_additional_groups

from app.services.tailoring.diffing import count_description_words

logger = logging.getLogger(__name__)

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")
_ALLOWED_PATH_PATTERNS = [
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^additional\.groups$"),
]
_BLOCKED_PATH_PREFIXES = frozenset({
    "personalInfo",
    "customSections",
    "sectionMeta",
})
_BLOCKED_FIELD_NAMES = frozenset({
    "years",
    "company",
    "institution",
    "title",
    "degree",
    "name",
    "role",
    "github",
    "website",
    "location",
    "id",
})
_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")


def _is_path_allowed(path: str) -> bool:
    return any(pattern.match(path) for pattern in _ALLOWED_PATH_PATTERNS)


def _is_path_blocked(path: str) -> bool:
    for prefix in _BLOCKED_PATH_PREFIXES:
        if path == prefix or path.startswith(prefix + ".") or path.startswith(prefix + "["):
            return True

    segments = path.split(".")
    if segments:
        last_segment = segments[-1]
        field_name = re.sub(r"\[\d+\]$", "", last_segment)
        if field_name in _BLOCKED_FIELD_NAMES and field_name != "description":
            return True

    if path.startswith("education"):
        return True

    return False


def _resolve_path(data: dict[str, Any], path: str) -> tuple[Any, bool]:
    current: Any = data
    for segment_match in _PATH_SEGMENT_RE.finditer(path):
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


def _set_at_path(data: dict[str, Any], path: str, value: Any) -> bool:
    segments = list(_PATH_SEGMENT_RE.finditer(path))
    if not segments:
        return False

    current: Any = data
    for seg in segments[:-1]:
        key = seg.group(1)
        index_str = seg.group(2)

        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return False
            current = current[index]

    last = segments[-1]
    key = last.group(1)
    index_str = last.group(2)

    if index_str is not None:
        if not isinstance(current, dict) or key not in current:
            return False
        target = current[key]
        index = int(index_str)
        if not isinstance(target, list) or index < 0 or index >= len(target):
            return False
        target[index] = value
    else:
        if not isinstance(current, dict):
            return False
        current[key] = value

    return True


def _verify_original_matches(actual: Any, expected: str | None) -> bool:
    if expected is None:
        return True
    if not isinstance(actual, str):
        return False
    return actual.strip().casefold() == expected.strip().casefold()


def apply_diffs(
    original: dict[str, Any],
    changes: list[ResumeChange],
) -> tuple[dict[str, Any], list[ResumeChange], list[ResumeChange]]:
    """Apply verified diffs to an original resume."""

    result = copy.deepcopy(original)
    if isinstance(result.get("additional"), dict):
        result["additional"] = normalize_additional_groups(
            result.get("additional"),
            seed_defaults_if_empty=False,
        )
    applied: list[ResumeChange] = []
    rejected: list[ResumeChange] = []

    for change in changes:
        path = change.path
        action = change.action

        if not _is_path_allowed(path):
            logger.info("Diff rejected (not in allowed list): %s", path)
            rejected.append(change)
            continue

        if _is_path_blocked(path):
            logger.info("Diff rejected (blocked path): %s", path)
            rejected.append(change)
            continue

        actual_value, resolved = _resolve_path(result, path)
        if not resolved:
            logger.info("Diff rejected (path not found): %s", path)
            rejected.append(change)
            continue

        if action == "replace":
            if not _verify_original_matches(actual_value, change.original):
                logger.info(
                    "Diff rejected (original mismatch): path=%s expected=%r actual=%r",
                    path,
                    change.original,
                    actual_value,
                )
                rejected.append(change)
                continue

            if not isinstance(change.value, str):
                logger.info("Diff rejected (replace with non-string value): %s", path)
                rejected.append(change)
                continue

            if not _set_at_path(result, path, change.value):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "append":
            if not isinstance(actual_value, list):
                logger.info("Diff rejected (append to non-list): %s", path)
                rejected.append(change)
                continue
            if not isinstance(change.value, str) or not change.value.strip():
                logger.info("Diff rejected (append non-string or empty value): %s", path)
                rejected.append(change)
                continue
            actual_value.append(change.value)
            applied.append(change)

        elif action == "reorder":
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue
            orig_set = sorted(s.casefold() for s in actual_value if isinstance(s, str))
            new_set = sorted(s.casefold() for s in change.value if isinstance(s, str))
            if orig_set != new_set:
                logger.info("Diff rejected (reorder items mismatch): %s", path)
                rejected.append(change)
                continue
            casefold_to_originals: dict[str, list[str]] = {}
            for item in actual_value:
                if isinstance(item, str):
                    casefold_to_originals.setdefault(item.casefold(), []).append(item)
            reordered: list[str] = []
            for item in change.value:
                if isinstance(item, str):
                    originals = casefold_to_originals.get(item.casefold(), [])
                    reordered.append(originals.pop(0) if originals else item)
            if not _set_at_path(result, path, reordered):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "regroup":
            if path != "additional.groups":
                logger.info("Diff rejected (regroup path unsupported): %s", path)
                rejected.append(change)
                continue
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue
            normalized = normalize_additional_groups({"groups": change.value}, seed_defaults_if_empty=False)
            if not additional_items_match({"groups": actual_value}, normalized):
                logger.info("Diff rejected (regroup items mismatch): %s", path)
                rejected.append(change)
                continue
            if not _set_at_path(result, path, normalized.get("groups", [])):
                rejected.append(change)
                continue
            applied.append(change)

        else:
            rejected.append(change)

    return result, applied, rejected


def verify_diff_result(
    original: dict[str, Any],
    result: dict[str, Any],
    applied_changes: list[ResumeChange],
) -> list[str]:
    """Legacy diff-output verification retained for tests."""

    warnings: list[str] = []
    if not applied_changes:
        warnings.append("No diffs were applied")
        return warnings

    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        result_count = len(result.get(key, []))
        if orig_count != result_count:
            warnings.append(
                f"Section count changed: {label} ({orig_count} → {result_count})"
            )

    for key, id_fields in [
        ("workExperience", ["company", "title", "location", "years"]),
        ("education", ["institution", "degree", "location", "years"]),
        ("personalProjects", ["name", "role", "location", "years", "github", "website"]),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for index, (orig_entry, result_entry) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig_entry, dict) or not isinstance(result_entry, dict):
                continue
            for field in id_fields:
                original_value = str(orig_entry.get(field, "")).strip()
                result_value = str(result_entry.get(field, "")).strip()
                if original_value and original_value != result_value:
                    warnings.append(
                        f"Identity field changed: {key}[{index}].{field} "
                        f"('{original_value}' → '{result_value}')"
                    )

    orig_words = count_description_words(original)
    result_words = count_description_words(result)
    if orig_words > 0 and result_words > orig_words * 1.8:
        warnings.append(
            "Word count increased significantly: "
            f"{orig_words} → {result_words} ({result_words / orig_words:.1f}x)"
        )

    for change in applied_changes:
        if change.action in ("replace", "append") and isinstance(change.value, str):
            new_metrics = set(_METRIC_RE.findall(change.value))
            original_text = change.original or ""
            old_metrics = set(_METRIC_RE.findall(original_text))
            invented = new_metrics - old_metrics
            if invented:
                warnings.append(
                    f"Possible invented metric in {change.path}: "
                    f"{', '.join(invented)} (not in original)"
                )

    return warnings
