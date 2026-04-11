"""Pydantic models matching frontend expectations."""

from __future__ import annotations

import copy
import re
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field, computed_field, field_validator, model_validator

from app.prompts import DEFAULT_IMPROVE_PROMPT_ID
from app.services.additional_groups import (
    default_skill_groups,
    normalize_additional_groups,
    normalize_skill_groups,
)

_TEXT_VALUE_KEYS = (
    "text",
    "summary",
    "description",
    "value",
    "content",
    "title",
    "subtitle",
    "name",
    "label",
)
_BULLET_PREFIX_RE = re.compile(r"^\s*(?:[-*•]+|\d+[.)])\s*")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_SOCIAL_LINK_PREFIXES = {
    "linkedin": "https://linkedin.com/in/",
    "github": "https://github.com/",
}


def _extract_text_fragments(
    value: Any, depth: int = 0, max_depth: int = 10
) -> list[str]:
    """Extract text-like content from nested list/dict values."""
    if depth >= max_depth or value is None:
        return []

    if isinstance(value, str):
        stripped = value.strip()
        return [stripped] if stripped else []

    if isinstance(value, (int, float)):
        return [str(value)]

    if isinstance(value, list):
        fragments: list[str] = []
        for item in value:
            fragments.extend(_extract_text_fragments(item, depth + 1, max_depth))
        return fragments

    if isinstance(value, dict):
        fragments: list[str] = []

        for key in _TEXT_VALUE_KEYS:
            if key in value:
                fragments.extend(
                    _extract_text_fragments(value.get(key), depth + 1, max_depth)
                )

        if fragments:
            return fragments

        for nested in value.values():
            fragments.extend(_extract_text_fragments(nested, depth + 1, max_depth))
        return fragments

    return []


def _coerce_text(value: Any, joiner: str = " ") -> str:
    """Coerce nested values into a single text string."""
    return joiner.join(_extract_text_fragments(value)).strip()


def _coerce_optional_text(value: Any) -> str | None:
    """Coerce nested values into optional text."""
    if value is None:
        return None
    text = _coerce_text(value)
    return text or None


def _split_description_lines(value: str) -> list[str]:
    """Split a description block into clean bullet lines."""
    items: list[str] = []
    for raw_line in re.split(r"\r?\n+", value):
        line = _BULLET_PREFIX_RE.sub("", raw_line.strip())
        if line:
            items.append(line)
    return items


def _coerce_string_list(value: Any) -> list[str]:
    """Coerce nested/string values into a list of strings."""
    if value is None:
        return []

    if isinstance(value, str):
        return _split_description_lines(value)

    if isinstance(value, list):
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                items.extend(_split_description_lines(entry))
                continue

            coerced = _coerce_text(entry)
            if coerced:
                items.append(coerced)
        return items

    coerced = _coerce_text(value)
    return [coerced] if coerced else []


def _ensure_absolute_url(value: Any) -> str | None:
    text = _coerce_optional_text(value)
    if not text:
        return None
    if text.startswith(("http://", "https://")):
        return text
    return f"https://{text}"


def _social_url(network: str | None, username: Any) -> str | None:
    cleaned_network = _coerce_optional_text(network)
    cleaned_username = _coerce_optional_text(username)
    if not cleaned_network or not cleaned_username:
        return None
    if cleaned_username.startswith(("http://", "https://")):
        return cleaned_username
    if "/" in cleaned_username or "." in cleaned_username:
        return _ensure_absolute_url(cleaned_username)
    prefix = _SOCIAL_LINK_PREFIXES.get(_NON_ALNUM_RE.sub("", cleaned_network.casefold()))
    if prefix:
        return f"{prefix}{cleaned_username.lstrip('@')}"
    return None


def _build_profile_links(data: dict[str, Any]) -> list[dict[str, Any]]:
    entries: list[dict[str, Any]] = []
    seen_urls: set[str] = set()
    has_explicit_profile_links = isinstance(data.get("profileLinks"), list) or isinstance(
        data.get("profile_links"), list
    )

    def append(label: Any, url: Any, icon: Any = None) -> None:
        cleaned_label = _coerce_optional_text(label)
        cleaned_url = _ensure_absolute_url(url)
        cleaned_icon = _coerce_optional_text(icon)
        if not cleaned_label or not cleaned_url:
            return

        url_key = cleaned_url.casefold()
        if url_key in seen_urls:
            return

        seen_urls.add(url_key)
        row: dict[str, Any] = {"label": cleaned_label, "url": cleaned_url}
        if cleaned_icon:
            row["fontawesome_icon"] = cleaned_icon
            row["fontAwesomeIcon"] = cleaned_icon
        entries.append(row)

    for item in data.get("profileLinks") or data.get("profile_links") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("label") or item.get("placeholder"),
            item.get("url"),
            item.get("fontawesome_icon") or item.get("fontAwesomeIcon"),
        )

    if has_explicit_profile_links:
        return entries

    for item in data.get("customConnections") or data.get("custom_connections") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("label") or item.get("placeholder"),
            item.get("url"),
            item.get("fontawesome_icon") or item.get("fontAwesomeIcon"),
        )

    append("Website", data.get("website"), "link")
    append("LinkedIn", _social_url("LinkedIn", data.get("linkedin")), "linkedin-in")
    append("GitHub", _social_url("GitHub", data.get("github")), "github")

    for item in data.get("socialNetworks") or data.get("social_networks") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("network"),
            _social_url(item.get("network"), item.get("username")),
        )

    return entries


def _legacy_profile_fields_from_links(links: list[dict[str, Any]]) -> dict[str, Any]:
    website = ""
    linkedin = ""
    github = ""
    custom_connections: list[dict[str, Any]] = []

    for item in links:
        if not isinstance(item, dict):
            continue

        label = _coerce_optional_text(item.get("label") or item.get("placeholder"))
        url = _ensure_absolute_url(item.get("url"))
        icon = _coerce_optional_text(item.get("fontawesome_icon") or item.get("fontAwesomeIcon"))
        if not label or not url:
            continue

        normalized_label = _NON_ALNUM_RE.sub("", label.casefold())
        if normalized_label == "website" and not website:
            website = url
            continue
        if normalized_label == "linkedin" and not linkedin:
            linkedin = url
            continue
        if normalized_label == "github" and not github:
            github = url
            continue

        custom_connections.append(
            {
                "placeholder": label,
                "url": url,
                "fontawesome_icon": icon,
                "fontAwesomeIcon": icon,
            }
        )

    return {
        "website": website,
        "linkedin": linkedin,
        "github": github,
        "socialNetworks": [],
        "customConnections": custom_connections,
    }


def _compose_date_range(start_date: str | None, end_date: str | None) -> str:
    if start_date and end_date:
        return f"{start_date} - {end_date}"
    if start_date:
        return f"{start_date} - present"
    return end_date or ""


# Section Type Enum for dynamic sections
class SectionType(str, Enum):
    """Types of resume sections."""

    PERSONAL_INFO = "personalInfo"  # Special: always first, not reorderable
    TEXT = "text"  # Single text block (like summary)
    ITEM_LIST = "itemList"  # Array of items with fields (like experience)
    STRING_LIST = "stringList"  # Array of strings (like skills)


# Resume Data Models (matching frontend types in resume-component.tsx)
class PersonalInfo(BaseModel):
    """Personal information section."""

    name: str = ""
    headline: str = ""
    title: str = ""
    email: str = ""
    phone: str = ""
    location: str = ""
    website: str | None = None
    linkedin: str | None = None
    github: str | None = None
    photo: str | None = None
    photoUrl: str | None = None
    profileLinks: list[dict[str, Any]] = Field(default_factory=list)
    socialNetworks: list[dict[str, str]] = Field(default_factory=list)
    customConnections: list[dict[str, Any]] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_personal_info(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        data = copy.deepcopy(value)
        headline = _coerce_text(data.get("headline") or data.get("title"))
        data["headline"] = headline
        data["title"] = _coerce_text(data.get("title") or headline)

        photo = _coerce_optional_text(data.get("photo") or data.get("photoUrl"))
        data["photo"] = photo
        data["photoUrl"] = photo

        if "social_networks" in data and "socialNetworks" not in data:
            data["socialNetworks"] = data.get("social_networks")
        if "custom_connections" in data and "customConnections" not in data:
            data["customConnections"] = data.get("custom_connections")
        if "profile_links" in data and "profileLinks" not in data:
            data["profileLinks"] = data.get("profile_links")

        data["profileLinks"] = _build_profile_links(data)
        if "profileLinks" in data or "profile_links" in data:
            data.update(_legacy_profile_fields_from_links(data["profileLinks"]))

        return data


class Experience(BaseModel):
    """Work experience entry."""

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
    highlights: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_experience(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        data = copy.deepcopy(value)

        position = _coerce_text(data.get("position") or data.get("title"))
        data["position"] = position
        data["title"] = _coerce_text(data.get("title") or position)

        start_date = _coerce_optional_text(data.get("start_date") or data.get("startDate"))
        end_date = _coerce_optional_text(data.get("end_date") or data.get("endDate"))
        data["start_date"] = start_date
        data["end_date"] = end_date

        date = _coerce_text(data.get("date") or data.get("years") or _compose_date_range(start_date, end_date))
        data["date"] = date
        data["years"] = _coerce_text(data.get("years") or date)

        summary = _coerce_optional_text(data.get("summary"))
        data["summary"] = summary

        legacy_description = data.get("description")
        legacy_highlights = data.get("highlights")
        if legacy_highlights is None:
            highlights = _coerce_string_list(legacy_description)
        else:
            highlights = _coerce_string_list(legacy_highlights)
            if legacy_description is None:
                legacy_description = highlights

        legacy_description_list = _coerce_string_list(legacy_description)
        if summary and legacy_description_list and legacy_description_list[0] == summary:
            highlights = legacy_description_list[1:]
        elif legacy_highlights is None and legacy_description_list:
            highlights = legacy_description_list

        data["highlights"] = highlights
        data["description"] = [summary, *highlights] if summary else highlights
        return data

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)

    @field_validator("highlights", mode="before")
    @classmethod
    def _normalize_highlights(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)


class Education(BaseModel):
    """Education entry."""

    id: int = 0
    institution: str = ""
    area: str = ""
    degree: str | None = None
    location: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    date: str = ""
    years: str = ""
    summary: str | None = None
    description: str | None = None
    highlights: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_education(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        data = copy.deepcopy(value)

        data["area"] = _coerce_text(data.get("area") or data.get("major"))
        data["degree"] = _coerce_optional_text(data.get("degree"))
        data["location"] = _coerce_optional_text(data.get("location"))

        start_date = _coerce_optional_text(data.get("start_date") or data.get("startDate"))
        end_date = _coerce_optional_text(data.get("end_date") or data.get("endDate"))
        data["start_date"] = start_date
        data["end_date"] = end_date

        date = _coerce_text(data.get("date") or data.get("years") or _compose_date_range(start_date, end_date))
        data["date"] = date
        data["years"] = _coerce_text(data.get("years") or date)

        description = data.get("description")
        summary = _coerce_optional_text(data.get("summary"))
        highlights = _coerce_string_list(data.get("highlights"))

        if summary is None and description is not None:
            description_lines = _split_description_lines(_coerce_text(description, joiner="\n"))
            if description_lines:
                summary = description_lines[0]
                if not highlights and len(description_lines) > 1:
                    highlights = description_lines[1:]

        data["summary"] = summary
        data["highlights"] = highlights
        description_lines = [line for line in [summary, *highlights] if line]
        data["description"] = "\n".join(description_lines) if description_lines else None
        return data

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("highlights", mode="before")
    @classmethod
    def _normalize_highlights(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)


class Project(BaseModel):
    """Personal project entry."""

    id: int = 0
    name: str = ""
    summary: str | None = None
    role: str = ""
    date: str = ""
    years: str = ""
    github: str | None = None
    website: str | None = None
    description: list[str] = Field(default_factory=list)
    highlights: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _normalize_project(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        data = copy.deepcopy(value)

        # Accept 'tech_stacks' from the LLM-facing tailoring layer as alias for 'summary'
        if "tech_stacks" in data and "summary" not in data:
            data["summary"] = data.pop("tech_stacks")
        elif "tech_stacks" in data:
            data.pop("tech_stacks")

        summary = _coerce_optional_text(data.get("summary") or data.get("role"))
        data["summary"] = summary
        data["role"] = _coerce_text(data.get("role") or summary)

        date = _coerce_text(data.get("date") or data.get("years"))
        data["date"] = date
        data["years"] = _coerce_text(data.get("years") or date)

        highlights = _coerce_string_list(data.get("highlights", data.get("description")))
        data["highlights"] = highlights
        data["description"] = highlights
        return data

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)

    @field_validator("highlights", mode="before")
    @classmethod
    def _normalize_highlights(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)


class SkillGroup(BaseModel):
    """Flexible label/value group inside the skills section."""

    label: str = ""
    values: list[str] = Field(default_factory=list)

    @field_validator("label", mode="before")
    @classmethod
    def _normalize_label(cls, value: Any) -> str:
        return _coerce_text(value)

    @field_validator("values", mode="before")
    @classmethod
    def _normalize_values(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)

    @property
    def items(self) -> list[str]:
        return self.values


class SkillsSection(BaseModel):
    """Grouped skills section."""

    groups: list[SkillGroup] = Field(default_factory=default_skill_groups)

    @model_validator(mode="before")
    @classmethod
    def _normalize_groups(cls, value: Any) -> dict[str, Any]:
        return normalize_skill_groups(value)


AdditionalGroup = SkillGroup
AdditionalInfo = SkillsSection


# Section Metadata Models for dynamic section management
class SectionMeta(BaseModel):
    """Metadata for a resume section."""

    id: str  # Unique identifier (e.g., "summary", "custom_1")
    key: str  # Data key (matches ResumeData field or customSections key)
    displayName: str  # User-visible name
    sectionType: SectionType  # Type of section
    isDefault: bool = True  # True for built-in sections
    isVisible: bool = True  # Whether to show in resume
    order: int = 0  # Display order (0 = first after personalInfo)


class CustomSectionItem(BaseModel):
    """Generic item for custom item-based sections."""

    id: int = 0
    title: str = ""  # Primary title
    subtitle: str | None = None  # Secondary info (company, institution, etc.)
    location: str | None = None
    years: str = ""
    description: list[str] = Field(default_factory=list)

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_string_list(value)


class CustomSection(BaseModel):
    """Custom section data container."""

    sectionType: SectionType
    items: list[CustomSectionItem] | None = None  # For ITEM_LIST
    strings: list[str] | None = None  # For STRING_LIST
    text: str | None = None  # For TEXT

    @field_validator("items", mode="before")
    @classmethod
    def _normalize_items(cls, value: Any) -> Any:
        if value is None:
            return None
        if not isinstance(value, list):
            return value
        result = []
        for i, item in enumerate(value):
            if isinstance(item, str):
                result.append({"id": i + 1, "title": item})
            else:
                result.append(item)
        return result

    @field_validator("strings", mode="before")
    @classmethod
    def _normalize_strings(cls, value: Any) -> list[str] | None:
        if value is None:
            return None
        return _coerce_string_list(value)

    @field_validator("text", mode="before")
    @classmethod
    def _normalize_text(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)


# Default section metadata for backward compatibility
DEFAULT_SECTION_META: list[dict[str, Any]] = [
    {
        "id": "personalInfo",
        "key": "personalInfo",
        "displayName": "Personal Info",
        "sectionType": SectionType.PERSONAL_INFO,
        "isDefault": True,
        "isVisible": True,
        "order": 0,
    },
    {
        "id": "summary",
        "key": "summary",
        "displayName": "Summary",
        "sectionType": SectionType.TEXT,
        "isDefault": True,
        "isVisible": True,
        "order": 1,
    },
    {
        "id": "workExperience",
        "key": "workExperience",
        "displayName": "Experience",
        "sectionType": SectionType.ITEM_LIST,
        "isDefault": True,
        "isVisible": True,
        "order": 2,
    },
    {
        "id": "education",
        "key": "education",
        "displayName": "Education",
        "sectionType": SectionType.ITEM_LIST,
        "isDefault": True,
        "isVisible": True,
        "order": 3,
    },
    {
        "id": "personalProjects",
        "key": "personalProjects",
        "displayName": "Projects",
        "sectionType": SectionType.ITEM_LIST,
        "isDefault": True,
        "isVisible": True,
        "order": 4,
    },
    {
        "id": "skills",
        "key": "skills",
        "displayName": "Skills",
        "sectionType": SectionType.STRING_LIST,
        "isDefault": True,
        "isVisible": True,
        "order": 5,
    },
]


def normalize_resume_data(data: dict[str, Any]) -> dict[str, Any]:
    """Ensure resume data has section metadata (migration helper).

    This function is used for lazy migration of existing resumes
    that don't have sectionMeta or customSections fields.
    """
    if "skills" not in data and "additional" in data:
        data["skills"] = copy.deepcopy(data.get("additional"))
    if "skills" in data:
        data.pop("additional", None)

    if not data.get("sectionMeta"):
        # Use deepcopy to avoid shared mutable reference bug
        # Without this, all resumes would share the same list reference
        data["sectionMeta"] = copy.deepcopy(DEFAULT_SECTION_META)
    else:
        migrated_meta: list[dict[str, Any]] = []
        for raw_meta in data.get("sectionMeta") or []:
            if not isinstance(raw_meta, dict):
                migrated_meta.append(raw_meta)
                continue
            meta = copy.deepcopy(raw_meta)
            if meta.get("id") == "additional":
                meta["id"] = "skills"
            if meta.get("key") == "additional":
                meta["key"] = "skills"
            if meta.get("displayName") == "Skills & Awards":
                meta["displayName"] = "Skills"
            migrated_meta.append(meta)
        data["sectionMeta"] = migrated_meta
    if "customSections" not in data:
        data["customSections"] = {}
    return data


class ResumeData(BaseModel):
    """Complete structured resume data."""

    personalInfo: PersonalInfo = Field(default_factory=PersonalInfo)
    summary: str = ""
    workExperience: list[Experience] = Field(default_factory=list)
    education: list[Education] = Field(default_factory=list)
    personalProjects: list[Project] = Field(default_factory=list)
    skills: SkillsSection = Field(default_factory=SkillsSection)

    sectionMeta: list[SectionMeta] = Field(default_factory=list)
    customSections: dict[str, CustomSection] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def _normalize_legacy_payload(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value
        return normalize_resume_data(copy.deepcopy(value))

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value: Any) -> str:
        return _coerce_text(value)

    @computed_field
    @property
    def additional(self) -> dict[str, Any]:
        return normalize_additional_groups({"groups": [group.model_dump() for group in self.skills.groups]})


# API Response Models
class ResumeUploadResponse(BaseModel):
    """Response for resume upload."""

    message: str
    request_id: str
    resume_id: str
    processing_status: Literal["pending", "processing", "ready", "failed"] = "pending"
    is_master: bool = False


class RawResume(BaseModel):
    """Raw resume data from database."""

    id: int | None = None
    content: str
    content_type: str = "md"
    created_at: str
    processing_status: str = "pending"  # pending, processing, ready, failed


class ResumeFetchData(BaseModel):
    """Data payload for resume fetch response."""

    resume_id: str
    raw_resume: RawResume
    processed_resume: ResumeData | None = None
    cover_letter: str | None = None
    outreach_message: str | None = None
    parent_id: str | None = None  # For determining if resume is tailored
    title: str | None = None
    application_pack_id: str | None = None
    theme_settings: RenderThemeSettings | None = None


class ResumeFetchResponse(BaseModel):
    """Response for resume fetch."""

    request_id: str
    data: ResumeFetchData


class ResumeSummary(BaseModel):
    """Summary details for listing resumes."""

    resume_id: str
    filename: str | None = None
    is_master: bool = False
    parent_id: str | None = None
    processing_status: str = "pending"
    created_at: str
    updated_at: str
    title: str | None = None
    target_company: str | None = None
    target_role: str | None = None
    target_location: str | None = None


class ResumeListResponse(BaseModel):
    """Response for resume list."""

    request_id: str
    data: list[ResumeSummary]


class ApplicationPackSummary(BaseModel):
    pack_id: str
    base_resume_id: str
    job_id: str
    tailored_resume_id: str | None = None
    generation_run_id: str | None = None
    status: str
    company: str | None = None
    role: str | None = None
    location: str | None = None
    theme_settings: RenderThemeSettings | None = None
    created_at: str
    updated_at: str
    confirmed_at: str | None = None


class ApplicationPackListResponse(BaseModel):
    request_id: str
    data: list[ApplicationPackSummary]


# Job Description Models
class JobUploadRequest(BaseModel):
    """Request to upload job descriptions."""

    job_descriptions: list[str]
    resume_id: str | None = None


class JobUploadResponse(BaseModel):
    """Response for job upload."""

    message: str
    job_id: list[str]
    request: dict[str, Any]


# Improvement Models
class ImproveResumeRequest(BaseModel):
    """Request to improve/tailor a resume."""

    resume_id: str
    job_id: str
    prompt_id: str | None = None
    include_cover_letter: bool | None = None
    include_outreach_message: bool | None = None
    theme_settings: RenderThemeSettings | None = None


class ImprovementSuggestion(BaseModel):
    """Single improvement suggestion."""

    suggestion: str
    lineNumber: int | None = None


class ResumeFieldDiff(BaseModel):
    """Single field change record."""

    field_path: str  # Example: "workExperience[0].description[2]"
    field_type: Literal[
        "additional_item",
        "additional_group",
        "description",
        "summary",
        "experience",
        "experience_title",
        "education",
        "project",
        "project_title",
    ]
    change_type: Literal["added", "removed", "modified"]
    original_value: str | None = None
    new_value: str | None = None
    confidence: Literal["low", "medium", "high"] = "medium"


class ResumeDiffSummary(BaseModel):
    """Change summary stats."""

    total_changes: int
    additional_items_added: int
    additional_items_removed: int
    additional_groups_modified: int
    descriptions_modified: int
    high_risk_changes: int  # High-risk additions


class TailoringStageBreakdown(BaseModel):
    """Stage-by-stage accounting for tailoring and safeguard edits."""

    llm_declared_changes: int = 0
    llm_computed_changes: int = 0
    llm_applied_changes: int = 0
    llm_rejected_changes: int = 0
    cleanup_only_changes: int = 0
    numeric_claim_changes: int = 0
    numeric_claim_rejections: int = 0
    skill_changes: int = 0
    final_render_changes: int = 0
    location_source: Literal["jd", "master", "none"] = "none"
    location_value: str | None = None


class ArtifactSummary(BaseModel):
    """Stored artifact returned to the frontend."""

    artifact_id: str
    kind: str
    mime_type: str
    file_name: str
    url: str | None = None
    metadata: dict[str, Any] | None = None


class RenderThemeProfileSettings(BaseModel):
    """Sparse per-theme design overrides stored for the builder."""

    page_size: Literal["A4", "LETTER"] | None = None
    density_profile: Literal["compact", "balanced", "spacious"] | None = None
    accent_color: Literal["blue", "green", "orange", "red"] | None = None
    show_contact_icons: bool | None = None
    margins_mm: dict[str, int] = Field(default_factory=dict)
    design: dict[str, Any] = Field(default_factory=dict)


class RenderThemeSettings(BaseModel):
    """RenderCV configuration exposed by the API.

    The legacy top-level fields remain so existing clients continue to work.
    Richer hosted-UI controls are stored in the nested `design`, `locale`,
    and `settings` dictionaries.
    """

    theme_id: Literal[
        "classic",
        "moderncv",
        "sb2nov",
        "engineeringresumes",
        "engineeringclassic",
        "harvard",
        "opal",
        "ember",
        "ink",
    ] = "classic"
    page_size: Literal["A4", "LETTER"] = "A4"
    density_profile: Literal["compact", "balanced", "spacious"] = "balanced"
    bold_keywords: bool = False
    accent_color: Literal["blue", "green", "orange", "red"] = "blue"
    show_contact_icons: bool = False
    margins_mm: dict[str, int] = Field(
        default_factory=lambda: {"top": 10, "bottom": 10, "left": 10, "right": 10}
    )
    design: dict[str, Any] = Field(default_factory=dict)
    theme_profiles: dict[str, RenderThemeProfileSettings] = Field(default_factory=dict)
    locale: dict[str, Any] = Field(default_factory=dict)
    settings: dict[str, Any] = Field(default_factory=dict)


class ResumeUpdateRequest(BaseModel):
    """Request to update a resume and its RenderCV configuration."""

    processed_resume: ResumeData
    theme_settings: RenderThemeSettings | None = None


class RenderResumeRequest(BaseModel):
    """Request to render preview/PDF with an explicit RenderCV config."""

    theme_settings: RenderThemeSettings | None = None


class RawYamlSections(BaseModel):
    """Editable RenderCV-style YAML slices used by the raw editor."""

    cv: str
    design: str
    locale: str
    settings: str


class ResumeDraftRequest(BaseModel):
    """Draft payload for previewing, normalizing, or persisting unsaved changes."""

    resume_id: str | None = None
    processed_resume: ResumeData | None = None
    theme_settings: RenderThemeSettings | None = None
    yaml_sections: RawYamlSections | None = None


class ResumeDraftNormalizedResponse(BaseModel):
    """Normalized structured + YAML draft response."""

    request_id: str
    data: ResumeFetchData
    yaml_sections: RawYamlSections


class RenderThemeOption(BaseModel):
    """Theme option returned from the themes endpoint."""

    id: str
    label: str
    description: str


class RefinementStats(BaseModel):
    """Statistics from the multi-pass refinement process."""

    passes_completed: int = Field(default=0, ge=0, description="Number of passes run")
    keywords_injected: int = Field(
        default=0, ge=0, description="Number of keywords injected"
    )
    ai_phrases_removed: list[str] = Field(
        default_factory=list, description="List of AI phrases that were removed"
    )
    alignment_violations_fixed: int = Field(
        default=0, ge=0, description="Number of alignment violations corrected"
    )
    initial_match_percentage: float = Field(
        default=0.0,
        ge=0.0,
        le=100.0,
        description="Keyword match before refinement",
    )
    final_match_percentage: float = Field(
        default=0.0, ge=0.0, le=100.0, description="Keyword match after refinement"
    )


class ImproveResumeData(BaseModel):
    """Data payload for improve response."""

    request_id: str
    resume_id: str | None = Field(
        default=None,
        description="Null for preview responses; populated when the tailored resume is persisted.",
    )
    application_pack_id: str | None = None
    generation_run_id: str | None = None
    job_id: str
    resume_preview: ResumeData
    improvements: list[ImprovementSuggestion]
    markdownOriginal: str | None = None
    markdownImproved: str | None = None
    cover_letter: str | None = None
    outreach_message: str | None = None
    artifacts: list[ArtifactSummary] = Field(default_factory=list)
    theme_settings: RenderThemeSettings | None = None

    # Diff metadata
    diff_summary: ResumeDiffSummary | None = None
    detailed_changes: list[ResumeFieldDiff] | None = None
    change_manifest: list[ResumeChange] | None = None
    change_breakdown: TailoringStageBreakdown | None = None

    # Refinement metadata (multi-pass refinement stats)
    refinement_stats: "RefinementStats | None" = None

    # Bold keywords returned by the LLM for PDF rendering
    bold_keywords: list[str] = Field(default_factory=list)

    # Warning and status fields for transparency
    warnings: list[str] = Field(default_factory=list)
    refinement_attempted: bool = False
    refinement_successful: bool = False


class ImproveResumeResponse(BaseModel):
    """Response for resume improvement."""

    request_id: str
    data: ImproveResumeData


class ImproveResumeConfirmRequest(BaseModel):
    """Request to confirm and save a tailored resume."""

    resume_id: str
    job_id: str
    improved_data: ResumeData
    improvements: list[ImprovementSuggestion]
    application_pack_id: str | None = None
    generation_run_id: str | None = None
    include_cover_letter: bool | None = None
    include_outreach_message: bool | None = None
    theme_settings: RenderThemeSettings | None = None


# Config Models
class LLMConfigRequest(BaseModel):
    """Request to update LLM configuration."""

    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    api_base: str | None = None


class LLMConfigResponse(BaseModel):
    """Response for LLM configuration."""

    provider: str
    model: str
    api_key: str  # Masked
    api_base: str | None = None


class FeatureConfigRequest(BaseModel):
    """Request to update feature settings."""

    enable_cover_letter: bool | None = None
    enable_outreach_message: bool | None = None


class FeatureConfigResponse(BaseModel):
    """Response for feature settings."""

    enable_cover_letter: bool = False
    enable_outreach_message: bool = False


class GenerationDefaultsRequest(BaseModel):
    """Request to update the last-used tailoring defaults."""

    include_cover_letter: bool | None = None
    include_outreach_message: bool | None = None
    prompt_id: str | None = None


class GenerationDefaultsResponse(BaseModel):
    """Response for persisted tailoring defaults."""

    include_cover_letter: bool = False
    include_outreach_message: bool = False
    prompt_id: str = DEFAULT_IMPROVE_PROMPT_ID


class LanguageConfigRequest(BaseModel):
    """Request to update language settings."""

    ui_language: str | None = None  # en, es, zh, ja - for interface
    content_language: str | None = None  # en, es, zh, ja - for generated content


class LanguageConfigResponse(BaseModel):
    """Response for language settings."""

    ui_language: str = "en"  # Interface language
    content_language: str = "en"  # Generated content language
    supported_languages: list[str] = ["en", "es", "zh", "ja"]


class PromptOption(BaseModel):
    """Prompt option for resume tailoring."""

    id: str
    label: str
    description: str


class PromptConfigRequest(BaseModel):
    """Request to update prompt settings."""

    default_prompt_id: str | None = None


class PromptConfigResponse(BaseModel):
    """Response for prompt settings."""

    default_prompt_id: str
    prompt_options: list[PromptOption]


# API Key Management Models
class ApiKeyProviderStatus(BaseModel):
    """Status of a single API key provider."""

    provider: str  # openai, anthropic, google, etc.
    configured: bool
    masked_key: str | None = None  # Shows last 4 chars if configured


class ApiKeyStatusResponse(BaseModel):
    """Response for API key status check."""

    providers: list[ApiKeyProviderStatus]


class ApiKeysUpdateRequest(BaseModel):
    """Request to update API keys."""

    openai: str | None = None
    anthropic: str | None = None
    google: str | None = None
    openrouter: str | None = None
    deepseek: str | None = None


class ApiKeysUpdateResponse(BaseModel):
    """Response after updating API keys."""

    message: str
    updated_providers: list[str]


# Update Cover Letter/Outreach Models
class UpdateCoverLetterRequest(BaseModel):
    """Request to update cover letter content."""

    content: str


class UpdateOutreachMessageRequest(BaseModel):
    """Request to update outreach message content."""

    content: str


class UpdateTitleRequest(BaseModel):
    """Request to update resume title."""

    title: str


class ResetDatabaseRequest(BaseModel):
    """Request to reset database with confirmation."""

    confirm: str | None = None


class GenerateContentResponse(BaseModel):
    """Response for on-demand content generation."""

    content: str
    message: str


# Health/Status Models
class HealthResponse(BaseModel):
    """Health check response."""

    status: str
    llm: dict[str, Any]


class StatusResponse(BaseModel):
    """Application status response."""

    status: str
    llm_configured: bool
    llm_healthy: bool
    llm_health_status: str = "unchecked"
    llm_health_checked: bool = False
    llm_health_checked_at: str | None = None
    has_master_resume: bool
    database_stats: dict[str, Any]


class LLMCallRecord(BaseModel):
    """Persisted trace for a single LLM attempt."""

    llm_call_id: str
    call_group_id: str
    trace_id: str | None = None
    request_scope: str | None = None
    operation: str
    provider: str
    model: str
    model_name: str
    response_model: str | None = None
    request_kind: str
    success: bool
    attempt: int
    max_tokens: int | None = None
    temperature: float | None = None
    reasoning_effort: str | None = None
    json_mode: bool
    latency_ms: int | None = None
    finish_reason: str | None = None
    prompt_chars: int
    prompt_tokens_est: int | None = None
    response_chars: int | None = None
    response_tokens_est: int | None = None
    usage_input_tokens: int | None = None
    usage_output_tokens: int | None = None
    usage_total_tokens: int | None = None
    estimated_input_cost_usd: float | None = None
    estimated_output_cost_usd: float | None = None
    estimated_total_cost_usd: float | None = None
    error_type: str | None = None
    error_message: str | None = None
    prompt_preview: str | None = None
    response_preview: str | None = None
    request_context: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    completed_at: str | None = None


class LLMOperationSummary(BaseModel):
    """Aggregate metrics for one LLM operation."""

    operation: str
    calls: int
    successes: int
    failures: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float


class LLMCallSummary(BaseModel):
    """Aggregate LLM metrics for a trace or request scope."""

    trace_id: str | None = None
    request_scope: str | None = None
    total_calls: int
    successful_calls: int
    failed_calls: int
    input_tokens: int
    output_tokens: int
    total_tokens: int
    estimated_cost_usd: float
    usage_backed_calls: int
    estimated_calls: int
    operations: list[LLMOperationSummary] = Field(default_factory=list)


class LLMCallListResponse(BaseModel):
    """List response for LLM call traces."""

    request_id: str
    data: list[LLMCallRecord]


class LLMCallSummaryResponse(BaseModel):
    """Summary response for LLM trace metrics."""

    request_id: str
    data: LLMCallSummary


# Diff-Based Improvement Models


class ResumeChange(BaseModel):
    """A single targeted change the LLM wants to make to the resume."""

    path: str = Field(
        description="Dot+bracket path, e.g. 'workExperience[0].description[1]'"
    )
    action: Literal["replace", "append", "remove", "reorder", "regroup"]
    original: str | None = Field(
        default=None, description="Current text at path — for verification"
    )
    value: str | list[str] | list[dict[str, Any]] = Field(description="New content")
    reason: str = Field(default="", description="Why this change helps match the JD")

    @model_validator(mode="before")
    @classmethod
    def _normalise_op_alias(cls, data: Any) -> Any:
        """Accept lean v3 prompt field aliases.

        - 'op' → 'action'  (v3 system prompt uses 'op')
        - 'after' / 'new' → 'value'  (LLM sometimes returns 'after' for replace ops)
        - list-valued 'original' → coerce to JSON string (skills group changes)
        """
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if "action" not in data and "op" in data:
            data["action"] = data.pop("op")
        for alt_key in ("after", "new", "tailored", "updated", "text", "content", "new_value", "new_text"):
            if "value" not in data and alt_key in data:
                data["value"] = data.pop(alt_key)
                break
        # Last resort: if still no value but there's an 'original', use empty string
        if "value" not in data and "action" in data:
            data["value"] = ""
        if "original" in data and isinstance(data["original"], (list, dict)):
            import json as _json
            data["original"] = _json.dumps(data["original"])
        # Wrap a single-dict value in a list so the union validator can accept it
        if "value" in data and isinstance(data["value"], dict):
            data["value"] = [data["value"]]
        return data


class ImproveDiffResult(BaseModel):
    """LLM output: a list of targeted resume changes."""

    changes: list[ResumeChange] = Field(default_factory=list)
    strategy_notes: str = Field(default="")
