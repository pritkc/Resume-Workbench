"""Local rehydration and safeguard helpers for tailored resume output."""

from __future__ import annotations

import copy
import logging
import re
from typing import Any

from app.schemas import ResumeData, normalize_resume_data
from app.services.additional_groups import (
    coerce_string_list,
    normalize_additional_groups,
    normalize_skill_groups,
    restore_missing_additional_items,
)
from app.services.cover_letter import sanitize_job_location
from app.services.parser import restore_dates_from_markdown
from app.services.refiner import (
    fix_alignment_violations,
    remove_ai_phrases,
    validate_master_alignment,
)
from app.services.section_metadata import rehydrate_section_meta
from app.services.tailoring.models import (
    TailoringProject,
    TailoringResumePayload,
    split_experience_bullets_for_llm_indexing,
)
from app.services.tailoring.jd_intel_blob import (
    contains_basic_resume_term,
    filter_basic_resume_terms,
)
from app.services.tailoring.verification import verify_generated_resume_result

logger = logging.getLogger(__name__)

MONTH_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
    re.IGNORECASE,
)
_MAX_SKILL_GROUPS = 5
_MAX_SKILLS_PER_GROUP = 14


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
    return sanitize_job_location(location)


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


def normalize_metric_units(value: str) -> str:
    """Compact common time-unit phrases so bullets keep room for technical detail."""
    text = value
    replacements = [
        (r"(?i)\bhours\s*/\s*week\b", "h/wk"),
        (r"(?i)\bhour\s*/\s*week\b", "h/wk"),
        (r"(?i)\bhours\s+per\s+week\b", "h/wk"),
        (r"(?i)\bhour\s+per\s+week\b", "h/wk"),
        (r"(?i)\bminutes\b", "min"),
        (r"(?i)\bminute\b", "min"),
        (r"(?i)\bmilliseconds\b", "ms"),
        (r"(?i)\bmillisecond\b", "ms"),
        (r"(?i)\bseconds\b", "sec"),
        (r"(?i)\bsecond\b", "sec"),
    ]
    for pattern, replacement in replacements:
        text = re.sub(pattern, replacement, text)
    text = re.sub(r"(?<=\d)\s+h/wk\b", "h/wk", text)
    return text


def _simplify_skills_groups(value: Any) -> dict[str, Any]:
    """Normalize skills into a compact label+values structure for UI/rendering.

    Rules:
    - keep at most `_MAX_SKILL_GROUPS` groups
    - keep at most `_MAX_SKILLS_PER_GROUP` values per group
    - deduplicate values globally (first occurrence wins)
    - drop empty groups
    """

    normalized = normalize_skill_groups(value, seed_defaults_if_empty=False)
    groups = normalized.get("groups", [])
    if not isinstance(groups, list):
        return {"groups": []}

    simplified: list[dict[str, Any]] = []
    seen_values: set[str] = set()

    for raw_group in groups:
        if len(simplified) >= _MAX_SKILL_GROUPS:
            break
        if not isinstance(raw_group, dict):
            continue

        label = str(raw_group.get("label", "")).strip() or "Skills"
        values: list[str] = []
        for item in filter_basic_resume_terms(coerce_string_list(raw_group.get("values"))):
            key = item.casefold()
            if key in seen_values:
                continue
            seen_values.add(key)
            values.append(item)
            if len(values) >= _MAX_SKILLS_PER_GROUP:
                break

        if not values:
            continue
        simplified.append({"label": label, "values": values})

    return {"groups": simplified}


def _strip_basic_terms_from_stack_line(value: str | None) -> str | None:
    if not isinstance(value, str):
        return value
    kept = filter_basic_resume_terms([part.strip() for part in value.split(",")])
    return ", ".join(kept) or None


def _description_count(entry: dict[str, Any], *, is_experience: bool) -> int:
    if is_experience:
        _prefix, desc = split_experience_bullets_for_llm_indexing(entry)
        return len(desc)
    return len(TailoringProject.from_resume_entry(entry).description)


def _set_description_items(
    entry: dict[str, Any],
    items: list[str],
    *,
    is_experience: bool,
) -> None:
    if is_experience:
        stack = str(entry.get("techStack") or entry.get("summary") or "").strip()
        entry["highlights"] = list(items)
        entry["description"] = [stack, *items] if stack else list(items)
        return
    entry["description"] = list(items)
    if "highlights" in entry and isinstance(entry.get("highlights"), list):
        entry["highlights"] = list(items)


def _current_description_items(entry: dict[str, Any], *, is_experience: bool) -> list[str]:
    if is_experience:
        _prefix, desc = split_experience_bullets_for_llm_indexing(entry)
        return list(desc)
    return list(TailoringProject.from_resume_entry(entry).description)


def _sync_experience_stack_prefix(
    entry: dict[str, Any],
    source_entry: dict[str, Any],
) -> None:
    prefix, desc = split_experience_bullets_for_llm_indexing(source_entry)
    if not prefix:
        return
    updated_stack = str(entry.get("techStack") or "").strip()
    merged = ([updated_stack] if updated_stack else []) + desc
    entry["description"] = merged
    if "highlights" in entry and isinstance(entry.get("highlights"), list):
        entry["highlights"] = list(merged)


def _enforce_description_counts(
    original_data: dict[str, Any] | None,
    result_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    if not original_data:
        return result_data, []

    result = copy.deepcopy(result_data)
    warnings: list[str] = []
    for section_key, is_experience in (
        ("workExperience", True),
        ("personalProjects", False),
    ):
        original_entries = original_data.get(section_key, [])
        result_entries = result.get(section_key, [])
        if not isinstance(original_entries, list) or not isinstance(result_entries, list):
            continue
        for index, original_entry in enumerate(original_entries):
            if index >= len(result_entries):
                break
            result_entry = result_entries[index]
            if not isinstance(original_entry, dict) or not isinstance(result_entry, dict):
                continue
            expected_count = _description_count(original_entry, is_experience=is_experience)
            current_items = _current_description_items(result_entry, is_experience=is_experience)
            if len(current_items) == expected_count:
                continue
            original_items = _current_description_items(original_entry, is_experience=is_experience)
            fixed_items = list(current_items[:expected_count])
            if len(fixed_items) < expected_count:
                fixed_items.extend(original_items[len(fixed_items):expected_count])
            _set_description_items(result_entry, fixed_items, is_experience=is_experience)
            warnings.append(
                f"Restored {section_key}[{index}] description count to {expected_count}"
            )
    return result, warnings


def _sanitize_low_signal_resume_terms(
    original_data: dict[str, Any] | None,
    result_data: dict[str, Any],
) -> tuple[dict[str, Any], list[str]]:
    result = copy.deepcopy(result_data)
    warnings: list[str] = []

    if contains_basic_resume_term(str(result.get("summary") or "")):
        original_summary = ""
        if isinstance(original_data, dict):
            original_summary = str(original_data.get("summary") or "").strip()
        result["summary"] = original_summary
        warnings.append("Removed blocked low-signal term from summary")

    for section_key, is_experience in (
        ("workExperience", True),
        ("personalProjects", False),
    ):
        entries = result.get(section_key, [])
        original_entries = original_data.get(section_key, []) if isinstance(original_data, dict) else []
        if not isinstance(entries, list):
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            entry_before_stack_cleanup = copy.deepcopy(entry)
            stack = entry.get("techStack") or entry.get("tech_stacks") or entry.get("summary")
            if isinstance(stack, str):
                stripped_stack = _strip_basic_terms_from_stack_line(stack)
                if stripped_stack != stack:
                    entry["techStack"] = stripped_stack
                    warnings.append(
                        f"Removed blocked low-signal term from {section_key}[{index}].techStack"
                    )

            original_entry = (
                original_entries[index]
                if isinstance(original_entries, list)
                and index < len(original_entries)
                and isinstance(original_entries[index], dict)
                else {}
            )
            original_items = _current_description_items(original_entry, is_experience=is_experience)
            current_items = _current_description_items(
                entry_before_stack_cleanup,
                is_experience=is_experience,
            )
            fixed_items: list[str] = []
            changed = False
            for bullet_index, item in enumerate(current_items):
                normalized = normalize_metric_units(item)
                if contains_basic_resume_term(normalized):
                    replacement = (
                        original_items[bullet_index]
                        if bullet_index < len(original_items)
                        else ""
                    )
                    fixed_items.append(replacement)
                    changed = True
                    continue
                fixed_items.append(normalized)
                changed = changed or normalized != item
            if changed:
                _set_description_items(entry, fixed_items, is_experience=is_experience)
                warnings.append(
                    f"Removed blocked low-signal term from {section_key}[{index}] bullets"
                )

    return result, warnings


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


def _all_skill_values(resume_data: dict[str, Any]) -> set[str]:
    skills = resume_data.get("skills") or resume_data.get("additional") or {}
    groups = skills.get("groups", [])
    return {v for group in groups for v in (group.get("values") or []) if isinstance(v, str)}


def _strip_invented_skills(
    skills_diff: list[dict[str, Any]],
    allowed: set[str],
) -> list[dict[str, Any]]:
    return [
        {"label": g.get("label", ""), "values": [v for v in (g.get("values") or []) if v in allowed]}
        for g in skills_diff
    ]


def apply_compact_diff(
    original_resume_data: dict[str, Any],
    diff: dict[str, Any],
) -> dict[str, Any]:
    """Apply a compact addressed diff onto the original resume.

    Returns a dict in TailoringResumePayload shape so all downstream code
    (finalize_tailored_resume, build_change_manifest, etc.) is unchanged.
    """
    result = copy.deepcopy(original_resume_data)

    if (
        "summary" in diff
        and isinstance(diff["summary"], str)
        and diff["summary"].strip()
        and not contains_basic_resume_term(diff["summary"])
    ):
        result["summary"] = normalize_metric_units(diff["summary"].strip())

    for diff_key, resume_key in [("experience", "workExperience"), ("projects", "personalProjects")]:
        section_diff_raw = diff.get(diff_key)
        if isinstance(section_diff_raw, list):
            section_diff = {
                str(index): entry_diff
                for index, entry_diff in enumerate(section_diff_raw)
                if isinstance(entry_diff, dict)
            }
        elif isinstance(section_diff_raw, dict):
            section_diff = section_diff_raw
        else:
            continue

        entries = result.get(resume_key, [])
        for entry_idx_str, entry_diff in section_diff.items():
            try:
                entry_idx = int(entry_idx_str)
            except (ValueError, TypeError):
                logger.warning("compact_diff: non-integer entry key %r in %s — skipped", entry_idx_str, diff_key)
                continue
            if entry_idx < 0 or entry_idx >= len(entries):
                logger.warning(
                    "compact_diff: %s index %d out of range (len=%d) — skipped",
                    diff_key, entry_idx, len(entries),
                )
                continue
            if not isinstance(entry_diff, dict):
                continue

            entry = entries[entry_idx]
            entry_before_mutation = copy.deepcopy(entry)

            if diff_key == "experience" and "position" in entry_diff:
                pos = entry_diff["position"]
                if isinstance(pos, str) and pos.strip():
                    entry["position"] = pos.strip()
                    entry["title"] = pos.strip()

            if diff_key == "projects" and "name" in entry_diff:
                nm = entry_diff["name"]
                if isinstance(nm, str) and nm.strip():
                    if not contains_basic_resume_term(nm):
                        entry["name"] = normalize_metric_units(nm.strip())

            if diff_key == "projects" and "tech_stacks" in entry_diff:
                ts = entry_diff["tech_stacks"]
                if isinstance(ts, str):
                    entry["techStack"] = _strip_basic_terms_from_stack_line(ts)

            if diff_key == "experience" and "tech_stacks" in entry_diff:
                ts = entry_diff["tech_stacks"]
                if isinstance(ts, str):
                    entry["techStack"] = _strip_basic_terms_from_stack_line(ts)

            bullets_diff_raw = entry_diff.get("bullets")
            if bullets_diff_raw is None:
                bullets_diff_raw = entry_diff.get("description")
            if bullets_diff_raw is None:
                bullets_diff_raw = entry_diff.get("highlights")

            if isinstance(bullets_diff_raw, list):
                bullets_diff = {
                    str(index): bullet
                    for index, bullet in enumerate(bullets_diff_raw)
                }
            elif isinstance(bullets_diff_raw, dict):
                bullets_diff = bullets_diff_raw
            else:
                bullets_diff = None

            if (
                diff_key == "experience"
                and "tech_stacks" in entry_diff
                and not isinstance(bullets_diff, dict)
            ):
                _sync_experience_stack_prefix(entry, entry_before_mutation)

            if isinstance(bullets_diff, dict):
                if diff_key == "experience":
                    prefix, desc = split_experience_bullets_for_llm_indexing(entry_before_mutation)
                    if prefix:
                        updated_stack = str(entry.get("techStack") or "").strip()
                        prefix = [updated_stack] if updated_stack else []
                else:
                    prefix = []
                    desc = list(TailoringProject.from_resume_entry(entry_before_mutation).description)
                for bullet_idx_str, bullet_text in bullets_diff.items():
                    try:
                        bullet_idx = int(bullet_idx_str)
                    except (ValueError, TypeError):
                        logger.warning("compact_diff: non-integer bullet key %r — skipped", bullet_idx_str)
                        continue
                    if bullet_idx < 0:
                        logger.warning(
                            "compact_diff: negative bullet index %d in %s[%d] — skipped",
                            bullet_idx,
                            diff_key,
                            entry_idx,
                        )
                        continue
                    if not isinstance(bullet_text, str) or not bullet_text.strip():
                        logger.warning(
                            "compact_diff: empty/non-string bullet at %s[%d].bullets[%d] — skipped",
                            diff_key,
                            entry_idx,
                            bullet_idx,
                        )
                        continue
                    if bullet_idx >= len(desc):
                        logger.warning(
                            "compact_diff: out-of-range bullet at %s[%d].bullets[%d] "
                            "(len=%d) — skipped",
                            diff_key,
                            entry_idx,
                            bullet_idx,
                            len(desc),
                        )
                        continue
                    if contains_basic_resume_term(bullet_text):
                        logger.warning(
                            "compact_diff: bullet at %s[%d].bullets[%d] contains basic tool — skipped",
                            diff_key,
                            entry_idx,
                            bullet_idx,
                        )
                        continue
                    desc[bullet_idx] = normalize_metric_units(bullet_text.strip())
                merged = prefix + desc
                entry["description"] = merged
                if "highlights" in entry and isinstance(entry.get("highlights"), list):
                    entry["highlights"] = list(merged)

    skills_diff = diff.get("skills")
    if isinstance(skills_diff, (list, dict)):
        simplified_skills = _simplify_skills_groups(skills_diff)
        result.setdefault("skills", {})["groups"] = simplified_skills.get("groups", [])

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
    # Trust LLM-provided skills when present; keep original skills when not provided.
    llm_returned_skills = bool(payload.skills and payload.skills.groups)
    if not llm_returned_skills:
        result = preserve_original_skills(original_resume_data, result)
    result["skills"] = _simplify_skills_groups(
        result.get("skills") or result.get("additional")
    )
    result["additional"] = normalize_additional_groups(result.get("skills"))
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
    result, low_signal_warnings = _sanitize_low_signal_resume_terms(original_resume_data, result)
    warnings.extend(low_signal_warnings)
    result, count_warnings = _enforce_description_counts(original_resume_data, result)
    warnings.extend(count_warnings)

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
                job_description=job_content,
            )
        )

    validated = ResumeData.model_validate(normalize_resume_data(result))
    return validated.model_dump(), warnings, location_source, location_value
