"""Indexed change-manifest helpers for tailoring observability."""

from __future__ import annotations

import copy
import re
from difflib import SequenceMatcher
from typing import Any

from app.schemas import ResumeChange, TailoringStageBreakdown
from app.services.additional_groups import normalize_skill_groups
from app.services.tailoring.diffing import _find_original_entry_for_improved_index
from app.services.tailoring.models import TailoringLLMResponseV2

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")
_METRIC_RE = re.compile(r"\$?\b\d+(?:\.\d+)?(?:[kKmMbBxX%])?\b")
_ALLOWED_PATH_PATTERNS = (
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.(?:position|title)$"),
    re.compile(r"^workExperience\[\d+\]\.(?:techStack|summary|tech_stacks)$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.name$"),
    re.compile(r"^personalProjects\[\d+\]\.(?:techStack|summary|tech_stacks)$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^skills\.groups$"),
    re.compile(r"^bold_keywords$"),
    re.compile(r"^customSections\.[^.]+\.text$"),
    re.compile(r"^customSections\.[^.]+\.items\[\d+\]\.description(\[\d+\])?$"),
)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _first_role_text(entry: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _clean_text(entry.get(key))
        if value:
            return value
    return ""


def _format_bold_keywords_for_manifest(data: dict[str, Any]) -> str:
    raw = data.get("bold_keywords")
    if not isinstance(raw, list):
        return ""
    parts = [_clean_text(item) for item in raw if _clean_text(item)]
    parts.sort(key=str.casefold)
    return ", ".join(parts)


def _stack_line(entry: dict[str, Any] | None) -> str:
    if entry is None or not isinstance(entry, dict):
        return ""
    return _clean_text(entry.get("techStack") or entry.get("summary") or entry.get("tech_stacks"))


def _text_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_clean_text(item) for item in value if _clean_text(item)]


def _description_list(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return []
    description = _text_list(entry.get("description"))
    if not description:
        description = _text_list(entry.get("highlights"))
    stack = _clean_text(entry.get("techStack") or entry.get("summary") or entry.get("tech_stacks"))
    while stack and description and _clean_text(description[0]) == stack:
        description = description[1:]
    return description


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
            if section_key == "workExperience":
                _append_summary_change(
                    changes,
                    path=f"{base_path}.position",
                    original=original_entry.get("position") or original_entry.get("title"),
                    updated=updated_entry.get("position") or updated_entry.get("title"),
                    reason="Updated role title for job alignment.",
                )
            if section_key == "personalProjects":
                _append_summary_change(
                    changes,
                    path=f"{base_path}.name",
                    original=original_entry.get("name"),
                    updated=updated_entry.get("name"),
                    reason="Updated project title for job alignment.",
                )
            # Work + projects: per-entry tooling line (stored as techStack on resume JSON).
            orig_stack = original_entry.get("techStack") or original_entry.get("summary")
            updated_stack = updated_entry.get("techStack") or updated_entry.get("summary")
            _append_summary_change(
                changes,
                path=f"{base_path}.techStack",
                original=orig_stack,
                updated=updated_stack,
                reason=(
                    "Updated role tech stack for job alignment."
                    if section_key == "workExperience"
                    else (
                        "Updated project tech stack for job alignment."
                        if section_key == "personalProjects"
                        else "Updated section summary for job alignment."
                    )
                ),
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

    orig_kw = _format_bold_keywords_for_manifest(original)
    new_kw = _format_bold_keywords_for_manifest(updated)
    if orig_kw != new_kw:
        changes.append(
            ResumeChange(
                path="bold_keywords",
                action="replace",
                original=orig_kw or None,
                value=new_kw,
                reason="Adjusted ATS/render bold keywords for the target job.",
            )
        )

    return changes


def _skills_tailored_reason(resp: TailoringLLMResponseV2) -> str | None:
    if not resp.skills:
        return None
    parts: list[str] = []
    for group in resp.skills:
        lw = getattr(getattr(group, "label", None), "why", None)
        if isinstance(lw, str) and lw.strip():
            parts.append(lw.strip())
    text = "; ".join(parts)
    return text if text else None


def _tailored_reason_for_manifest_path(path: str, resp: TailoringLLMResponseV2) -> str | None:
    if path == "summary":
        return resp.summary.why if resp.summary else None
    if path == "bold_keywords":
        return resp.bold_keywords_why

    m = re.match(r"^workExperience\[(\d+)\]\.position$", path)
    if m:
        ent = resp.experience.get(m.group(1))
        if ent and ent.position:
            return ent.position.why
        return None

    m = re.match(r"^workExperience\[(\d+)\]\.techStack$", path)
    if m:
        ent = resp.experience.get(m.group(1))
        if ent and ent.tech_stacks:
            return ent.tech_stacks.why
        return None

    m = re.match(r"^workExperience\[(\d+)\]\.description\[(\d+)\]$", path)
    if m:
        ent = resp.experience.get(m.group(1))
        if not ent:
            return None
        cell = ent.bullets.get(m.group(2))
        return cell.why if cell else None

    m = re.match(r"^personalProjects\[(\d+)\]\.name$", path)
    if m:
        ent = resp.projects.get(m.group(1))
        if ent and ent.name:
            return ent.name.why
        return None

    m = re.match(r"^personalProjects\[(\d+)\]\.techStack$", path)
    if m:
        ent = resp.projects.get(m.group(1))
        if ent and ent.tech_stacks:
            return ent.tech_stacks.why
        return None

    m = re.match(r"^personalProjects\[(\d+)\]\.description\[(\d+)\]$", path)
    if m:
        ent = resp.projects.get(m.group(1))
        if not ent:
            return None
        cell = ent.bullets.get(m.group(2))
        return cell.why if cell else None

    if path == "skills.groups":
        return _skills_tailored_reason(resp)
    return None


def enrich_change_manifest_with_tailored_cells(
    changes: list[ResumeChange],
    llm_response: TailoringLLMResponseV2,
) -> list[ResumeChange]:
    """Replace generic manifest reasons with per-cell ``why`` strings when paths align."""

    enriched: list[ResumeChange] = []
    for change in changes:
        reason = _tailored_reason_for_manifest_path(path=change.path, resp=llm_response)
        if reason:
            enriched.append(change.model_copy(update={"reason": reason}))
        else:
            enriched.append(change)
    return enriched


def supplement_change_manifest_with_unchanged_cell_rationales(
    changes: list[ResumeChange],
    llm_response: TailoringLLMResponseV2,
    original: dict[str, Any],
    applied: dict[str, Any],
) -> list[ResumeChange]:
    """Append manifest paths where applied text equals original but a tailored cell carries a rationale.

    ``build_change_manifest`` omits paths with no textual delta; reviewers still want the model note.
    """

    paths = {c.path for c in changes}
    additions: list[ResumeChange] = []

    def add_if_absent(path: str, row: ResumeChange) -> None:
        if path in paths:
            return
        additions.append(row)
        paths.add(path)

    summary_cell = llm_response.summary
    if summary_cell is not None:
        o_s = _clean_text(original.get("summary"))
        a_s = _clean_text(applied.get("summary"))
        if o_s == a_s and o_s:
            add_if_absent(
                "summary",
                ResumeChange(
                    path="summary",
                    action="replace",
                    original=o_s,
                    value=a_s,
                    reason=summary_cell.why,
                ),
            )

    keywords_text = ", ".join(
        _clean_text(item) for item in llm_response.bold_keywords if _clean_text(item)
    )
    if keywords_text or llm_response.bold_keywords_why:
        add_if_absent(
            "bold_keywords",
            ResumeChange(
                path="bold_keywords",
                action="replace",
                original=None,
                value=keywords_text,
                reason=llm_response.bold_keywords_why or "Selected bold keywords for target job.",
            ),
        )

    orig_exp = original.get("workExperience") or []
    app_exp = applied.get("workExperience") or []
    if isinstance(orig_exp, list) and isinstance(app_exp, list):
        for key, ent in llm_response.experience.items():
            if key is None or not key.isdigit():
                continue
            idx = int(key)
            impr = app_exp[idx] if idx < len(app_exp) else None
            if not isinstance(impr, dict):
                continue
            orig_e = _find_original_entry_for_improved_index(orig_exp, app_exp, idx)
            if orig_e is None or not isinstance(orig_e, dict):
                continue

            pos_path = f"workExperience[{idx}].position"
            if ent.position is not None:
                o_t = _first_role_text(orig_e, "position", "title")
                a_t = _first_role_text(impr, "position", "title")
                if o_t == a_t and o_t:
                    add_if_absent(
                        pos_path,
                        ResumeChange(
                            path=pos_path,
                            action="replace",
                            original=o_t,
                            value=a_t,
                            reason=ent.position.why,
                        ),
                    )

            ts_path = f"workExperience[{idx}].techStack"
            if ent.tech_stacks is not None:
                o_ts = _stack_line(orig_e)
                a_ts = _stack_line(impr)
                if o_ts == a_ts:
                    add_if_absent(
                        ts_path,
                        ResumeChange(
                            path=ts_path,
                            action="replace",
                            original=o_ts or None,
                            value=a_ts or "",
                            reason=ent.tech_stacks.why,
                        ),
                    )

            orig_bullets = _description_list(orig_e)
            app_bullets = _description_list(impr)
            for bid, cell in ent.bullets.items():
                if not bid.isdigit():
                    continue
                bi = int(bid)
                path_b = f"workExperience[{idx}].description[{bi}]"
                o_b = orig_bullets[bi] if bi < len(orig_bullets) else ""
                a_b = app_bullets[bi] if bi < len(app_bullets) else ""
                if o_b == a_b and o_b:
                    add_if_absent(
                        path_b,
                        ResumeChange(
                            path=path_b,
                            action="replace",
                            original=o_b,
                            value=a_b,
                            reason=cell.why,
                        ),
                    )

    orig_proj = original.get("personalProjects") or []
    app_proj = applied.get("personalProjects") or []
    if isinstance(orig_proj, list) and isinstance(app_proj, list):
        for key, ent in llm_response.projects.items():
            if key is None or not key.isdigit():
                continue
            idx = int(key)
            impr = app_proj[idx] if idx < len(app_proj) else None
            if not isinstance(impr, dict):
                continue
            orig_e = _find_original_entry_for_improved_index(orig_proj, app_proj, idx)
            if orig_e is None or not isinstance(orig_e, dict):
                continue

            name_path = f"personalProjects[{idx}].name"
            if ent.name is not None:
                o_n = _clean_text(orig_e.get("name"))
                a_n = _clean_text(impr.get("name"))
                if o_n == a_n and o_n:
                    add_if_absent(
                        name_path,
                        ResumeChange(
                            path=name_path,
                            action="replace",
                            original=o_n,
                            value=a_n,
                            reason=ent.name.why,
                        ),
                    )

            ts_path = f"personalProjects[{idx}].techStack"
            if ent.tech_stacks is not None:
                o_ts = _stack_line(orig_e)
                a_ts = _stack_line(impr)
                if o_ts == a_ts:
                    add_if_absent(
                        ts_path,
                        ResumeChange(
                            path=ts_path,
                            action="replace",
                            original=o_ts or None,
                            value=a_ts or "",
                            reason=ent.tech_stacks.why,
                        ),
                    )

            orig_bullets = _description_list(orig_e)
            app_bullets = _description_list(impr)
            for bid, cell in ent.bullets.items():
                if not bid.isdigit():
                    continue
                bi = int(bid)
                path_b = f"personalProjects[{idx}].description[{bi}]"
                o_b = orig_bullets[bi] if bi < len(orig_bullets) else ""
                a_b = app_bullets[bi] if bi < len(app_bullets) else ""
                if o_b == a_b and o_b:
                    add_if_absent(
                        path_b,
                        ResumeChange(
                            path=path_b,
                            action="replace",
                            original=o_b,
                            value=a_b,
                            reason=cell.why,
                        ),
                    )

    return changes + additions


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
