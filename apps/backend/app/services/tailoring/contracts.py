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


def _mode_rules(prompt_id: str) -> list[str]:
    if prompt_id in {"nudge", "keywords"}:
        return [
            "Keep description arrays the same length.",
            "Do not change indexed bullet counts in workExperience or personalProjects.",
        ]
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
            editable_fields=["summary", "description"],
            immutable_fields=["id", "position", "title", "company", "location", "start_date", "end_date", "date", "years"],
        ),
        "personalProjects": TailoringSectionContract(
            type="array",
            entry_count=0,
            editable_fields=["summary", "description"],
            immutable_fields=["id", "name", "role", "date", "years", "github", "website"],
        ),
        "skills": TailoringSectionContract(
            type="object",
            rules=[
                "Keep every original skill value exactly once.",
                "You may regroup labels and reorder groups.",
                "Do not invent new skill values.",
            ],
            sections={
                "groups": TailoringSectionContract(
                    type="array",
                    editable_fields=["label", "values"],
                    immutable_fields=["id"],
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
            rules=[
                "Include one change record per actual edit when possible.",
                "Use indexed paths like workExperience[0].description[1].",
                "Never include blocked paths like personalInfo or education.",
            ],
        ),
    }

    if resume_payload is None:
        return TailoringResponseContract(
            prompt_mode=prompt_id,
            top_level_keys=list(TAILORING_RESPONSE_TOP_LEVEL_KEYS),
            mode_rules=_mode_rules(prompt_id),
            sections=sections,
        )

    work_entries = resume_payload.workExperience
    work_keys = _collect_dict_keys([entry.model_dump() for entry in work_entries])
    sections["workExperience"] = TailoringSectionContract(
        type="array",
        entry_count=len(work_entries),
        immutable_fields=_immutable_fields(work_keys, {"summary", "description"}),
        editable_fields=["summary", "description"],
    )

    project_entries = resume_payload.personalProjects
    project_keys = _collect_dict_keys([entry.model_dump() for entry in project_entries])
    sections["personalProjects"] = TailoringSectionContract(
        type="array",
        entry_count=len(project_entries),
        immutable_fields=_immutable_fields(project_keys, {"summary", "description"}),
        editable_fields=["summary", "description"],
    )

    skills = resume_payload.skills.model_dump()
    groups = skills.get("groups", [])
    sections["skills"] = TailoringSectionContract(
        type="object",
        entry_count=len(groups) if isinstance(groups, list) else 0,
        rules=[
            "Keep every original skill value exactly once.",
            "You may regroup labels and reorder groups.",
            "Do not invent new skill values.",
        ],
        sections={
            "groups": TailoringSectionContract(
                type="array",
                entry_count=len(groups) if isinstance(groups, list) else 0,
                editable_fields=["label", "values"],
                immutable_fields=["id"],
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
        mode_rules=_mode_rules(prompt_id),
        sections=sections,
    )
