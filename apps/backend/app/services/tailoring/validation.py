"""Pre-apply validators for the compact diff format."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

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
                    max_valid = (
                        contract.experience_bullet_counts[idx]
                        if idx < len(contract.experience_bullet_counts)
                        else 0
                    )
                    for bkey in bullets:
                        if not bkey.isdigit():
                            errors.append(
                                f"experience[{key}].bullets key '{bkey}' is not an integer"
                            )
                        elif int(bkey) >= max_valid:
                            errors.append(
                                f"experience[{key}].bullets[{bkey}] out of range "
                                f"(bullet_count={max_valid})"
                            )

    # Projects section
    proj = diff.get("projects", {})
    if isinstance(proj, dict):
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
                bullets = entry.get("bullets", {})
                if isinstance(bullets, dict):
                    max_valid = (
                        contract.project_bullet_counts[idx]
                        if idx < len(contract.project_bullet_counts)
                        else 0
                    )
                    for bkey in bullets:
                        if not bkey.isdigit():
                            errors.append(
                                f"projects[{key}].bullets key '{bkey}' is not an integer"
                            )
                        elif int(bkey) >= max_valid:
                            errors.append(
                                f"projects[{key}].bullets[{bkey}] out of range "
                                f"(bullet_count={max_valid})"
                            )

    return DiffValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
