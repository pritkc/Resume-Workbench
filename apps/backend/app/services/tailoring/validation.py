"""Pre-apply validators for the compact diff format."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.prompts.prompt_policy import generic_project_labels
from app.services.tailoring.models import TailoringResponseContract

_LOCKED_FIELDS = frozenset([
    "id", "company", "location", "start_date", "end_date", "date", "years",
    "github", "website", "customSections",
])
_VALID_TOP_LEVEL = frozenset([
    "summary",
    "experience",
    "projects",
    "skills",
    "bold_keywords",
    "bold_keywords_why",
])


@dataclass
class DiffValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _strict_tailored_envelope(contract: TailoringResponseContract) -> bool:
    return contract.prompt_mode != "lite"


def _project_name_preview(name: Any) -> str | None:
    if isinstance(name, str):
        return name.strip() or None
    if isinstance(name, dict):
        v = name.get("value")
        if isinstance(v, str):
            return v.strip() or None
    return None


def _tailored_cell_errors(cell: Any, path: str, *, strict: bool) -> list[str]:
    errs: list[str] = []
    if isinstance(cell, str):
        if strict:
            errs.append(
                f"{path}: legacy string form not allowed in full envelope "
                f"(use {{\"value\": \"...\", \"why\": \"...\"}} or value: null to retain)"
            )
        return errs
    if not isinstance(cell, dict):
        return [f"{path}: expected object or string, got {type(cell).__name__}"]
    if "unchanged" in cell:
        errs.append(f"{path}: disallowed key 'unchanged' (use value: null to retain)")
    if strict:
        why = cell.get("why")
        if not isinstance(why, str) or not why.strip():
            errs.append(f"{path}: why is required and must be non-empty")
        if "value" not in cell:
            errs.append(f"{path}: value key is required (use null to retain source text)")
    return errs


def _skill_tailored_label_errors(cell: Any, path: str, *, strict: bool) -> list[str]:
    errs: list[str] = []
    if isinstance(cell, str):
        if strict:
            errs.append(
                f"{path}: legacy string form not allowed in full envelope "
                f'(use object with \"value\": null|string and \"why\" ... )'
            )
        return errs
    if not isinstance(cell, dict):
        return [f"{path}: expected object or string, got {type(cell).__name__}"]
    if "unchanged" in cell:
        errs.append(f"{path}: disallowed key 'unchanged' (use value: null to retain)")
    if strict:
        if "value" not in cell:
            errs.append(f"{path}: value key is required (use null to retain group label)")
        why = cell.get("why")
        if not isinstance(why, str) or not why.strip():
            errs.append(
                f"{path}: label.why is required — one compact line naming each values[] slot in order "
                f"(retain vs edit/JD rationale), no separate per-chip rationales."
            )
    return errs


def _skill_value_cell_errors(cell: Any, path: str, *, strict: bool) -> list[str]:
    errs: list[str] = []
    if cell is None:
        return []
    if isinstance(cell, str):
        return errs
    if not isinstance(cell, dict):
        return [f"{path}: expected object or string, got {type(cell).__name__}"]
    if "unchanged" in cell:
        errs.append(f"{path}: disallowed key 'unchanged' (use value: null to retain)")
    if "value" not in cell:
        errs.append(f"{path}: value key is required (use null to retain source token)")
    return errs


def _non_retain_bullet_count(bullets: dict[str, Any]) -> int:
    n = 0
    for cell in bullets.values():
        if isinstance(cell, dict):
            if cell.get("value") is not None and str(cell.get("value") or "").strip():
                n += 1
        elif isinstance(cell, str) and cell.strip():
            n += 1
    return n


def _entry_has_substantive_edit(entry: dict[str, Any]) -> bool:
    if not isinstance(entry, dict):
        return False
    for key, raw in entry.items():
        if key in _LOCKED_FIELDS:
            continue
        if key == "bullets" and isinstance(raw, dict):
            if _non_retain_bullet_count(raw) > 0:
                return True
            continue
        if isinstance(raw, dict):
            if raw.get("value") is not None and str(raw.get("value") or "").strip():
                return True
        elif isinstance(raw, str) and raw.strip():
            return True
    return False


def _looks_like_generic_project_label(value: str) -> bool:
    normalized = value.strip().casefold()
    return any(label in normalized for label in generic_project_labels())


def validate_compact_diff(
    diff: dict[str, Any],
    contract: TailoringResponseContract,
) -> DiffValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    strict = _strict_tailored_envelope(contract)

    # Unknown top-level keys
    unknown = set(diff.keys()) - _VALID_TOP_LEVEL
    if unknown:
        errors.append(f"Unknown top-level keys in diff: {sorted(unknown)}")

    if strict:
        n_exp = len(contract.experience_entries)
        if n_exp > 0 and "experience" not in diff:
            errors.append("experience missing (full envelope requires every indexed entry)")
        if len(contract.project_entries) > 0 and "projects" not in diff:
            errors.append("projects missing (full envelope requires every indexed entry)")
        if "summary" not in diff:
            errors.append("summary missing (full envelope requires summary cell)")
        skill_counts = contract.skill_group_value_counts
        if skill_counts and "skills" not in diff:
            errors.append("skills missing (full envelope requires skills groups)")
        if "bold_keywords" not in diff or not isinstance(diff.get("bold_keywords"), list):
            errors.append("bold_keywords must be present as a JSON array (full envelope)")

    # Experience section
    exp = diff.get("experience", {})
    if isinstance(exp, dict):
        if strict and len(contract.experience_entries) > 0:
            for i in range(len(contract.experience_entries)):
                key = str(i)
                if key not in exp:
                    errors.append(
                        f"experience[{key}] missing (full envelope requires keys 0..{len(contract.experience_entries) - 1})"
                    )
        for key, entry in exp.items():
            if not key.isdigit():
                errors.append(f"experience key '{key}' is not a stringified integer")
                continue
            idx = int(key)
            if idx >= len(contract.experience_entries):
                errors.append(
                    f"experience key '{key}' out of range "
                    f"(contract has {len(contract.experience_entries)} entries)"
                )
                continue
            # Check for locked fields in the entry
            if isinstance(entry, dict):
                locked = set(entry.keys()) & _LOCKED_FIELDS
                if locked:
                    errors.append(f"experience[{key}] emits locked fields: {sorted(locked)}")
                if strict:
                    for fk in ("position", "tech_stacks"):
                        val = entry.get(fk)
                        if val is None:
                            errors.append(
                                f"experience[{key}] missing required TailoredCell field {fk!r}"
                            )
                            continue
                        errors.extend(
                            _tailored_cell_errors(val, f"experience[{key}].{fk}", strict=True)
                        )
                    bpath_prefix = f"experience[{key}].bullets"
                    bullets = entry.get("bullets", {})
                    if not isinstance(bullets, dict):
                        errors.append(f"{bpath_prefix} must be an object")
                    elif idx < len(contract.experience_bullet_counts):
                        bc = contract.experience_bullet_counts[idx]
                        for bi in range(bc):
                            bk = str(bi)
                            if bk not in bullets:
                                errors.append(
                                    f"{bpath_prefix}[{bk}] missing (full envelope requires indices 0..{bc - 1})"
                                )
                            else:
                                errors.extend(
                                    _tailored_cell_errors(bullets[bk], f"{bpath_prefix}[{bk}]", strict=True)
                                )
                # Check bullet indexes / budget (legacy paths still validate structure)
                bullets = entry.get("bullets", {})
                if isinstance(bullets, dict):
                    budget = (
                        contract.direct_jd_bullet_budget[idx]
                        if idx < len(contract.direct_jd_bullet_budget)
                        else 2
                    )
                    rewritten = _non_retain_bullet_count(bullets)
                    if rewritten > budget:
                        errors.append(
                            f"experience[{key}] rewrites too many bullets and exceeds direct JD bullet budget "
                            f"({rewritten} > {budget})"
                        )
                    for bkey in bullets:
                        if not bkey.isdigit():
                            errors.append(
                                f"experience[{key}].bullets key '{bkey}' is not an integer"
                            )
                            continue
                        if idx < len(contract.experience_bullet_counts) and int(bkey) >= contract.experience_bullet_counts[idx]:
                            errors.append(
                                f"experience[{key}].bullets key '{bkey}' out of range "
                                f"(contract has {contract.experience_bullet_counts[idx]} bullets)"
                            )
    elif "experience" in diff:
        errors.append("experience must be an object when present")

    # Projects section
    proj = diff.get("projects", {})
    if isinstance(proj, dict):
        substantive = sum(1 for e in proj.values() if isinstance(e, dict) and _entry_has_substantive_edit(e))
        if substantive > contract.max_changed_projects:
            errors.append(
                f"full mode may edit at most two projects "
                f"(got {substantive})"
            )
        if strict and len(contract.project_entries) > 0:
            for i in range(len(contract.project_entries)):
                key = str(i)
                if key not in proj:
                    errors.append(
                        f"projects[{key}] missing (full envelope requires keys 0..{len(contract.project_entries) - 1})"
                    )
        for key, entry in proj.items():
            if not key.isdigit():
                errors.append(f"projects key '{key}' is not a stringified integer")
                continue
            idx = int(key)
            if idx >= len(contract.project_entries):
                errors.append(
                    f"projects key '{key}' out of range "
                    f"(contract has {len(contract.project_entries)} entries)"
                )
                continue
            if isinstance(entry, dict):
                locked = set(entry.keys()) & _LOCKED_FIELDS
                if locked:
                    errors.append(f"projects[{key}] emits locked fields: {sorted(locked)}")
                name_val = _project_name_preview(entry.get("name")) if "name" in entry else None
                if name_val and _looks_like_generic_project_label(name_val):
                    errors.append(
                        f"projects[{key}] project name adds generic JD label; keep project names stable"
                    )
                if strict:
                    for fk in ("name", "tech_stacks"):
                        val = entry.get(fk)
                        if val is None:
                            errors.append(
                                f"projects[{key}] missing required TailoredCell field {fk!r}"
                            )
                            continue
                        errors.extend(
                            _tailored_cell_errors(val, f"projects[{key}].{fk}", strict=True)
                        )
                    bpath_prefix = f"projects[{key}].bullets"
                    bullets = entry.get("bullets", {})
                    if not isinstance(bullets, dict):
                        errors.append(f"{bpath_prefix} must be an object")
                    elif idx < len(contract.project_bullet_counts):
                        bc = contract.project_bullet_counts[idx]
                        for bi in range(bc):
                            bk = str(bi)
                            if bk not in bullets:
                                errors.append(
                                    f"{bpath_prefix}[{bk}] missing (full envelope requires indices 0..{bc - 1})"
                                )
                            else:
                                errors.extend(
                                    _tailored_cell_errors(bullets[bk], f"{bpath_prefix}[{bk}]", strict=True)
                                )
                bullets = entry.get("bullets", {})
                if isinstance(bullets, dict):
                    for bkey in bullets:
                        if not bkey.isdigit():
                            errors.append(
                                f"projects[{key}].bullets key '{bkey}' is not an integer"
                            )
                            continue
                        if idx < len(contract.project_bullet_counts) and int(bkey) >= contract.project_bullet_counts[idx]:
                            errors.append(
                                f"projects[{key}].bullets key '{bkey}' out of range "
                                f"(contract has {contract.project_bullet_counts[idx]} bullets)"
                            )
    elif "projects" in diff:
        errors.append("projects must be an object when present")

    # Skills — full envelope
    raw_skills = diff.get("skills")
    if strict and contract.skill_group_value_counts:
        counts = contract.skill_group_value_counts
        if not isinstance(raw_skills, list):
            errors.append("skills must be a JSON array of groups for the tailored envelope")
        elif len(raw_skills) < len(counts):
            errors.append(
                f"skills must include {len(counts)} group(s) (got {len(raw_skills)})"
            )
        else:
            for gi, expected_n_vals in enumerate(counts):
                g = raw_skills[gi]
                if not isinstance(g, dict):
                    errors.append(f"skills[{gi}] must be an object")
                    continue
                errors.extend(_skill_tailored_label_errors(g.get("label"), f"skills[{gi}].label", strict=True))
                vals = g.get("values")
                if isinstance(vals, list):
                    if len(vals) != expected_n_vals:
                        errors.append(
                            f"skills[{gi}].values must have length {expected_n_vals} (got {len(vals)})"
                        )
                    else:
                        for vi, cell in enumerate(vals):
                            errors.extend(
                                _skill_value_cell_errors(
                                    cell, f"skills[{gi}].values[{vi}]", strict=True
                                )
                            )
                elif isinstance(vals, dict):
                    for vi in range(expected_n_vals):
                        vk = str(vi)
                        if vk not in vals:
                            errors.append(
                                f"skills[{gi}].values[{vk}] missing "
                                f"(expected indices 0..{expected_n_vals - 1})"
                            )
                        else:
                            errors.extend(
                                _skill_value_cell_errors(
                                    vals[vk], f"skills[{gi}].values[{vk}]", strict=True
                                )
                            )
                else:
                    errors.append(
                        f"skills[{gi}].values must be an array of length {expected_n_vals} "
                        f'or an object with keys "0".."N-1"'
                    )

    # Summary cell
    if "summary" in diff:
        errors.extend(_tailored_cell_errors(diff.get("summary"), "summary", strict=strict))

    if "bold_keywords_why" in diff:
        why = diff.get("bold_keywords_why")
        if why is not None and (not isinstance(why, str) or not why.strip()):
            errors.append("bold_keywords_why must be a non-empty string when present")

    return DiffValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
