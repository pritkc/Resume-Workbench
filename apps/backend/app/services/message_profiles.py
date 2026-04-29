"""Compact candidate profiles for cover-letter and outreach prompts."""

from __future__ import annotations

import copy
import json
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import ResumeData, normalize_resume_data

MAX_PROFILE_SUMMARY_CHARS = 140
MAX_PROFILE_HIGHLIGHT_CHARS = 100
MAX_PROFILE_EXPERIENCE_ENTRIES = 2
MAX_PROFILE_PROJECT_ENTRIES = 1
MAX_PROFILE_EDUCATION_ENTRIES = 1
MAX_PROFILE_HIGHLIGHTS_PER_ENTRY = 1
MAX_PROFILE_SKILL_GROUPS = 2
MAX_PROFILE_SKILLS_PER_GROUP = 4
MAX_PROFILE_CUSTOM_HIGHLIGHTS = 2


def _truncate_text(value: str | None, limit: int) -> str:
    text = " ".join((value or "").split())
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip(" ,;:-") + "..."


def _normalize_lines(values: list[str] | None, *, limit: int, text_limit: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values or []:
        text = _truncate_text(value, text_limit)
        if not text:
            continue
        lowered = text.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        result.append(text)
        if len(result) >= limit:
            break
    return result


def _format_education_entry(entry: dict[str, Any]) -> str:
    date_value = _truncate_text(entry.get("date"), 40) or _truncate_text(entry.get("years"), 40)
    if not date_value:
        start_date = _truncate_text(entry.get("start_date") or entry.get("startDate"), 20)
        end_date = _truncate_text(entry.get("end_date") or entry.get("endDate"), 20)
        if start_date and end_date:
            date_value = f"{start_date} - {end_date}"
        elif start_date:
            date_value = f"{start_date} - present"
        else:
            date_value = end_date

    degree_with_area = " in ".join(
        part
        for part in [
            _truncate_text(entry.get("degree"), 80),
            _truncate_text(entry.get("area"), 80),
        ]
        if part
    )
    parts = [
        degree_with_area or _truncate_text(entry.get("degree"), 80) or _truncate_text(entry.get("area"), 80),
        _truncate_text(entry.get("institution"), 80),
        date_value,
    ]
    return ", ".join(part for part in parts if part)


def _collect_custom_highlights(custom_sections: dict[str, Any]) -> list[str]:
    highlights: list[str] = []
    for key, section in custom_sections.items():
        label = key.replace("_", " ").strip().title() or "Custom"
        if section.get("sectionType") == "text" and section.get("text"):
            highlights.append(
                f"{label}: {_truncate_text(section['text'], MAX_PROFILE_HIGHLIGHT_CHARS)}"
            )
        elif section.get("sectionType") == "stringList":
            for value in _normalize_lines(
                section.get("strings"),
                limit=MAX_PROFILE_CUSTOM_HIGHLIGHTS,
                text_limit=MAX_PROFILE_HIGHLIGHT_CHARS,
            ):
                highlights.append(f"{label}: {value}")
        elif section.get("sectionType") == "itemList":
            for item in section.get("items") or []:
                title = _truncate_text(item.get("title"), 60)
                subtitle = _truncate_text(item.get("subtitle"), 60)
                years = _truncate_text(item.get("years"), 40)
                parts = [part for part in (title, subtitle, years) if part]
                if parts:
                    highlights.append(f"{label}: {' | '.join(parts)}")
                for bullet in _normalize_lines(
                    item.get("description"),
                    limit=1,
                    text_limit=MAX_PROFILE_HIGHLIGHT_CHARS,
                ):
                    highlights.append(f"{label}: {bullet}")
        if len(highlights) >= MAX_PROFILE_CUSTOM_HIGHLIGHTS:
            return highlights[:MAX_PROFILE_CUSTOM_HIGHLIGHTS]
    return highlights[:MAX_PROFILE_CUSTOM_HIGHLIGHTS]


class CandidateExperienceProfile(BaseModel):
    """Compact work snapshot for messaging prompts."""

    model_config = ConfigDict(extra="forbid")

    title: str = ""
    company: str = ""
    years: str = ""
    tech_stacks: str | None = None
    highlights: list[str] = Field(default_factory=list)


class CandidateProjectProfile(BaseModel):
    """Compact project snapshot for messaging prompts."""

    model_config = ConfigDict(extra="forbid")

    name: str = ""
    role: str = ""
    years: str = ""
    tech_stacks: str | None = None
    highlights: list[str] = Field(default_factory=list)


class CandidatePromptProfile(BaseModel):
    """Minimal candidate profile shared with text-generation prompts."""

    model_config = ConfigDict(extra="forbid")

    headline: str | None = None
    summary: str = ""
    experience: list[CandidateExperienceProfile] = Field(default_factory=list)
    projects: list[CandidateProjectProfile] = Field(default_factory=list)
    education: list[str] = Field(default_factory=list)
    skills: dict[str, list[str]] = Field(default_factory=dict)
    custom_highlights: list[str] = Field(default_factory=list)

    @classmethod
    def from_resume_data(cls, resume_data: dict[str, Any]) -> CandidatePromptProfile:
        """Build a compact prompt profile from the stored resume."""

        normalized = ResumeData.model_validate(
            normalize_resume_data(copy.deepcopy(resume_data))
        )
        experience = [
            CandidateExperienceProfile(
                title=_truncate_text(entry.position or entry.title, 80),
                company=_truncate_text(entry.company, 80),
                years=_truncate_text(entry.date or entry.years, 40),
                tech_stacks=_truncate_text(entry.techStack, 80) or None,
                highlights=_normalize_lines(
                    entry.highlights or [],
                    limit=MAX_PROFILE_HIGHLIGHTS_PER_ENTRY,
                    text_limit=MAX_PROFILE_HIGHLIGHT_CHARS,
                ),
            )
            for entry in normalized.workExperience[:MAX_PROFILE_EXPERIENCE_ENTRIES]
        ]
        projects = [
            CandidateProjectProfile(
                name=_truncate_text(entry.name, 80),
                role=_truncate_text(entry.role, 80),
                years=_truncate_text(entry.date or entry.years, 40),
                tech_stacks=_truncate_text(entry.techStack, 80) or None,
                highlights=_normalize_lines(
                    entry.highlights or [],
                    limit=MAX_PROFILE_HIGHLIGHTS_PER_ENTRY,
                    text_limit=MAX_PROFILE_HIGHLIGHT_CHARS,
                ),
            )
            for entry in normalized.personalProjects[:MAX_PROFILE_PROJECT_ENTRIES]
        ]
        education = [
            value
            for value in (
                _format_education_entry(entry.model_dump())
                for entry in normalized.education[:MAX_PROFILE_EDUCATION_ENTRIES]
            )
            if value
        ]

        skills: dict[str, list[str]] = {}
        for group in normalized.skills.groups[:MAX_PROFILE_SKILL_GROUPS]:
            items = _normalize_lines(
                group.values,
                limit=MAX_PROFILE_SKILLS_PER_GROUP,
                text_limit=40,
            )
            if items:
                skills[_truncate_text(group.label, 50) or "Skills"] = items

        custom_highlights = _collect_custom_highlights(
            {
                key: section.model_dump(exclude_none=True)
                for key, section in normalized.customSections.items()
            }
        )

        return cls(
            headline=_truncate_text(
                normalized.personalInfo.headline or normalized.personalInfo.title,
                80,
            )
            or None,
            summary=_truncate_text(normalized.summary, MAX_PROFILE_SUMMARY_CHARS),
            experience=experience,
            projects=projects,
            education=education,
            skills=skills,
            custom_highlights=custom_highlights,
        )

    def to_prompt_json(self) -> str:
        """Serialize the compact profile as stable prompt JSON."""

        return json.dumps(
            self.model_dump(exclude_none=True),
            separators=(',', ':'),
            ensure_ascii=True,
        )
