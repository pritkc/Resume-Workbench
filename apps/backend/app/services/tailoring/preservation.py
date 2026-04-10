"""Local rehydration and safeguard helpers for tailored resume output."""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

from app.schemas import ResumeData, normalize_resume_data
from app.services.additional_groups import restore_missing_additional_items
from app.services.parser import restore_dates_from_markdown
from app.services.refiner import (
    fix_alignment_violations,
    remove_ai_phrases,
    validate_master_alignment,
)
from app.services.section_metadata import rehydrate_section_meta
from app.services.tailoring.models import TailoringResumePayload
from app.services.tailoring.verification import verify_generated_resume_result

logger = logging.getLogger(__name__)

MONTH_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
    re.IGNORECASE,
)


def _normalized_source_resume(
    source_resume_data: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if source_resume_data is None:
        return None
    try:
        normalized = normalize_resume_data(copy.deepcopy(source_resume_data))
        return ResumeData.model_validate(normalized).model_dump()
    except Exception:
        if isinstance(source_resume_data, dict):
            return copy.deepcopy(source_resume_data)
        return None


def _has_month(date_str: str) -> bool:
    return bool(MONTH_PATTERN.search(date_str))


def preserve_personal_info(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    """Preserve personal info from the original resume."""

    warnings: list[str] = []

    if not original_data:
        warnings.append(
            "Original resume data unavailable - personal info may be AI-generated"
        )
        return improved_data, warnings

    original_info = original_data.get("personalInfo")
    if not isinstance(original_info, dict):
        warnings.append("Original personal info missing or invalid")
        return improved_data, warnings

    result = copy.deepcopy(improved_data)
    result["personalInfo"] = copy.deepcopy(original_info)
    return result, warnings


def _resolved_target_location(job_keywords: dict[str, Any]) -> str | None:
    location = job_keywords.get("location")
    if not isinstance(location, str):
        return None
    cleaned = location.strip()
    return cleaned or None


def restore_original_dates(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore date precision the model may have simplified."""

    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)

    for section_key in ("workExperience", "education", "personalProjects"):
        orig_entries = original_data.get(section_key, [])
        result_entries = result.get(section_key, [])
        for idx, orig_entry in enumerate(orig_entries):
            if idx >= len(result_entries):
                break
            if not isinstance(orig_entry, dict) or not isinstance(result_entries[idx], dict):
                continue
            orig_years = orig_entry.get("years", "")
            result_years = result_entries[idx].get("years", "")
            if (
                isinstance(orig_years, str)
                and isinstance(result_years, str)
                and orig_years
                and orig_years != result_years
                and _has_month(orig_years)
                and not _has_month(result_years)
            ):
                logger.info(
                    "Restoring date in %s[%d]: %r → %r",
                    section_key,
                    idx,
                    result_years,
                    orig_years,
                )
                result_entries[idx]["years"] = orig_years

    orig_custom = original_data.get("customSections", {})
    result_custom = result.get("customSections", {})
    if isinstance(orig_custom, dict) and isinstance(result_custom, dict):
        for section_key, orig_section in orig_custom.items():
            if not isinstance(orig_section, dict):
                continue
            result_section = result_custom.get(section_key)
            if not isinstance(result_section, dict):
                continue
            if orig_section.get("sectionType") != "itemList":
                continue
            orig_items = orig_section.get("items", [])
            result_items = result_section.get("items", [])
            for idx, orig_item in enumerate(orig_items):
                if idx >= len(result_items):
                    break
                if not isinstance(orig_item, dict) or not isinstance(result_items[idx], dict):
                    continue
                orig_years = orig_item.get("years", "")
                result_years = result_items[idx].get("years", "")
                if (
                    isinstance(orig_years, str)
                    and isinstance(result_years, str)
                    and orig_years
                    and orig_years != result_years
                    and _has_month(orig_years)
                    and not _has_month(result_years)
                ):
                    result_items[idx]["years"] = orig_years

    return result


def preserve_original_skills(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Restore any original skill values dropped by the LLM."""

    if not original_data:
        return improved_data

    result = copy.deepcopy(improved_data)
    result["skills"] = restore_missing_additional_items(
        original_data.get("skills") or original_data.get("additional"),
        result.get("skills") or result.get("additional"),
    )
    return result


def protect_custom_sections(
    original_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
) -> dict[str, Any]:
    """Protect custom sections from hallucinated additions."""

    if not original_data:
        return improved_data

    orig_custom = original_data.get("customSections")
    if not isinstance(orig_custom, dict) or not orig_custom:
        return improved_data

    result = copy.deepcopy(improved_data)
    result_custom = result.get("customSections")
    if not isinstance(result_custom, dict):
        return result

    for section_key, orig_section in orig_custom.items():
        if not isinstance(orig_section, dict):
            continue
        result_section = result_custom.get(section_key)
        if not isinstance(result_section, dict):
            result_custom[section_key] = copy.deepcopy(orig_section)
            logger.info("Restored missing custom section: %s", section_key)
            continue

        if orig_section.get("sectionType") != "itemList":
            continue

        orig_items = orig_section.get("items", [])
        result_items = result_section.get("items", [])
        if not isinstance(orig_items, list) or not isinstance(result_items, list):
            continue

        if len(result_items) > len(orig_items):
            logger.info(
                "Trimming %d hallucinated items from customSections.%s",
                len(result_items) - len(orig_items),
                section_key,
            )
            result_items = result_items[: len(orig_items)]

        for idx, orig_item in enumerate(orig_items):
            if idx >= len(result_items):
                break
            if not isinstance(orig_item, dict):
                continue
            orig_desc = orig_item.get("description")
            if isinstance(orig_desc, list) and len(orig_desc) == 0:
                result_desc = result_items[idx].get("description")
                if isinstance(result_desc, list) and len(result_desc) > 0:
                    logger.info(
                        "Reverted fabricated description on customSections.%s.items[%d]",
                        section_key,
                        idx,
                    )
                    result_items[idx]["description"] = []

        result_section["items"] = result_items

    result["customSections"] = result_custom
    return result


def apply_local_resume_cleanup(
    source_data: dict[str, Any] | None,
    improved_data: dict[str, Any],
    job_content: str,
) -> tuple[dict[str, Any], list[str]]:
    """Apply local cleanup so unsupported additions do not leak through."""

    warnings: list[str] = []
    result = improved_data

    cleaned_data, removed_ai_phrases = remove_ai_phrases(result, job_content)
    if removed_ai_phrases:
        result = cleaned_data
        warnings.append(
            "Removed AI-style phrasing: " + ", ".join(sorted(removed_ai_phrases))
        )

    if source_data:
        alignment_report = validate_master_alignment(result, source_data)
        critical_violations = [
            violation
            for violation in alignment_report.violations
            if violation.severity == "critical"
        ]
        if critical_violations:
            result = fix_alignment_violations(result, critical_violations)
            warnings.append(
                f"Removed {len(critical_violations)} unsupported addition(s) from tailored resume"
            )

    return result, warnings


def rehydrate_tailoring_resume(
    payload: TailoringResumePayload,
    *,
    original_resume_data: dict[str, Any] | None,
) -> dict[str, Any]:
    """Rebuild a full ResumeData object from the smaller tailoring payload."""

    source_resume = _normalized_source_resume(original_resume_data)
    result = ResumeData().model_dump()
    if source_resume and isinstance(source_resume.get("personalInfo"), dict):
        result["personalInfo"] = copy.deepcopy(source_resume["personalInfo"])

    result.update(payload.model_dump())

    if source_resume:
        result["education"] = copy.deepcopy(source_resume.get("education", []))

    result["sectionMeta"] = rehydrate_section_meta(
        result.get("customSections"),
        base_resume_data=source_resume,
    )
    return ResumeData.model_validate(normalize_resume_data(result)).model_dump()


def finalize_tailored_resume(
    *,
    payload: TailoringResumePayload,
    original_resume_data: dict[str, Any] | None,
    original_resume_markdown: str,
    cleanup_source_data: dict[str, Any] | None,
    job_content: str,
    job_keywords: dict[str, Any],
    prompt_id: str,
) -> tuple[dict[str, Any], list[str], str, str | None]:
    """Apply all local safeguards and return a full resume payload plus warnings."""

    result = rehydrate_tailoring_resume(
        payload,
        original_resume_data=original_resume_data,
    )
    warnings: list[str] = []

    result, preserve_warnings = preserve_personal_info(original_resume_data, result)
    warnings.extend(preserve_warnings)

    result = restore_original_dates(original_resume_data, result)
    if original_resume_markdown:
        result = restore_dates_from_markdown(result, original_resume_markdown)
    result = preserve_original_skills(original_resume_data, result)
    result = protect_custom_sections(original_resume_data, result)
    result["sectionMeta"] = rehydrate_section_meta(
        result.get("customSections"),
        base_resume_data=original_resume_data,
    )

    cleanup_source = cleanup_source_data or original_resume_data
    result, cleanup_warnings = apply_local_resume_cleanup(
        cleanup_source,
        result,
        job_content,
    )
    warnings.extend(cleanup_warnings)

    target_location = _resolved_target_location(job_keywords)
    if target_location:
        personal_info = result.get("personalInfo")
        if not isinstance(personal_info, dict):
            personal_info = {}
            result["personalInfo"] = personal_info
        personal_info["location"] = target_location
        location_source = "jd"
        location_value = target_location
    else:
        location_value = None
        location_source = "none"
        if isinstance(result.get("personalInfo"), dict):
            current_location = result["personalInfo"].get("location")
            if isinstance(current_location, str) and current_location.strip():
                location_source = "master"
                location_value = current_location.strip()

    if original_resume_data:
        warnings.extend(
            verify_generated_resume_result(
                original_resume_data,
                result,
                job_keywords,
                prompt_id=prompt_id,
            )
        )

    validated = ResumeData.model_validate(normalize_resume_data(result))
    return validated.model_dump(), warnings, location_source, location_value
