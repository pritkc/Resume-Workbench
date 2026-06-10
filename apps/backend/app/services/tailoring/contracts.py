"""Schema-driven response-contract builders for the tailoring prompt."""

from __future__ import annotations

from typing import Any

from app.services.tailoring.models import (
    TAILORING_RESPONSE_TOP_LEVEL_KEYS,
    TailoringResponseContract,
    TailoringResumePayload,
    TailoringSectionContract,
)


def _collect_dict_keys(entries: list[Any]) -> list[str]:
    ordered_keys: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for key in entry:
            if key in seen:
                continue
            seen.add(key)
            ordered_keys.append(key)
    return ordered_keys


def _immutable_fields(entry_keys: list[str], editable_fields: set[str]) -> list[str]:
    return [key for key in entry_keys if key not in editable_fields]


def _build_custom_section_contract(
    section_key: str,
    section_value: dict[str, Any],
) -> TailoringSectionContract:
    section_type = str(section_value.get("sectionType", "")).strip() or "text"
    if section_type == "itemList":
        items = section_value.get("items", [])
        return TailoringSectionContract(
            type="itemList",
            entry_count=len(items) if isinstance(items, list) else 0,
            editable_fields=["description"],
            immutable_fields=["sectionType", "id", "title", "subtitle", "years"],
        )
    if section_type == "text":
        return TailoringSectionContract(
            type="text",
            editable_fields=["text"],
            immutable_fields=["sectionType"],
        )
    if section_type == "stringList":
        strings = section_value.get("strings", [])
        return TailoringSectionContract(
            type="stringList",
            entry_count=len(strings) if isinstance(strings, list) else 0,
            immutable_fields=["sectionType"],
        )
    return TailoringSectionContract(type=section_type)


def compute_adaptive_max_tokens(contract: TailoringResponseContract, mode: str) -> int:
    """Compute an output cap based on empirical resume cell count.

    Formula: max(floor, min(8000, total_cells * 34 * 1.25 * 1.40))
    - 34 tok/cell: empirical from calibration test run
    - 1.25×: pretty-print overhead vs minified
    - 1.40×: safety headroom
    """
    n_exp = len(contract.experience_bullet_counts)
    n_proj = len(contract.project_bullet_counts)
    n_skill_groups = len(contract.skill_group_value_counts)

    exp_bullets = sum(contract.experience_bullet_counts)
    proj_bullets = sum(contract.project_bullet_counts)
    skill_values = sum(contract.skill_group_value_counts)

    section_headers = n_exp * 2 + n_proj * 2 + n_skill_groups + 2
    total_cells = exp_bullets + proj_bullets + skill_values + section_headers

    floor = 6000 if mode == "full" else 4096
    return max(floor, min(8000, int(total_cells * 34 * 1.25 * 1.40)))


def build_response_contract(
    resume_payload: TailoringResumePayload | None,
    *,
    prompt_id: str,
) -> TailoringResponseContract:
    sections: dict[str, TailoringSectionContract] = {
        "summary": TailoringSectionContract(
            type="string",
            editable_fields=["value"],
        ),
        "workExperience": TailoringSectionContract(
            type="array",
            entry_count=0,
            editable_fields=["tech_stacks", "description"],
            immutable_fields=["id", "position", "title", "company", "location", "start_date", "end_date", "date", "years"],
        ),
        "personalProjects": TailoringSectionContract(
            type="array",
            entry_count=0,
            editable_fields=["tech_stacks", "description"],
            immutable_fields=["id", "name", "role", "date", "years", "github", "website"],
        ),
        "skills": TailoringSectionContract(
            type="object",
            sections={
                "groups": TailoringSectionContract(
                    type="array",
                    editable_fields=["label", "values"],
                )
            },
        ),
        "customSections": TailoringSectionContract(
            type="object",
            keys=[],
            rules=["Preserve keys and types."],
        ),
        "changes": TailoringSectionContract(
            type="array",
        ),
    }

    if resume_payload is None:
        return TailoringResponseContract(
            prompt_mode=prompt_id,
            top_level_keys=list(TAILORING_RESPONSE_TOP_LEVEL_KEYS),
            sections=sections,
        )

    work_entries = resume_payload.workExperience
    work_keys = _collect_dict_keys([entry.model_dump() for entry in work_entries])
    sections["workExperience"] = TailoringSectionContract(
        type="array",
        entry_count=len(work_entries),
        immutable_fields=_immutable_fields(work_keys, {"tech_stacks", "description"}),
        editable_fields=["tech_stacks", "description"],
    )

    project_entries = resume_payload.personalProjects
    project_keys = _collect_dict_keys([entry.model_dump() for entry in project_entries])
    sections["personalProjects"] = TailoringSectionContract(
        type="array",
        entry_count=len(project_entries),
        immutable_fields=_immutable_fields(project_keys, {"tech_stacks", "description"}),
        editable_fields=["tech_stacks", "description"],
    )

    skills = resume_payload.skills.model_dump()
    groups = skills.get("groups", [])
    skill_group_value_counts = (
        [len(g.values) for g in resume_payload.skills.groups] if resume_payload.skills.groups else []
    )
    skill_group_ids: list[str] = []
    for g in resume_payload.skills.groups:
        gid = str(g.id or "").strip()
        if not gid:
            gid = f"__index_{len(skill_group_ids)}"
        skill_group_ids.append(gid)
    sections["skills"] = TailoringSectionContract(
        type="object",
        entry_count=len(groups) if isinstance(groups, list) else 0,
        sections={
            "groups": TailoringSectionContract(
                type="array",
                entry_count=len(groups) if isinstance(groups, list) else 0,
                editable_fields=["label", "values"],
            )
        },
    )

    custom_sections = resume_payload.customSections
    sections["customSections"] = TailoringSectionContract(
        type="object",
        keys=list(custom_sections.keys()),
        rules=["Preserve keys and types."],
        sections={
            section_key: _build_custom_section_contract(section_key, section_value.model_dump())
            for section_key, section_value in custom_sections.items()
        },
    )

    return TailoringResponseContract(
        prompt_mode=prompt_id,
        top_level_keys=list(TAILORING_RESPONSE_TOP_LEVEL_KEYS),
        sections=sections,
        experience_entries=[e.company for e in work_entries],
        experience_bullet_counts=[len(e.description) for e in work_entries],
        experience_positions=[e.position or e.title for e in work_entries],
        experience_tech_stacks=[e.tech_stacks or "" for e in work_entries],
        direct_jd_bullet_budget=[
            2 if index == 0 and len(entry.description) > 2 else 1
            for index, entry in enumerate(work_entries)
        ],
        preserve_story_min=[max(1, len(e.description) - (2 if index == 0 else 1)) for index, e in enumerate(work_entries)],
        project_entries=[e.name for e in project_entries],
        project_bullet_counts=[len(e.description) for e in project_entries],
        project_tech_stacks=[e.tech_stacks or "" for e in project_entries],
        skill_group_ids=skill_group_ids,
        skill_group_value_counts=skill_group_value_counts,
        max_changed_projects=2,
        project_rename_allowed=False,
    )
