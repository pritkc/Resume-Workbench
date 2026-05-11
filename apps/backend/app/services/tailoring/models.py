"""Internal models for the resume-tailoring pipeline."""

from __future__ import annotations

import copy
import math
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas import (
    CustomSection,
    Education,
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
    """Canonical work entry sent to and read from the LLM.

    ``tech_stacks`` is the per-role tooling line (stored as ``techStack`` on resume JSON).
    """

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
    tech_stacks: str | None = None
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
        if "tech_stacks" not in data:
            if "techStack" in data:
                data["tech_stacks"] = data.pop("techStack")
            elif "tech_stack" in data:
                data["tech_stacks"] = data.pop("tech_stack")
            elif "summary" in data:
                data["tech_stacks"] = data.pop("summary")
        return data

    @field_validator("position", "title", "company", "date", "years", mode="before")
    @classmethod
    def _normalize_text(cls, value: Any) -> str:
        return _coerce_text(value)

    @field_validator("location", "start_date", "end_date", "tech_stacks", mode="before")
    @classmethod
    def _normalize_optional_text(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_bullet_list(value)

    def to_resume_entry_dict(self) -> dict[str, Any]:
        """Map tailoring shape back to stored resume JSON."""
        data = self.model_dump()
        data["techStack"] = data.pop("tech_stacks", None)
        return data

    @classmethod
    def from_resume_entry(cls, entry: dict[str, Any]) -> "TailoringExperience":
        position = _coerce_text(entry.get("position") or entry.get("title"))
        title = _coerce_text(entry.get("title") or position)
        start_date = _coerce_optional_text(entry.get("start_date") or entry.get("startDate"))
        end_date = _coerce_optional_text(entry.get("end_date") or entry.get("endDate"))
        date = _coerce_text(entry.get("date") or entry.get("years") or _compose_date_range(start_date, end_date))
        years = _coerce_text(entry.get("years") or date)
        tech_stacks = _coerce_optional_text(
            entry.get("techStack")
            or entry.get("tech_stack")
            or entry.get("tech_stacks")
            or entry.get("summary")
        )
        description = _coerce_bullet_list(entry.get("description"))
        if not description:
            description = _coerce_bullet_list(entry.get("highlights"))
        while tech_stacks and description and description[0] == tech_stacks:
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
            tech_stacks=tech_stacks,
            description=description,
        )


def split_experience_bullets_for_llm_indexing(entry: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Split stored work bullets into (leading_prefix, llm_indexed_bullets).

    ``TailoringExperience.from_resume_entry`` drops leading ``description`` lines
    that duplicate the role tech/summary line before building the prompt and
    ``experience_bullet_counts``. Compact-diff bullet keys index into the dropped
    tail only; the prefix must be prepended unchanged when writing back.
    """
    tech_stacks = _coerce_optional_text(
        entry.get("techStack")
        or entry.get("tech_stack")
        or entry.get("tech_stacks")
        or entry.get("summary")
    )
    full = _coerce_bullet_list(entry.get("description"))
    if not full:
        full = _coerce_bullet_list(entry.get("highlights"))
    indexed = list(full)
    while tech_stacks and indexed and indexed[0] == tech_stacks:
        indexed = indexed[1:]
    prefix_len = len(full) - len(indexed)
    return full[:prefix_len], indexed


class TailoringProject(BaseModel):
    """Canonical project entry sent to and read from the LLM.

    The 'tech_stacks' field carries what is stored as ``techStack`` on the resume
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
        if "tech_stacks" not in data and "techStack" in data:
            data["tech_stacks"] = data.pop("techStack")
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
        """Convert back to resume data format."""
        data = self.model_dump()
        data["techStack"] = data.pop("tech_stacks", None)
        return data

    @classmethod
    def from_resume_entry(cls, entry: dict[str, Any]) -> "TailoringProject":
        tech_stacks = _coerce_optional_text(entry.get("techStack") or entry.get("tech_stacks") or entry.get("summary") or entry.get("role"))
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


def _llm_strip_empty(value: Any) -> Any:
    """Drop empty leaves for compact JSON sent to the model."""
    if isinstance(value, dict):
        out = {k: _llm_strip_empty(v) for k, v in value.items() if v not in (None, "", [], {})}
        return out
    if isinstance(value, list):
        return [_llm_strip_empty(v) for v in value if v not in (None, "", [], {})]
    return value


def _experience_for_llm_prompt(exp: TailoringExperience) -> dict[str, Any]:
    data = exp.model_dump()
    date_val = str(data.pop("date", None) or "").strip()
    years_val = str(data.pop("years", None) or "").strip()
    sd = str(data.get("start_date") or "").strip()
    ed = str(data.get("end_date") or "").strip()
    if not sd and not ed:
        merged = (date_val or years_val).strip()
        if merged:
            data["employment_period"] = merged
    return _llm_strip_empty(data)


def _education_for_llm_prompt(row: Education) -> dict[str, Any]:
    data = row.model_dump()
    data.pop("id", None)
    date_val = str(data.pop("date", None) or "").strip()
    years_val = str(data.pop("years", None) or "").strip()
    sd = str(data.get("start_date") or "").strip()
    ed = str(data.get("end_date") or "").strip()
    if not sd and not ed:
        merged = (date_val or years_val).strip()
        if merged:
            data["study_period"] = merged
    return _llm_strip_empty(data)


def _project_for_llm_prompt(proj: TailoringProject) -> dict[str, Any]:
    data = proj.model_dump()
    date_val = str(data.pop("date", None) or "").strip()
    years_val = str(data.pop("years", None) or "").strip()
    merged = (date_val or years_val).strip()
    if merged:
        data["project_period"] = merged
    return _llm_strip_empty(data)


def _skills_for_llm_prompt(skills: SkillsSection) -> dict[str, Any]:
    groups = [{"label": g.label, "values": list(g.values)} for g in skills.groups]
    return _llm_strip_empty({"groups": groups})


def _custom_sections_for_llm(sections: dict[str, CustomSection]) -> dict[str, Any]:
    return {k: _llm_strip_empty(v.model_dump()) for k, v in sections.items()}


class TailoringResumePayload(BaseModel):
    """Smaller LLM-facing resume shape used only for tailoring."""

    model_config = ConfigDict(extra="forbid")

    summary: str = ""
    workExperience: list[TailoringExperience] = Field(default_factory=list)
    personalProjects: list[TailoringProject] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
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
            "education": [
                Education.model_validate(copy.deepcopy(row))
                for row in source.get("education", [])
                if isinstance(row, dict)
            ],
            "skills": copy.deepcopy(source.get("skills") or source.get("additional") or {}),
            "customSections": copy.deepcopy(source.get("customSections") or {}),
        }
        return cls.model_validate(payload)

    def to_llm_prompt_dict(self) -> dict[str, Any]:
        """Resume JSON for tailoring prompts: less redundant dates, skills without group ids, plus education."""

        data: dict[str, Any] = {}
        if self.summary:
            data["summary"] = self.summary
        if self.workExperience:
            data["workExperience"] = [_experience_for_llm_prompt(e) for e in self.workExperience]
        if self.personalProjects:
            data["personalProjects"] = [_project_for_llm_prompt(p) for p in self.personalProjects]
        if self.education:
            data["education"] = [_education_for_llm_prompt(ed) for ed in self.education]
        skills_block = _skills_for_llm_prompt(self.skills)
        if skills_block.get("groups"):
            data["skills"] = skills_block
        if self.customSections:
            data["customSections"] = _custom_sections_for_llm(self.customSections)
        return _llm_strip_empty(data)


class TailoringLLMResponse(TailoringResumePayload):
    """Structured LLM response with optional indexed change manifest."""

    changes: list[ResumeChange] = Field(default_factory=list)


_LEGACY_RATIONALE = "Legacy compact output omitted per-cell rationale."


class TailoredCell(BaseModel):
    """Single editable cell: ``value`` null means retain source; ``why`` always explains intent."""

    model_config = ConfigDict(extra="forbid")

    value: str | None = None
    why: str

    @field_validator("why", mode="before")
    @classmethod
    def _normalize_why(cls, value: Any) -> str:
        text = _coerce_text(value)
        if not text:
            raise ValueError("TailoredCell.why must be non-empty")
        return text


class SkillTailoredCell(BaseModel):
    """Skill **group label** cell: rationale covers the whole group (all chips).

    Skill **value** cells use ``SkillValueCell`` (value only).
    """

    model_config = ConfigDict(extra="forbid")

    value: str | None = None
    why: str | None = None

    @field_validator("why", mode="before")
    @classmethod
    def _normalize_why_optional(cls, value: Any) -> str | None:
        if value is None:
            return None
        text = _coerce_text(value)
        return text or None


class SkillValueCell(BaseModel):
    """Single skill chip: ``value`` null means retain. No per-chip rationale."""

    model_config = ConfigDict(extra="ignore")

    value: str | None = None


def _coerce_skill_value_cell(v: Any) -> Any:
    if isinstance(v, SkillValueCell):
        return v
    if isinstance(v, dict):
        return {"value": v.get("value")}
    if isinstance(v, str):
        stripped = v.strip()
        return {"value": stripped if stripped else None}
    if v is None:
        return {"value": None}
    return v


def _coerce_skill_tailored_cell(v: Any) -> Any:
    if isinstance(v, SkillTailoredCell):
        return v
    if isinstance(v, dict):
        data = dict(v)
        why = data.get("why")
        if isinstance(why, str) and not why.strip():
            data["why"] = None
        return data
    if isinstance(v, str):
        stripped = v.strip()
        return {"value": stripped if stripped else None, "why": None}
    if v is None:
        return {"value": None, "why": None}
    return v


def _coerce_tailored_cell(v: Any, *, legacy_label: str) -> Any:
    if isinstance(v, TailoredCell):
        return v
    if isinstance(v, dict) and "why" in v:
        return v
    if isinstance(v, str):
        stripped = v.strip()
        return {"value": stripped if stripped else None, "why": legacy_label}
    if v is None:
        return {"value": None, "why": legacy_label}
    return v


class TailoredSkillsGroup(BaseModel):
    """One skill group: label rationale + value-only chips."""

    model_config = ConfigDict(extra="ignore")

    group_id: str | None = None
    label: SkillTailoredCell
    values: dict[str, SkillValueCell] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _legacy_groups(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        data = dict(data)
        hinted = data.get("group_id")
        legacy_id = data.pop("id", None)
        gid: str | None = None
        if isinstance(hinted, str) and hinted.strip():
            gid = hinted.strip()
        elif isinstance(legacy_id, str) and legacy_id.strip():
            gid = legacy_id.strip()
        if gid:
            data["group_id"] = gid

        raw_label = data.get("label", "")
        if not isinstance(raw_label, dict):
            data["label"] = _coerce_skill_tailored_cell(raw_label)
        else:
            data["label"] = _coerce_skill_tailored_cell(raw_label)
        raw_values = data.get("values")
        if isinstance(raw_values, list):
            mapped: dict[str, Any] = {}
            for index, item in enumerate(raw_values):
                mapped[str(index)] = _coerce_skill_value_cell(item)
            data["values"] = mapped
        elif isinstance(raw_values, dict):
            mapped = {str(k): _coerce_skill_value_cell(v) for k, v in raw_values.items()}
            data["values"] = mapped
        elif raw_values is None:
            data["values"] = {}
        return data


class CompactBulletDiff(BaseModel):
    """Per-entry diff in the compact addressed output format."""

    model_config = ConfigDict(extra="ignore")

    position: TailoredCell | None = None
    name: TailoredCell | None = None
    tech_stacks: TailoredCell | None = None
    bullets: dict[str, TailoredCell] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _legacy_compact_entry(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        for key in ("position", "name", "tech_stacks"):
            if key not in out:
                continue
            val = out[key]
            if not isinstance(val, dict) or "why" not in val:
                out[key] = _coerce_tailored_cell(val, legacy_label=_LEGACY_RATIONALE)
        raw_bullets = out.get("bullets")
        if raw_bullets is None:
            raw_bullets = out.get("description") or out.get("highlights")
        if isinstance(raw_bullets, list):
            cell_map: dict[str, Any] = {}
            for index, item in enumerate(raw_bullets):
                cell_map[str(index)] = _coerce_tailored_cell(item, legacy_label=_LEGACY_RATIONALE)
            out["bullets"] = cell_map
        elif isinstance(raw_bullets, dict):
            cell_map = {}
            for bkey, item in raw_bullets.items():
                if isinstance(item, dict) and "why" in item:
                    cell_map[str(bkey)] = item
                else:
                    cell_map[str(bkey)] = _coerce_tailored_cell(
                        item, legacy_label=_LEGACY_RATIONALE
                    )
            out["bullets"] = cell_map
        return out


class TailoringLLMResponseV2(BaseModel):
    """Compact LLM response with title enhancements and bold keywords.

    extra='ignore' so any legacy keys (workExperience, changes[], id, etc.)
    are silently dropped without a ValidationError.
    """

    model_config = ConfigDict(extra="ignore")

    summary: TailoredCell | None = None
    experience: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    projects: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    skills: list[TailoredSkillsGroup] | None = None
    bold_keywords: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _legacy_top_level(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        out = dict(data)
        summary_val = out.get("summary")
        if summary_val is not None and not isinstance(summary_val, dict):
            if isinstance(summary_val, str) and not summary_val.strip():
                out["summary"] = None
            else:
                out["summary"] = _coerce_tailored_cell(summary_val, legacy_label=_LEGACY_RATIONALE)
        return out

    @field_validator("skills", mode="before")
    @classmethod
    def _normalize_skills(cls, v: Any) -> Any:
        """Accept {"groups": [...]} dict shape, bare list, or TailoredSkillsGroup list."""
        if v is None:
            return None
        if isinstance(v, dict):
            v = v.get("groups")
        if not isinstance(v, list):
            return None
        return [TailoredSkillsGroup.model_validate(g) if not isinstance(g, TailoredSkillsGroup) else g for g in v]


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
    """Compact JSON contract that defines the expected LLM response shape.

    Built per tailoring request from ``build_response_contract(resume_payload, prompt_id)``,
    so entry counts, bullet counts, and parallel hint arrays always match the current
    structured resume snapshot (no stale cache).
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "tailoring_resume_v3"
    prompt_mode: str
    top_level_keys: list[str] = Field(
        default_factory=lambda: list(TAILORING_RESPONSE_TOP_LEVEL_KEYS)
    )
    mode_rules: list[str] = Field(default_factory=list)
    sections: dict[str, TailoringSectionContract] = Field(default_factory=dict)
    extensions: dict[str, object] = Field(default_factory=dict)

    # Compact address data — populated by build_response_contract
    experience_entries: list[str] = Field(default_factory=list)
    experience_bullet_counts: list[int] = Field(default_factory=list)
    experience_positions: list[str] = Field(default_factory=list)
    experience_tech_stacks: list[str] = Field(default_factory=list)
    direct_jd_bullet_budget: list[int] = Field(default_factory=list)
    preserve_story_min: list[int] = Field(default_factory=list)
    project_entries: list[str] = Field(default_factory=list)
    project_bullet_counts: list[int] = Field(default_factory=list)
    project_tech_stacks: list[str] = Field(default_factory=list)
    skill_group_value_counts: list[int] = Field(default_factory=list)
    skill_group_ids: list[str] = Field(default_factory=list)
    max_changed_projects: int = 2
    project_rename_allowed: bool = False

    def to_prompt_dict(self) -> dict[str, Any]:
        """Return compact address contract for the LLM prompt.

        Omits **tech_stacks** and **job titles (positions)** per experience row: both appear on
        the resume payload. Each row is identified by ``entries`` (company name label) and
        ``bullet_counts`` for valid bullet index ranges. Project rows use ``entries`` +
        ``bullet_counts`` only.
        """
        out: dict[str, Any] = {
            "mode": self.prompt_mode,
            "output_keys": ["summary", "experience", "projects", "skills", "bold_keywords"],
        }
        if self.mode_rules:
            out["rules"] = self.mode_rules

        if self.experience_entries:
            out["experience"] = {
                "entries": self.experience_entries,
                "bullet_counts": self.experience_bullet_counts,
                "direct_jd_bullet_budget": self.direct_jd_bullet_budget,
                "preserve_story_min": self.preserve_story_min,
            }

        if self.project_entries:
            out["projects"] = {
                "entries": self.project_entries,
                "bullet_counts": self.project_bullet_counts,
                "max_changed_entries": self.max_changed_projects,
                "rename_allowed": self.project_rename_allowed,
            }

        if self.skill_group_value_counts:
            block: dict[str, Any] = {
                "value_counts": self.skill_group_value_counts,
            }
            if self.skill_group_ids:
                block["group_ids"] = self.skill_group_ids
            out["skills"] = block

        return out


class TailoringResult(BaseModel):
    """Final output of the primary tailoring service."""

    model_config = ConfigDict(extra="forbid")

    resume_data: dict[str, Any]
    critique_analysis: dict[str, object] | None = None
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
    skills_observability: dict[str, Any] | None = None


TailoringSectionContract.model_rebuild()
