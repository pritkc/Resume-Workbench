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


def _coerce_skill_group_label(value: Any) -> str:
    """Stringify a skills group label without trimming.

    Leading/trailing spaces are meaningful while typing in the UI and must
    round-trip through the API. ``_coerce_text`` strips edges and must not be
    used here. Non-scalar payloads fall back to ``_coerce_text``.
    """
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, (int, float)):
        return str(value)
    return _coerce_text(value)


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


def _work_entry_tech_stack_text(data: dict[str, Any]) -> str | None:
    """Coalesce per-role tech stack from legacy and LLM-facing keys."""
    return _coerce_optional_text(
        data.get("summary")
        or data.get("techStack")
        or data.get("tech_stack")
        or data.get("tech_stacks")
    )


def _project_tech_stack_text(data: dict[str, Any]) -> str | None:
    """Coalesce per-project tech stack from legacy and LLM-facing keys."""
    return _coerce_optional_text(
        data.get("techStack")
        or data.get("tech_stack")
        or data.get("tech_stacks")
        or data.get("summary")
        or data.get("role")
    )


def _strip_leading_duplicate_stack_line(
    stack: str | None, highlights: list[str]
) -> list[str]:
    """Remove leading highlight rows that duplicate the tech-stack line (LLM/form noise)."""
    if not stack or not highlights:
        return highlights
    needle = stack.strip()
    if not needle:
        return highlights
    result = list(highlights)
    while result:
        head = _coerce_text(result[0]).strip()
        if not head or head != needle:
            break
        result.pop(0)
    return result


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


def _coerce_highlights_list(value: Any) -> list[str]:
    """Coerce highlights / bullet lists; keeps '' entries for in-progress editor rows."""
    if value is None:
        return []
    if isinstance(value, str):
        return _split_description_lines(value)
    if isinstance(value, list):
        out: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                out.append(entry)
            else:
                c = _coerce_text(entry)
                out.append(c or "")
        return out
    c = _coerce_text(value)
    return [c] if c else []


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

        summary = _work_entry_tech_stack_text(data)
        for legacy_key in ("techStack", "tech_stack", "tech_stacks"):
            data.pop(legacy_key, None)
        data["summary"] = summary

        legacy_description = data.get("description")
        legacy_highlights = data.get("highlights")
        if legacy_highlights is None:
            highlights = _coerce_string_list(legacy_description)
        else:
            highlights = _coerce_highlights_list(legacy_highlights)
            if legacy_description is None:
                legacy_description = highlights

        legacy_description_list = _coerce_string_list(legacy_description)
        if summary and legacy_description_list and legacy_description_list[0] == summary:
            highlights = legacy_description_list[1:]
        elif legacy_highlights is None and legacy_description_list:
            highlights = legacy_description_list

        highlights = _strip_leading_duplicate_stack_line(summary, highlights)

        data["highlights"] = highlights
        data["description"] = [summary, *highlights] if summary else list(highlights)
        return data

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        if isinstance(value, list):
            return _coerce_highlights_list(value)
        return _coerce_string_list(value)

    @field_validator("highlights", mode="before")
    @classmethod
    def _normalize_highlights(cls, value: Any) -> list[str]:
        return _coerce_highlights_list(value)

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
        highlights = _coerce_highlights_list(data.get("highlights"))

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
        return _coerce_highlights_list(value)


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

        stack = _project_tech_stack_text(data)
        for legacy_key in ("techStack", "tech_stack", "tech_stacks"):
            data.pop(legacy_key, None)

        data["summary"] = stack
        data["role"] = _coerce_text(data.get("role") or stack)

        date = _coerce_text(data.get("date") or data.get("years"))
        data["date"] = date
        data["years"] = _coerce_text(data.get("years") or date)

        raw_hl = data.get("highlights")
        raw_desc = data.get("description")
        if raw_hl is not None:
            highlights = _coerce_highlights_list(raw_hl)
        else:
            highlights = _coerce_highlights_list(raw_desc)
        highlights = _strip_leading_duplicate_stack_line(stack, highlights)
        data["highlights"] = highlights
        data["description"] = highlights
        return data

    @field_validator("description", mode="before")
    @classmethod
    def _normalize_description(cls, value: Any) -> list[str]:
        return _coerce_highlights_list(value)

    @field_validator("highlights", mode="before")
    @classmethod
    def _normalize_highlights(cls, value: Any) -> list[str]:
        return _coerce_highlights_list(value)

    @field_validator("summary", mode="before")
    @classmethod
    def _normalize_summary(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)


class SkillGroup(BaseModel):
    """Flexible label/value group inside the skills section."""

    id: str = ""
    label: str = ""
    values: list[str] = Field(default_factory=list)

    @field_validator("label", mode="before")
    @classmethod
    def _normalize_label(cls, value: Any) -> str:
        return _coerce_skill_group_label(value)

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
    is_active: bool = False


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
    resume_code: str | None = None
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
    resume_code: str | None = None
    filename: str | None = None
    is_active: bool = False
    is_pinned: bool = False
    pinned_at: str | None = None
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
    active_resume_id: str | None = None


class ResumePinRequest(BaseModel):
    pinned: bool


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


class ApplicationQuestionInput(BaseModel):
    question_id: str
    question: str

    @field_validator("question_id", mode="before")
    @classmethod
    def _normalize_question_id(cls, value: Any) -> str:
        text = _coerce_text(value)
        if not text:
            raise ValueError("question_id is required")
        return text[:64]

    @field_validator("question", mode="before")
    @classmethod
    def _normalize_question(cls, value: Any) -> str:
        text = " ".join(_coerce_text(value).split())
        if not text:
            raise ValueError("question is required")
        if len(text) > 500:
            raise ValueError("question must be 500 characters or fewer")
        return text


class ApplicationQuestionAnswer(BaseModel):
    question_id: str
    question: str
    answer: str
    confidence: Literal["high", "medium", "low"] = "medium"
    warnings: list[str] = Field(default_factory=list)
    is_user_edited: bool = False

    @field_validator("question_id", mode="before")
    @classmethod
    def _normalize_answer_question_id(cls, value: Any) -> str:
        text = _coerce_text(value)
        if not text:
            raise ValueError("question_id is required")
        return text[:64]

    @field_validator("question", mode="before")
    @classmethod
    def _normalize_answer_question(cls, value: Any) -> str:
        text = " ".join(_coerce_text(value).split())
        if not text:
            raise ValueError("question is required")
        if len(text) > 500:
            raise ValueError("question must be 500 characters or fewer")
        return text

    @field_validator("answer", mode="before")
    @classmethod
    def _normalize_answer_text(cls, value: Any) -> str:
        text = " ".join(_coerce_text(value).split())
        if not text:
            raise ValueError("answer is required")
        if len(text) > 2500:
            raise ValueError("answer must be 2500 characters or fewer")
        return text

    @field_validator("warnings", mode="before")
    @classmethod
    def _normalize_warnings(cls, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        warnings: list[str] = []
        for item in value:
            text = " ".join(_coerce_text(item).split())
            if text:
                warnings.append(text[:240])
        return warnings


class ApplicationQuestionsAnswerRequest(BaseModel):
    resume_id: str
    job_id: str
    application_pack_id: str | None = None
    generation_run_id: str | None = None
    questions: list[ApplicationQuestionInput]
    regenerate: bool = False
    target_question_ids: list[str] = Field(default_factory=list)

    @field_validator("resume_id", "job_id", mode="before")
    @classmethod
    def _normalize_entity_ids(cls, value: Any) -> str:
        text = _coerce_text(value)
        if not text:
            raise ValueError("field is required")
        return text

    @field_validator("application_pack_id", "generation_run_id", mode="before")
    @classmethod
    def _normalize_optional_ids(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @field_validator("target_question_ids", mode="before")
    @classmethod
    def _normalize_target_question_ids(cls, value: Any) -> list[str]:
        if value is None:
            return []
        if not isinstance(value, list):
            raise ValueError("target_question_ids must be a list")
        ids: list[str] = []
        seen: set[str] = set()
        for entry in value:
            question_id = _coerce_text(entry)[:64]
            if not question_id:
                continue
            if question_id in seen:
                continue
            seen.add(question_id)
            ids.append(question_id)
        return ids

    @model_validator(mode="after")
    def _validate_questions_constraints(self) -> "ApplicationQuestionsAnswerRequest":
        if not self.questions:
            raise ValueError("questions must contain at least one entry")
        if len(self.questions) > 15:
            raise ValueError("questions must contain no more than 15 entries")
        total_chars = sum(len(item.question) for item in self.questions)
        if total_chars > 5000:
            raise ValueError("questions exceed combined 5000 character limit")
        if self.target_question_ids and not self.regenerate:
            raise ValueError("target_question_ids requires regenerate=true")
        return self


class ApplicationQuestionsSaveRequest(BaseModel):
    resume_id: str
    job_id: str
    application_pack_id: str | None = None
    generation_run_id: str | None = None
    answers: list[ApplicationQuestionAnswer]

    @field_validator("resume_id", "job_id", mode="before")
    @classmethod
    def _normalize_save_ids(cls, value: Any) -> str:
        text = _coerce_text(value)
        if not text:
            raise ValueError("field is required")
        return text

    @field_validator("application_pack_id", "generation_run_id", mode="before")
    @classmethod
    def _normalize_save_optional_ids(cls, value: Any) -> str | None:
        return _coerce_optional_text(value)

    @model_validator(mode="after")
    def _validate_answers_constraints(self) -> "ApplicationQuestionsSaveRequest":
        if not self.answers:
            raise ValueError("answers must contain at least one entry")
        if len(self.answers) > 15:
            raise ValueError("answers must contain no more than 15 entries")
        total_question_chars = sum(len(item.question) for item in self.answers)
        total_answer_chars = sum(len(item.answer) for item in self.answers)
        if total_question_chars > 5000:
            raise ValueError("questions exceed combined 5000 character limit")
        if total_answer_chars > 25000:
            raise ValueError("answers exceed combined 25000 character limit")
        return self


class ApplicationQuestionsData(BaseModel):
    application_pack_id: str | None = None
    generation_run_id: str | None = None
    run_kind: str | None = None
    answers: list[ApplicationQuestionAnswer] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    generated_at: str | None = None
    is_stale: bool = False
    stale_reason: str | None = None


class ApplicationQuestionsResponse(BaseModel):
    request_id: str
    data: ApplicationQuestionsData


class ApplicationQuestionsFetchResponse(BaseModel):
    request_id: str
    data: ApplicationQuestionsData | None = None


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


class PipelineTimingEntry(BaseModel):
    """Timed event entry for preview/confirm pipelines."""

    host_event: str
    sub_event: str | None = None
    started_at: str
    ended_at: str
    duration_ms: int = Field(default=0, ge=0)
    metadata: dict[str, Any] | None = None


class PipelineTimingSummary(BaseModel):
    """End-to-end timing summary with host/sub-event granularity."""

    started_at: str
    ended_at: str
    total_duration_ms: int = Field(default=0, ge=0)
    entries: list[PipelineTimingEntry] = Field(default_factory=list)


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
    metadata: str = Field(
        default=(
            'metadata:\n  role: ""\n  company: ""\n  location: ""\n  bold_keywords: []\n'
        ),
        description="App-only YAML (non-RenderCV): role, company, location, bold_keywords.",
    )


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
    pipeline_timing: PipelineTimingSummary | None = None


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
class CLIProxyQuickProfile(BaseModel):
    """Saved quick-switch profile for CLIProxy route."""

    name: str
    provider_filter: Literal["codex", "claude", "gemini", "mixed"] = "mixed"
    model_alias: str
    base_url: str | None = None


class CLIProxyConfigRequest(BaseModel):
    """Request payload for CLIProxy route settings."""

    base_url: str | None = None
    client_api_key: str | None = None
    provider_filter: Literal["codex", "claude", "gemini", "mixed"] | None = None
    model_alias: str | None = None
    dashboard_url: str | None = None
    quick_profiles: list[CLIProxyQuickProfile] | None = None


class CLIProxyConfigResponse(BaseModel):
    """Response payload for CLIProxy route settings."""

    base_url: str | None = None
    client_api_key: str = ""
    provider_filter: Literal["codex", "claude", "gemini", "mixed"] = "mixed"
    model_alias: str = ""
    dashboard_url: str | None = None
    quick_profiles: list[CLIProxyQuickProfile] = Field(default_factory=list)


class LLMConfigRequest(BaseModel):
    """Request to update LLM configuration."""

    provider: str | None = None
    model: str | None = None
    api_key: str | None = None
    api_base: str | None = None
    ai_route: Literal["direct_api", "cliproxyapi"] | None = None
    cliproxy: CLIProxyConfigRequest | None = None


class LLMConfigResponse(BaseModel):
    """Response for LLM configuration."""

    provider: str
    model: str
    api_key: str  # Masked
    api_base: str | None = None
    ai_route: Literal["direct_api", "cliproxyapi"] = "direct_api"
    cliproxy: CLIProxyConfigResponse = Field(default_factory=CLIProxyConfigResponse)
    cliproxy_route_enabled: bool = False


class CLIProxyModelsRequest(BaseModel):
    """Request payload for discovering models from CLIProxyAPI."""

    base_url: str | None = None
    client_api_key: str | None = None
    provider_filter: Literal["codex", "claude", "gemini", "mixed"] | None = None


class CLIProxyModelOption(BaseModel):
    """Discovered model alias from CLIProxyAPI."""

    id: str
    provider: Literal["codex", "claude", "gemini", "mixed"] = "mixed"
    owned_by: str | None = None


class CLIProxyModelsResponse(BaseModel):
    """Discovered model list response from CLIProxyAPI."""

    models: list[CLIProxyModelOption] = Field(default_factory=list)
    provider_filter: Literal["codex", "claude", "gemini", "mixed"] = "mixed"


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
    supported_languages: list[str] = ["en"]


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


class PromptVariable(BaseModel):
    """Named placeholder in a prompt data template."""

    name: str
    description: str


class PromptManagerEntry(BaseModel):
    """Rich catalog row for Prompt Manager (per-step instructions, rules, model)."""

    step_name: str
    label: str
    version: str
    file_path: str = Field(description="Primary step module (assembly, overrides, and step-local copy).")
    system_prompt_files: list[str] = Field(
        default_factory=list,
        description="Repo paths where shipped system prompt text is authored (read in order).",
    )
    user_prompt_file: str = Field(
        default="",
        description="Repo path where the shipped user / data template is authored.",
    )
    pipeline: Literal["full", "lite", "standalone"]
    pipeline_order: int
    receives_from: list[str]
    feeds_into: list[str]
    instructions: str
    instructions_is_override: bool
    instructions_default: str
    rules: str
    rules_source: str | None = None
    rules_is_override: bool
    rules_default: str
    data_template: str
    variables: list[PromptVariable]
    model: str
    model_is_override: bool
    read_only: bool = True
    # Two-scroll / Composer (phase 3.7.6)
    composer_override_active: bool = False
    system_shipped: str = ""
    user_template_shipped: str = ""
    system_resolved: str = ""
    user_template_resolved: str = ""


class SharedRuleEntry(BaseModel):
    """Shared rule fragment used by multiple steps."""

    name: str
    label: str
    rules_source_file: str = Field(default="", description="Repo path of the shipped default rules module.")
    rules: str
    rules_is_override: bool
    rules_default: str
    used_by: list[str]


class PromptInstructionPutRequest(BaseModel):
    instructions: str


class PromptRulesPutRequest(BaseModel):
    rules: str


class PromptComposerPutRequest(BaseModel):
    system: str
    user: str


class PromptComposerResponse(BaseModel):
    step_name: str
    composer_override_active: bool
    system: str
    user: str
    system_shipped: str
    user_template_shipped: str


class SharedRulesPutRequest(BaseModel):
    rules: str


class PromptOverrideSuccess(BaseModel):
    success: bool
    step_name: str


class SharedRuleOverrideSuccess(BaseModel):
    success: bool
    rules_name: str
    affected_steps: list[str]


class CritiqueConfigResponse(BaseModel):
    enabled: bool


class CritiqueConfigRequest(BaseModel):
    enabled: bool


class ModelOverridesResponse(BaseModel):
    overrides: dict[str, str | None]


class ModelOverridesRequest(BaseModel):
    overrides: dict[str, str | None]


PromptCatalogPolicy = Literal["system", "user_editable_future", "user_choice", "runtime_injected"]


class PromptCatalogSection(BaseModel):
    """Hierarchical slice of a prompt for catalog UI (read-only; editing is future work)."""

    id: str
    label: str
    note: str | None = None
    policy: PromptCatalogPolicy | None = None
    content: str | None = None
    children: list[PromptCatalogSection] = Field(default_factory=list)


class PromptCatalogEntry(BaseModel):
    """Read-only catalog entry for an LLM prompt template."""

    id: str
    operation: str
    version: str | None = None
    read_only: bool = True
    system_prompt: str | None = None
    user_prompt: str | None = None
    notes: str | None = None
    sections: list[PromptCatalogSection] | None = None


class MasterResumePreviewResponse(BaseModel):
    """Serialized master resume as used for tailoring `$original_resume` (size-capped)."""

    serialized_original_resume: str = ""
    truncated: bool = False


class ResponseContractModePreview(BaseModel):
    """One mode's ``$response_contract`` JSON as passed to the model (size-capped)."""

    serialized: str = ""
    truncated: bool = False


class ResponseContractPreviewResponse(BaseModel):
    """Full vs lite response-contract JSON for the catalog (same master resume as tailoring)."""

    full: ResponseContractModePreview = Field(default_factory=ResponseContractModePreview)
    lite: ResponseContractModePreview = Field(default_factory=ResponseContractModePreview)


class PromptCatalogResponse(BaseModel):
    """Response containing all configured prompt templates used by LLM operations."""

    prompts: list[PromptCatalogEntry] = Field(default_factory=list)
    entries: list[PromptManagerEntry] = Field(default_factory=list)
    shared_rules: list[SharedRuleEntry] = Field(default_factory=list)


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


class GenerateAuxiliaryPackageResponse(BaseModel):
    """Response for merged cover-letter + outreach generation."""

    cover_letter: str
    outreach_message: str
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
    has_active_resume: bool
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
    latency_total_ms: int = 0
    latency_avg_ms: float = 0.0
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
    latency_total_ms: int = 0
    latency_avg_ms: float = 0.0
    llm_wall_clock_ms: int = 0
    first_call_at: str | None = None
    last_call_at: str | None = None
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


class GenerationRunTimingRecord(BaseModel):
    """Flattened timing/usage metrics for one generation run."""

    generation_run_id: str
    run_kind: str
    status: str
    prompt_id: str | None = None
    application_pack_id: str | None = None
    original_resume_id: str | None = None
    tailored_resume_id: str | None = None
    job_id: str | None = None
    created_at: str | None = None
    completed_at: str | None = None
    total_duration_ms: int | None = None
    total_events: int = 0
    llm_total_calls: int | None = None
    llm_latency_total_ms: int | None = None
    llm_total_tokens: int | None = None
    llm_estimated_cost_usd: float | None = None


class GenerationRunTimingListResponse(BaseModel):
    """List response for generation run timing rows."""

    request_id: str
    data: list[GenerationRunTimingRecord]


class GenerationRunProcessTiming(BaseModel):
    """Aggregated process duration for a generation run."""

    process_key: str
    host_event: str
    sub_event: str | None = None
    duration_ms: int


class GenerationRunTimingDetailRecord(BaseModel):
    """Detailed timing record grouped under one generation run."""

    generation_run_id: str
    run_kind: str
    status: str
    prompt_id: str | None = None
    application_pack_id: str | None = None
    original_resume_id: str | None = None
    tailored_resume_id: str | None = None
    job_id: str | None = None
    created_at: str | None = None
    completed_at: str | None = None
    total_duration_ms: int | None = None
    llm_total_calls: int | None = None
    llm_latency_total_ms: int | None = None
    llm_total_tokens: int | None = None
    llm_estimated_cost_usd: float | None = None
    process_timings: list[GenerationRunProcessTiming] = Field(default_factory=list)


class GenerationRunTimingDetailListResponse(BaseModel):
    """List response for detailed generation run timing rows."""

    request_id: str
    data: list[GenerationRunTimingDetailRecord]


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
