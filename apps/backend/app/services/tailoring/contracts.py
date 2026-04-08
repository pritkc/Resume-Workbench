"""Schema-driven response-contract builders for the tailoring prompt."""

from __future__ import annotations

from typing import Any

from app.services.tailoring.models import (
    TAILORING_TOP_LEVEL_KEYS,
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


def _mode_rules(prompt_id: str) -> list[str]:
    if prompt_id in {"nudge", "keywords"}:
        return ["Keep description arrays the same length."]
    return ["May add at most one bullet per work/project entry."]


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
            editable_fields=["description"],
            immutable_fields=["id", "title", "company", "location", "years"],
        ),
        "personalProjects": TailoringSectionContract(
            type="array",
            entry_count=0,
            editable_fields=["description"],
            immutable_fields=["id", "name", "role", "years", "github", "website"],
        ),
        "additional": TailoringSectionContract(
            type="object",
            rules=["Keep every item once. May regroup."],
        ),
        "customSections": TailoringSectionContract(
            type="object",
            keys=[],
            rules=["Preserve keys and types."],
        ),
    }

    if resume_payload is None:
        return TailoringResponseContract(
            prompt_mode=prompt_id,
            top_level_keys=list(TAILORING_TOP_LEVEL_KEYS),
            mode_rules=_mode_rules(prompt_id),
            sections=sections,
        )

    work_entries = resume_payload.workExperience
    work_keys = _collect_dict_keys([entry.model_dump() for entry in work_entries])
    sections["workExperience"] = TailoringSectionContract(
        type="array",
        entry_count=len(work_entries),
        immutable_fields=_immutable_fields(work_keys, {"description"}),
        editable_fields=["description"],
    )

    project_entries = resume_payload.personalProjects
    project_keys = _collect_dict_keys([entry.model_dump() for entry in project_entries])
    sections["personalProjects"] = TailoringSectionContract(
        type="array",
        entry_count=len(project_entries),
        immutable_fields=_immutable_fields(project_keys, {"description"}),
        editable_fields=["description"],
    )

    additional = resume_payload.additional.model_dump()
    groups = additional.get("groups", [])
    sections["additional"] = TailoringSectionContract(
        type="object",
        entry_count=len(groups) if isinstance(groups, list) else 0,
        rules=["Keep every item once. May regroup."],
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
        top_level_keys=list(TAILORING_TOP_LEVEL_KEYS),
        mode_rules=_mode_rules(prompt_id),
        sections=sections,
    )

