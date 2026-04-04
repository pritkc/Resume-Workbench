"""Adapter from Resume Matcher JSON to RenderCV input."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from app.rendering.theme_profiles import (
    RenderThemeSettings,
    build_design,
    build_locale,
    build_settings,
)

_LINK_PREFIX_RE = re.compile(r"^(https?://)?(www\.)?", re.IGNORECASE)
_NON_DIGIT_RE = re.compile(r"\D+")


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _extract_social_username(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    if "/" not in cleaned:
        return cleaned.lstrip("@")
    parsed = urlparse(cleaned if cleaned.startswith("http") else f"https://{cleaned}")
    parts = [part for part in parsed.path.split("/") if part]
    if not parts:
        return _LINK_PREFIX_RE.sub("", cleaned).lstrip("@")
    return parts[-1].lstrip("@")


def _social_networks(personal_info: dict[str, Any]) -> list[dict[str, str]]:
    networks: list[dict[str, str]] = []
    for item in personal_info.get("socialNetworks") or []:
        if not isinstance(item, dict):
            continue
        network = _clean_text(item.get("network"))
        username = _extract_social_username(item.get("username"))
        if network and username:
            networks.append({"network": network, "username": username})

    linkedin_username = _extract_social_username(personal_info.get("linkedin"))
    github_username = _extract_social_username(personal_info.get("github"))
    if linkedin_username:
        networks.append({"network": "LinkedIn", "username": linkedin_username})
    if github_username:
        networks.append({"network": "GitHub", "username": github_username})
    return networks


def _custom_connections(personal_info: dict[str, Any]) -> list[dict[str, str]] | None:
    entries: list[dict[str, str]] = []
    for item in personal_info.get("customConnections") or []:
        if not isinstance(item, dict):
            continue
        placeholder = _clean_text(item.get("placeholder"))
        if not placeholder:
            continue
        row: dict[str, str] = {"placeholder": placeholder}
        url = _clean_text(item.get("url"))
        icon = _clean_text(item.get("fontawesome_icon") or item.get("fontAwesomeIcon"))
        if url:
            row["url"] = url if url.startswith("http") else f"https://{url}"
        if icon:
            row["fontawesome_icon"] = icon
        entries.append(row)
    return entries or None


def _normalize_phone_number(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    if cleaned.startswith("+") and cleaned[1:].isdigit():
        return cleaned

    digits = _NON_DIGIT_RE.sub("", cleaned)
    if not digits:
        return None
    if len(digits) < 10:
        return None
    if len(digits) == 10:
        return f"+1{digits}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+{digits}"
    if cleaned.startswith("+"):
        return f"+{digits}"
    return f"+{digits}"


def _summary_section(summary: str | None) -> list[str] | None:
    cleaned = _clean_text(summary)
    return [cleaned] if cleaned else None


def _experience_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "company": item.get("company") or "Company",
            "position": item.get("title") or "Role",
            "date": _clean_text(item.get("years")),
            "location": _clean_text(item.get("location")),
            "summary": None,
            "highlights": [point for point in item.get("description", []) if point],
        }
        for item in entries
    ]


def _education_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "institution": item.get("institution") or "Institution",
            "area": item.get("degree") or "Education",
            "degree": None,
            "date": _clean_text(item.get("years")),
            "location": None,
            "summary": _clean_text(item.get("description")),
            "highlights": [],
        }
        for item in entries
    ]


def _project_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    project_rows: list[dict[str, Any]] = []
    for item in entries:
        name = _clean_text(item.get("name")) or "Project"
        website = _clean_text(item.get("website"))
        if website:
            name = f"[{name}]({website if website.startswith('http') else f'https://{website}'})"
        project_rows.append(
            {
                "name": name,
                "date": _clean_text(item.get("years")),
                "summary": _clean_text(item.get("role")),
                "highlights": [point for point in item.get("description", []) if point],
            }
        )
    return project_rows


def _skills_sections(additional: dict[str, Any]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    technical = additional.get("technicalSkills") or []
    languages = additional.get("languages") or []
    if technical:
        entries.append({"label": "Technical Skills", "details": ", ".join(technical)})
    if languages:
        entries.append({"label": "Languages", "details": ", ".join(languages)})
    return entries


def _bullet_entries(items: list[str]) -> list[dict[str, str]]:
    return [{"bullet": item} for item in items if item]


def _custom_sections(custom_sections: dict[str, Any]) -> dict[str, list[dict[str, str]] | list[str]]:
    sections: dict[str, list[dict[str, str]] | list[str]] = {}
    for key, raw_section in custom_sections.items():
        if not isinstance(raw_section, dict):
            continue
        title = raw_section.get("title") or raw_section.get("displayName") or key
        items = raw_section.get("items") or []
        normalized_items: list[str] = []
        for item in items:
            if isinstance(item, str):
                normalized_items.append(item)
            elif isinstance(item, dict):
                pieces = [
                    _clean_text(item.get("title")),
                    _clean_text(item.get("subtitle")),
                    _clean_text(item.get("description")),
                    _clean_text(item.get("years")),
                ]
                line = " — ".join(piece for piece in pieces if piece)
                if line:
                    normalized_items.append(line)
        if normalized_items:
            sections[title] = normalized_items
    return sections


def resume_to_rendercv_payload(
    resume_data: dict[str, Any],
    theme_settings: RenderThemeSettings,
) -> dict[str, object]:
    personal_info = resume_data.get("personalInfo") or {}
    additional = resume_data.get("additional") or {}
    sections: dict[str, object] = {}

    summary = _summary_section(resume_data.get("summary"))
    if summary:
        sections["summary"] = summary

    experience = _experience_entries(resume_data.get("workExperience") or [])
    if experience:
        sections["experience"] = experience

    education = _education_entries(resume_data.get("education") or [])
    if education:
        sections["education"] = education

    projects = _project_entries(resume_data.get("personalProjects") or [])
    if projects:
        sections["projects"] = projects

    skills = _skills_sections(additional)
    if skills:
        sections["skills"] = skills

    certifications = _bullet_entries(additional.get("certificationsTraining") or [])
    if certifications:
        sections["certifications"] = certifications

    awards = _bullet_entries(additional.get("awards") or [])
    if awards:
        sections["awards"] = awards

    for section_title, values in _custom_sections(resume_data.get("customSections") or {}).items():
        sections[section_title] = values

    website = _clean_text(personal_info.get("website"))
    payload = {
        "cv": {
            "name": personal_info.get("name") or "Candidate",
            "headline": _clean_text(personal_info.get("title")),
            "location": _clean_text(personal_info.get("location")),
            "email": _clean_text(personal_info.get("email")),
            "photo": _clean_text(personal_info.get("photoUrl") or personal_info.get("photo_url")),
            "phone": _normalize_phone_number(personal_info.get("phone")),
            "website": (
                website
                if website and website.startswith("http")
                else (f"https://{website}" if website else None)
            ),
            "social_networks": _social_networks(personal_info),
            "custom_connections": _custom_connections(personal_info),
            "sections": sections,
        },
        "design": build_design(theme_settings),
    }
    locale = build_locale(theme_settings)
    settings = build_settings(theme_settings)
    if locale:
        payload["locale"] = locale
    if settings:
        payload["settings"] = settings
    return payload
