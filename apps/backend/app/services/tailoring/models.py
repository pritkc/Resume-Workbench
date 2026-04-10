"""Internal models for the resume-tailoring pipeline."""

from __future__ import annotations

import copy
import math
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas import (
    CustomSection,
    ResumeChange,
    ResumeData,
    ResumeFieldDiff,
    SkillsSection,
    TailoringStageBreakdown,
    normalize_resume_data,
)
from app.services.additional_groups import coerce_string_list

TAILORING_TOP_LEVEL_KEYS = (
    "summary",
    "workExperience",
    "personalProjects",
    "skills",
    "customSections",
)
TAILORING_RESPONSE_TOP_LEVEL_KEYS = (*TAILORING_TOP_LEVEL_KEYS, "changes")

_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-*•]+|\d+[.)])\s*")


def _coerce_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        if isinstance(value, float) and math.isnan(value):
            return ""
        return str(value).strip()
    return str(value).strip()


def _coerce_optional_text(value: Any) -> str | None:
    text = _coerce_text(value)
    return text or None


def _compose_date_range(start_date: str | None, end_date: str | None) -> str:
    if start_date and end_date:
        return f"{start_date} - {end_date}"
    if start_date:
        return f"{start_date} - present"
    return end_date or ""


def _coerce_bullet_list(value: Any) -> list[str]:
    items = coerce_string_list(value)
    return [_BULLET_PREFIX_RE.sub("", item).strip() for item in items if item.strip()]


class TailoringExperience(BaseModel):
    """Canonical work entry sent to and read from the LLM."""

    model_config = ConfigDict(extra="forbid")

    id: int = 0
    position: str = ""
    title: str = ""
    company: str = ""
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    date: str = ""
    years: str = ""
    summary: str | None = None
    description: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = copy.deepcopy(value)
        if "description" not in data and "highlights" in data:
            data["description"] = copy.deepcopy(data.get("highlights"))
        data.pop("highlights", None)
        return data

    @field_validator("position", "title", "company", "date", "years", mode="before")
    @classmethod
    def _normalize_text(cls, value: Any) -> str:
        return _coerce_text(value)

    @field_validator("location", "start_date", "end_date", "summary", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_bullet_list(value)

    @classmethod
    def from_resume_entry(cls, entry: dict[str, Any]) -> "TailoringExperience":
        position = _coerce_text(entry.get("position") or entry.get("title"))
        title = _coerce_text(entry.get("title") or position)
        start_date = _coerce_optional_text(entry.get("start_date") or entry.get("startDate"))
        end_date = _coerce_optional_text(entry.get("end_date") or entry.get("endDate"))
        date = _coerce_text(entry.get("date") or entry.get("years") or _compose_date_range(start_date, end_date))
        years = _coerce_text(entry.get("years") or date)
        summary = _coerce_optional_text(entry.get("summary"))
        description = _coerce_bullet_list(entry.get("description"))
        if not description:
            description = _coerce_bullet_list(entry.get("highlights"))
        if summary and description and description[0] == summary:
            description = description[1:]
        return cls(
            id=int(entry.get("id") or 0),
            position=position,
            title=title,
            company=_coerce_text(entry.get("company")),
            location=_coerce_optional_text(entry.get("location")),
            start_date=start_date,
            end_date=end_date,
            date=date,
            years=years,
            summary=summary,
            description=description,
        )


class TailoringProject(BaseModel):
    """Canonical project entry sent to and read from the LLM."""

    model_config = ConfigDict(extra="forbid")

    id: int = 0
    name: str = ""
    summary: str | None = None
    role: str = ""
    date: str = ""
    years: str = ""
    github: str | None = None
    website: str | None = None
    description: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_fields(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = copy.deepcopy(value)
        if "description" not in data and "highlights" in data:
            data["description"] = copy.deepcopy(data.get("highlights"))
        data.pop("highlights", None)
        return data

    @field_validator("name", "role", "date", "years", mode="before")
    @classmethod
    def _normalize_text(cls, value: Any) -> str:
        return _coerce_text(value)

    @field_validator("summary", "github", "website", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_bullet_list(value)

    @classmethod
    def from_resume_entry(cls, entry: dict[str, Any]) -> "TailoringProject":
        summary = _coerce_optional_text(entry.get("summary") or entry.get("role"))
        date = _coerce_text(entry.get("date") or entry.get("years"))
        years = _coerce_text(entry.get("years") or date)
        description = _coerce_bullet_list(entry.get("description"))
        if not description:
            description = _coerce_bullet_list(entry.get("highlights"))
        return cls(
            id=int(entry.get("id") or 0),
            name=_coerce_text(entry.get("name")),
            summary=summary,
            role=_coerce_text(entry.get("role") or summary),
            date=date,
            years=years,
            github=_coerce_optional_text(entry.get("github")),
            website=_coerce_optional_text(entry.get("website")),
            description=description,
        )


class TailoringResumePayload(BaseModel):
    """Smaller LLM-facing resume shape used only for tailoring."""

    model_config = ConfigDict(extra="forbid")

    summary: str = ""
    workExperience: list[TailoringExperience] = Field(default_factory=list)
    personalProjects: list[TailoringProject] = Field(default_factory=list)
    skills: SkillsSection = Field(default_factory=SkillsSection)
    customSections: dict[str, CustomSection] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_payload(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        data = copy.deepcopy(value)
        if "skills" not in data and "additional" in data:
            data["skills"] = copy.deepcopy(data.get("additional"))
        data.pop("additional", None)
        return data

    @classmethod
    def from_resume_data(
        cls,
        resume_data: dict[str, Any] | ResumeData | None,
    ) -> TailoringResumePayload | None:
        """Create a tailoring payload from a full resume when available."""

        if resume_data is None:
            return None

        try:
            if isinstance(resume_data, ResumeData):
                source = resume_data.model_dump()
            else:
                source = ResumeData.model_validate(
                    normalize_resume_data(copy.deepcopy(resume_data))
                ).model_dump()
        except Exception:
            if not isinstance(resume_data, dict):
                return None
            source = copy.deepcopy(resume_data)

        payload = {
            "summary": copy.deepcopy(source.get("summary", "")),
            "workExperience": [
                TailoringExperience.from_resume_entry(entry)
                for entry in source.get("workExperience", [])
                if isinstance(entry, dict)
            ],
            "personalProjects": [
                TailoringProject.from_resume_entry(entry)
                for entry in source.get("personalProjects", [])
                if isinstance(entry, dict)
            ],
            "skills": copy.deepcopy(source.get("skills") or source.get("additional") or {}),
            "customSections": copy.deepcopy(source.get("customSections") or {}),
        }
        return cls.model_validate(payload)


class TailoringLLMResponse(TailoringResumePayload):
    """Structured LLM response with optional indexed change manifest."""

    changes: list[ResumeChange] = Field(default_factory=list)


class TailoringJobAnalysis(BaseModel):
    """Compact job-analysis block shared with the tailoring prompt."""

    model_config = ConfigDict(extra="forbid")

    core_title: str | None = None
    company_name: str | None = None
    location: str | None = None
    experience_years: int | None = None
    seniority_level: str | None = None
    required_skills: list[str] = Field(default_factory=list)
    preferred_skills: list[str] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    key_responsibilities: list[str] = Field(default_factory=list)
    experience_requirements: list[str] = Field(default_factory=list)
    education_requirements: list[str] = Field(default_factory=list)
    supported_keywords_from_resume: list[str] = Field(default_factory=list)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Return a compact JSON-friendly dict without empty fields."""

        payload: dict[str, Any] = {}
        for key, value in self.model_dump().items():
            if value in (None, "", []):
                continue
            payload[key] = value
        return payload


class TailoringSectionContract(BaseModel):
    """Per-section structure rules for the LLM response contract."""

    model_config = ConfigDict(extra="forbid")

    type: str
    entry_count: int | None = None
    immutable_fields: list[str] = Field(default_factory=list)
    editable_fields: list[str] = Field(default_factory=list)
    keys: list[str] = Field(default_factory=list)
    rules: list[str] = Field(default_factory=list)
    sections: dict[str, "TailoringSectionContract"] = Field(default_factory=dict)


class TailoringResponseContract(BaseModel):
    """Compact JSON contract that defines the expected LLM response shape."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "tailoring_resume_v2"
    prompt_mode: str
    top_level_keys: list[str] = Field(
        default_factory=lambda: list(TAILORING_RESPONSE_TOP_LEVEL_KEYS)
    )
    mode_rules: list[str] = Field(default_factory=list)
    sections: dict[str, TailoringSectionContract] = Field(default_factory=dict)


class TailoringResult(BaseModel):
    """Final output of the primary tailoring service."""

    model_config = ConfigDict(extra="forbid")

    resume_data: dict[str, Any]
    warnings: list[str] = Field(default_factory=list)
    response_contract: TailoringResponseContract
    used_structured_resume_input: bool = True
    raw_llm_resume_data: dict[str, Any] | None = None
    change_manifest: list[ResumeChange] = Field(default_factory=list)
    declared_changes: list[ResumeChange] = Field(default_factory=list)
    rejected_declared_changes: list[ResumeChange] = Field(default_factory=list)
    cleanup_changes: list[ResumeFieldDiff] = Field(default_factory=list)
    stage_breakdown: TailoringStageBreakdown = Field(default_factory=TailoringStageBreakdown)


TailoringSectionContract.model_rebuild()
