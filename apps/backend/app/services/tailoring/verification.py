"""Local verifiers for generated resume outputs."""

from __future__ import annotations

import re
from typing import Any

from app.services.tailoring.analysis import find_supported_keywords, keyword_in_text, extract_resume_text
from app.services.tailoring.diffing import calculate_resume_diff, count_description_words

_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")


def verify_generated_resume_result(
    original: dict[str, Any],
    result: dict[str, Any],
    job_keywords: dict[str, Any],
    *,
    prompt_id: str | None = None,
) -> list[str]:
    """Run local quality checks on the primary full-resume output."""

    warnings: list[str] = []
    _, changes = calculate_resume_diff(original, result)

    if not changes:
        warnings.append("No material changes were applied — resume returned nearly unchanged")
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

    original_words = count_description_words(original)
    result_words = count_description_words(result)
    if original_words > 0 and result_words > original_words * 1.8:
        warnings.append(
            "Word count increased significantly: "
            f"{original_words} → {result_words} ({result_words / original_words:.1f}x)"
        )

    for change in changes:
        new_text = change.new_value or ""
        if not new_text:
            continue
        new_metrics = set(_METRIC_RE.findall(new_text))
        original_metrics = set(_METRIC_RE.findall(change.original_value or ""))
        invented_metrics = new_metrics - original_metrics
        if invented_metrics:
            warnings.append(
                f"Possible invented metric in {change.field_path}: "
                f"{', '.join(sorted(invented_metrics))} (not in original)"
            )

    if prompt_id == "nudge":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Nudge mode introduced structural content changes")

    if prompt_id == "keywords":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Keyword mode changed section structure more than expected")

    if prompt_id in {"keywords", "full"}:
        supported_keywords = find_supported_keywords(job_keywords, original)
        if supported_keywords:
            result_text = extract_resume_text(result)
            missing_keywords = [
                keyword
                for keyword in supported_keywords
                if not keyword_in_text(keyword, result_text)
            ]
            if missing_keywords:
                warnings.append(
                    "Supported job keywords still missing after tailoring: "
                    + ", ".join(missing_keywords[:8])
                )

    return warnings
