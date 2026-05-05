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
_VALID_TOP_LEVEL = frozenset(["summary", "experience", "projects", "skills", "bold_keywords"])
@dataclass
class DiffValidationResult:
    valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_compact_diff(
    diff: dict[str, Any],
    contract: TailoringResponseContract,
) -> DiffValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    # Unknown top-level keys
    unknown = set(diff.keys()) - _VALID_TOP_LEVEL
    if unknown:
        errors.append(f"Unknown top-level keys in diff: {sorted(unknown)}")

    # Experience section
    exp = diff.get("experience", {})
    if isinstance(exp, dict):
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
                # Check bullet indexes
                bullets = entry.get("bullets", {})
                if isinstance(bullets, dict):
                    budget = (
                        contract.direct_jd_bullet_budget[idx]
                        if idx < len(contract.direct_jd_bullet_budget)
                        else 2
                    )
                    if len(bullets) > budget:
                        errors.append(
                            f"experience[{key}] rewrites too many bullets and exceeds direct JD bullet budget "
                            f"({len(bullets)} > {budget})"
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

    # Projects section
    proj = diff.get("projects", {})
    if isinstance(proj, dict):
        changed_projects = [
            entry for entry in proj.values()
            if isinstance(entry, dict) and entry
        ]
        if len(changed_projects) > contract.max_changed_projects:
            errors.append(
                f"full mode may edit at most two projects "
                f"(got {len(changed_projects)})"
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
                name = entry.get("name")
                if isinstance(name, str) and _looks_like_generic_project_label(name):
                    errors.append(
                        f"projects[{key}] project name adds generic JD label; keep project names stable"
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

    return DiffValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)


def _looks_like_generic_project_label(value: str) -> bool:
    normalized = value.strip().casefold()
    return any(label in normalized for label in generic_project_labels())
