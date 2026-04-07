"""Internal models for the resume-tailoring pipeline."""

from __future__ import annotations

import copy
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.schemas import (
    AdditionalInfo,
    CustomSection,
    Education,
    Experience,
    Project,
    ResumeData,
    normalize_resume_data,
)

TAILORING_TOP_LEVEL_KEYS = (
    "summary",
    "workExperience",
    "education",
    "personalProjects",
    "additional",
    "customSections",
)


class TailoringResumePayload(BaseModel):
    """Smaller LLM-facing resume shape used only for tailoring."""

    model_config = ConfigDict(extra="forbid")

    summary: str = ""
    workExperience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    personalProjects: list[Project] = Field(default_factory=list)
    additional: AdditionalInfo = Field(default_factory=AdditionalInfo)
    customSections: dict[str, CustomSection] = Field(default_factory=dict)

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
            key: copy.deepcopy(source.get(key))
            for key in TAILORING_TOP_LEVEL_KEYS
            if key in source
        }
        return cls.model_validate(payload)


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

    schema_version: str = "tailoring_resume_v1"
    prompt_mode: str
    top_level_keys: list[str] = Field(
        default_factory=lambda: list(TAILORING_TOP_LEVEL_KEYS)
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


TailoringSectionContract.model_rebuild()
