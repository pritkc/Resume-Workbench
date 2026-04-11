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
    """Canonical project entry sent to and read from the LLM.

    The 'tech_stacks' field carries what is stored as 'summary' in the resume
    data, but is renamed in the LLM prompt to discourage hallucination —
    the model treats it as a factual tech-stack annotation rather than a
    free-form narrative summary.
    """

    model_config = ConfigDict(extra="forbid")

    id: int = 0
    name: str = ""
    tech_stacks: str | None = None
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
        # Accept 'summary' from LLM responses or legacy payloads
        if "tech_stacks" not in data and "summary" in data:
            data["tech_stacks"] = data.pop("summary")
        return data

    @field_validator("name", "role", "date", "years", mode="before")
    @classmethod
    def _normalize_text(cls, value: Any) -> str:
        return _coerce_text(value)

    @field_validator("tech_stacks", "github", "website", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_bullet_list(value)

    def to_resume_entry_dict(self) -> dict[str, Any]:
        """Convert back to resume data format (tech_stacks → summary)."""
        data = self.model_dump()
        data["summary"] = data.pop("tech_stacks", None)
        return data

    @classmethod
    def from_resume_entry(cls, entry: dict[str, Any]) -> "TailoringProject":
        tech_stacks = _coerce_optional_text(entry.get("summary") or entry.get("tech_stacks") or entry.get("role"))
        date = _coerce_text(entry.get("date") or entry.get("years"))
        years = _coerce_text(entry.get("years") or date)
        description = _coerce_bullet_list(entry.get("description"))
        if not description:
            description = _coerce_bullet_list(entry.get("highlights"))
        return cls(
            id=int(entry.get("id") or 0),
            name=_coerce_text(entry.get("name")),
            tech_stacks=tech_stacks,
            role=_coerce_text(entry.get("role") or tech_stacks),
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


class CompactBulletDiff(BaseModel):
    """Per-entry diff in the compact addressed output format."""

    model_config = ConfigDict(extra="ignore")

    position: str | None = None
    name: str | None = None
    tech_stacks: str | None = None
    bullets: dict[str, str] = Field(default_factory=dict)


class TailoringLLMResponseV2(BaseModel):
    """Compact LLM response with title enhancements and bold keywords.

    extra='ignore' so any legacy keys (workExperience, changes[], id, etc.)
    are silently dropped without a ValidationError.
    """

    model_config = ConfigDict(extra="ignore")

    summary: str = ""
    experience: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    projects: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    skills: list[dict[str, Any]] | None = None
    bold_keywords: list[str] = Field(default_factory=list)

    @field_validator("skills", mode="before")
    @classmethod
    def _normalize_skills(cls, v: Any) -> Any:
        """Accept {"groups": [...]} dict shape in addition to a bare list."""
        if isinstance(v, dict):
            return v.get("groups") or None
        return v


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


class JDRoleContext(BaseModel):
    """Role-level intelligence from the JD."""

    model_config = ConfigDict(extra="ignore")
    title: str | None = None
    seniority: str | None = None
    function: str | None = None
    scope: str | None = None


class JDCompanyContext(BaseModel):
    """Company/team intelligence from the JD."""

    model_config = ConfigDict(extra="ignore")
    name: str | None = None
    team: str | None = None
    domain: str | None = None
    product_context: str | None = None
    scale_signals: list[str] = Field(default_factory=list)


class JDTechnicalRequirements(BaseModel):
    """Technical stack requirements from the JD."""

    model_config = ConfigDict(extra="ignore")
    primary_stack: list[str] = Field(default_factory=list)
    secondary_stack: list[str] = Field(default_factory=list)
    infrastructure: list[str] = Field(default_factory=list)
    paradigms: list[str] = Field(default_factory=list)


class JDRequirements(BaseModel):
    """Hard requirements from the JD."""

    model_config = ConfigDict(extra="ignore")
    years: int | None = None
    must_have: list[str] = Field(default_factory=list)
    preferred: list[str] = Field(default_factory=list)
    education: str | None = None


class JDCalibration(BaseModel):
    """Seniority calibration signals from the JD."""

    model_config = ConfigDict(extra="ignore")
    seniority_expectations: str | None = None
    team_context: str | None = None


class JDIntelligence(BaseModel):
    """Rich job description intelligence for the 2.0 tailoring prompt."""

    model_config = ConfigDict(extra="ignore")

    role: JDRoleContext = Field(default_factory=JDRoleContext)
    company: JDCompanyContext = Field(default_factory=JDCompanyContext)
    location: str | None = None
    technical_requirements: JDTechnicalRequirements = Field(
        default_factory=JDTechnicalRequirements
    )
    requirements: JDRequirements = Field(default_factory=JDRequirements)
    responsibility_themes: list[str] = Field(default_factory=list)
    ats_keywords: list[str] = Field(default_factory=list)
    bold_keywords: list[str] = Field(default_factory=list)
    calibration: JDCalibration = Field(default_factory=JDCalibration)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Compact JSON without empty fields."""

        def _strip_empty(d: Any) -> Any:
            if isinstance(d, dict):
                return {
                    k: _strip_empty(v)
                    for k, v in d.items()
                    if v not in (None, "", [], {})
                }
            if isinstance(d, list):
                return [_strip_empty(i) for i in d]
            return d

        return _strip_empty(self.model_dump())

    def to_legacy_keywords(self) -> dict[str, Any]:
        """Produce the old job_keywords dict for backward-compatible consumers."""
        return {
            "core_title": self.role.title,
            "company_name": self.company.name,
            "location": self.location,
            "required_skills": self.technical_requirements.primary_stack,
            "preferred_skills": self.technical_requirements.secondary_stack,
            "keywords": self.ats_keywords,
            "key_responsibilities": self.responsibility_themes,
            "experience_years": self.requirements.years,
            "seniority_level": self.role.seniority,
            "experience_requirements": self.requirements.must_have,
            "education_requirements": (
                [self.requirements.education] if self.requirements.education else []
            ),
        }


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

    schema_version: str = "tailoring_resume_v3"
    prompt_mode: str
    top_level_keys: list[str] = Field(
        default_factory=lambda: list(TAILORING_RESPONSE_TOP_LEVEL_KEYS)
    )
    mode_rules: list[str] = Field(default_factory=list)
    sections: dict[str, TailoringSectionContract] = Field(default_factory=dict)

    # Compact address data — populated by build_response_contract
    experience_entries: list[str] = Field(default_factory=list)
    experience_bullet_counts: list[int] = Field(default_factory=list)
    experience_positions: list[str] = Field(default_factory=list)
    project_entries: list[str] = Field(default_factory=list)
    project_bullet_counts: list[int] = Field(default_factory=list)
    project_tech_stacks: list[str] = Field(default_factory=list)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Return compact address contract for the LLM prompt."""
        out: dict[str, Any] = {
            "mode": self.prompt_mode,
            "output_keys": ["summary", "experience", "projects", "skills", "bold_keywords"],
        }

        if self.experience_entries:
            out["experience"] = {
                "entries": self.experience_entries,
                "positions": self.experience_positions,
                "bullet_counts": self.experience_bullet_counts,
            }

        if self.project_entries:
            out["projects"] = {
                "entries": self.project_entries,
                "tech_stacks": self.project_tech_stacks,
                "bullet_counts": self.project_bullet_counts,
            }

        return out


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
    bold_keywords: list[str] = Field(default_factory=list)


TailoringSectionContract.model_rebuild()
