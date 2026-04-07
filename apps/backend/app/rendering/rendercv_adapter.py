"""Adapter from Resume Matcher JSON to RenderCV input."""

from __future__ import annotations

import copy
import re
from typing import Any
from urllib.parse import urlparse

import yaml

from app.services.additional_groups import (
    DEFAULT_ADDITIONAL_GROUP_LABELS_BY_ID,
    coerce_string_list,
    default_additional_info,
    extract_additional_groups,
    generate_additional_group_id,
    normalize_additional_groups,
)
from app.services.section_metadata import build_section_meta_for_titled_custom_sections
from app.rendering.theme_profiles import (
    RenderThemeSettings,
    build_design,
    build_locale,
    build_settings,
    theme_settings_from_rendercv_sections,
)

_LINK_PREFIX_RE = re.compile(r"^(https?://)?(www\.)?", re.IGNORECASE)
_NON_DIGIT_RE = re.compile(r"\D+")
_MARKDOWN_LINK_RE = re.compile(r"^\[(?P<label>.+?)\]\((?P<url>[^)]+)\)$")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")

_KNOWN_SECTION_KEYS = {
    "summary",
    "experience",
    "education",
    "projects",
    "skills",
    "certifications",
    "awards",
}

_DEDICATED_SOCIAL_NETWORKS = {
    "linkedin": "LinkedIn",
    "github": "GitHub",
}


class RenderCVYamlValidationError(ValueError):
    """Structured YAML validation error with section and cursor metadata."""

    def __init__(
        self,
        message: str,
        *,
        section: str | None = None,
        line: int | None = None,
        column: int | None = None,
        path: list[str] | None = None,
    ) -> None:
        super().__init__(message)
        self.section = section
        self.line = line
        self.column = column
        self.path = path or []


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


def _canonical_social_network_name(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    normalized = _NON_ALNUM_RE.sub("", cleaned.lower())
    return _DEDICATED_SOCIAL_NETWORKS.get(normalized, cleaned)


def _social_networks(personal_info: dict[str, Any]) -> list[dict[str, str]]:
    networks: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

    linkedin_username = _extract_social_username(personal_info.get("linkedin"))
    github_username = _extract_social_username(personal_info.get("github"))

    def append_network(network: str | None, username: str | None) -> None:
        canonical_name = _canonical_social_network_name(network)
        canonical_username = _extract_social_username(username)
        if not canonical_name or not canonical_username:
            return

        key = (canonical_name.lower(), canonical_username.lower())
        if key in seen:
            return

        seen.add(key)
        networks.append({"network": canonical_name, "username": canonical_username})

    for item in personal_info.get("socialNetworks") or []:
        if not isinstance(item, dict):
            continue
        network = _canonical_social_network_name(item.get("network"))
        if network == "LinkedIn" and linkedin_username:
            continue
        if network == "GitHub" and github_username:
            continue
        append_network(network, item.get("username"))

    if linkedin_username:
        append_network("LinkedIn", linkedin_username)
    if github_username:
        append_network("GitHub", github_username)
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
    for group in extract_additional_groups(additional):
        label = _clean_text(str(group.get("label") or ""))
        items = [item for item in group.get("items") or [] if isinstance(item, str) and item.strip()]
        if label and items:
            entries.append({"label": label, "details": ", ".join(items)})
    return entries


def _bullet_entries(items: list[str]) -> list[dict[str, str]]:
    return [{"bullet": item} for item in items if item]


def _custom_sections(
    custom_sections: dict[str, Any],
    section_meta: list[dict[str, Any]] | None = None,
) -> dict[str, list[dict[str, str]] | list[str]]:
    sections: dict[str, list[dict[str, str]] | list[str]] = {}
    display_name_by_key = {
        str(meta.get("key", "")).strip(): str(meta.get("displayName", "")).strip()
        for meta in section_meta or []
        if not meta.get("isDefault", True)
    }
    for key, raw_section in custom_sections.items():
        if not isinstance(raw_section, dict):
            continue
        title = (
            raw_section.get("title")
            or raw_section.get("displayName")
            or display_name_by_key.get(key)
            or key
        )
        raw_section_type = raw_section.get("sectionType")
        section_type = _clean_text(getattr(raw_section_type, "value", raw_section_type))
        if section_type == "text":
            text_value = _clean_text(raw_section.get("text"))
            if text_value:
                sections[title] = [text_value]
            continue
        if section_type == "stringList":
            strings = _text_list(raw_section.get("strings"))
            if strings:
                sections[title] = strings
            continue
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

    for section_title, values in _custom_sections(
        resume_data.get("customSections") or {},
        resume_data.get("sectionMeta") or [],
    ).items():
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


def _normalize_section_yaml(root_key: str, value: Any) -> str:
    return yaml.safe_dump(
        {root_key: value if value is not None else {}},
        sort_keys=False,
        allow_unicode=True,
    )


def rendercv_payload_to_yaml_sections(
    resume_data: dict[str, Any],
    theme_settings: RenderThemeSettings,
) -> dict[str, str]:
    payload = resume_to_rendercv_payload(resume_data, theme_settings)
    return {
        "cv": _normalize_section_yaml("cv", payload.get("cv") or {}),
        "design": _normalize_section_yaml("design", payload.get("design") or {}),
        "locale": _normalize_section_yaml("locale", payload.get("locale") or {}),
        "settings": _normalize_section_yaml("settings", payload.get("settings") or {}),
    }


def _text_list(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        cleaned = _clean_text(value)
        return [cleaned] if cleaned else []
    if isinstance(value, list):
        items: list[str] = []
        for entry in value:
            if isinstance(entry, str):
                cleaned = _clean_text(entry)
                if cleaned:
                    items.append(cleaned)
            elif isinstance(entry, dict):
                bullet = _clean_text(entry.get("bullet"))
                summary = _clean_text(entry.get("summary"))
                details = _clean_text(entry.get("details"))
                title = _clean_text(entry.get("title"))
                line = bullet or summary or details or title
                if line:
                    items.append(line)
        return items
    return []


def _split_csv(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def _skill_entry_items(entry: dict[str, Any]) -> list[str]:
    details = entry.get("details")
    if isinstance(details, str):
        parsed = _split_csv(_clean_text(details))
        if parsed:
            return parsed
    elif details is not None:
        parsed = coerce_string_list(details)
        if parsed:
            return parsed

    items = entry.get("items")
    if items is not None:
        parsed = coerce_string_list(items)
        if parsed:
            return parsed

    return []


def _parse_markdown_link(value: str | None) -> tuple[str | None, str | None]:
    cleaned = _clean_text(value)
    if not cleaned:
        return None, None
    match = _MARKDOWN_LINK_RE.match(cleaned)
    if not match:
        return cleaned, None
    return match.group("label").strip(), match.group("url").strip()


def _stringify_description(summary: str | None, highlights: list[str]) -> str | None:
    pieces = [piece for piece in [summary, *highlights] if piece]
    if not pieces:
        return None
    return "\n".join(pieces)


def _build_custom_section_meta(
    custom_sections: dict[str, dict[str, Any]],
    base_resume_data: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    return build_section_meta_for_titled_custom_sections(
        custom_sections,
        base_resume_data=base_resume_data,
    )


def _parse_custom_section_items(items: list[Any]) -> dict[str, Any]:
    if not items:
        return {"sectionType": "stringList", "strings": []}

    if all(isinstance(item, str) for item in items):
        return {"sectionType": "stringList", "strings": _text_list(items)}

    if all(isinstance(item, dict) and "bullet" in item for item in items):
        return {"sectionType": "stringList", "strings": _text_list(items)}

    parsed_items: list[dict[str, Any]] = []
    for index, item in enumerate(items, start=1):
        if isinstance(item, str):
            parsed_items.append({"id": index, "title": item, "description": []})
            continue

        if not isinstance(item, dict):
            continue

        parsed_items.append(
            {
                "id": index,
                "title": _clean_text(
                    item.get("title")
                    or item.get("name")
                    or item.get("company")
                    or item.get("institution")
                    or item.get("label")
                    or item.get("position")
                )
                or "",
                "subtitle": _clean_text(
                    item.get("subtitle")
                    or item.get("summary")
                    or item.get("details")
                    or item.get("area")
                ),
                "location": _clean_text(item.get("location")),
                "years": _clean_text(item.get("date")) or "",
                "description": _text_list(item.get("highlights")),
            }
        )

    if parsed_items:
        return {"sectionType": "itemList", "items": parsed_items}


def _base_custom_section_type_by_title(
    base_resume_data: dict[str, Any] | None,
) -> dict[str, str]:
    if not isinstance(base_resume_data, dict):
        return {}

    section_meta = base_resume_data.get("sectionMeta")
    custom_sections = base_resume_data.get("customSections")
    if not isinstance(section_meta, list) or not isinstance(custom_sections, dict):
        return {}

    section_type_by_title: dict[str, str] = {}
    for meta in section_meta:
        if not isinstance(meta, dict) or meta.get("isDefault", True):
            continue
        key = str(meta.get("key", "")).strip()
        display_name = str(meta.get("displayName", "")).strip()
        if not key or not display_name:
            continue
        raw_section = custom_sections.get(key)
        if not isinstance(raw_section, dict):
            continue
        raw_section_type = getattr(raw_section.get("sectionType"), "value", raw_section.get("sectionType"))
        meta_section_type = getattr(meta.get("sectionType"), "value", meta.get("sectionType"))
        section_type = _clean_text(raw_section_type) or _clean_text(meta_section_type)
        if section_type:
            section_type_by_title[display_name] = section_type
            section_type_by_title[key] = section_type
    return section_type_by_title

    return {"sectionType": "stringList", "strings": _text_list(items)}


def _default_group_label_for_id(group_id: str, base_resume_data: dict[str, Any] | None) -> str:
    if base_resume_data:
        for group in extract_additional_groups(base_resume_data.get("additional")):
            if str(group.get("id", "")).strip() == group_id:
                label = _clean_text(str(group.get("label") or ""))
                if label:
                    return label
    return DEFAULT_ADDITIONAL_GROUP_LABELS_BY_ID[group_id]


def _group_id_from_label(label: str) -> str | None:
    normalized = label.strip().strip(":").casefold()
    if not normalized:
        return None
    if normalized in {"technical skills", "skills", "core skills"} or "skill" in normalized:
        return "technicalSkills"
    if "language" in normalized:
        return "languages"
    if "cert" in normalized or "training" in normalized:
        return "certificationsTraining"
    if "award" in normalized or "honor" in normalized:
        return "awards"
    return None


def rendercv_cv_to_resume_data(
    cv_payload: dict[str, Any],
    *,
    base_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    resume_data = copy.deepcopy(base_resume_data) if base_resume_data else {}
    sections = cv_payload.get("sections")
    sections = sections if isinstance(sections, dict) else {}

    social_networks: list[dict[str, str]] = []
    social_lookup: dict[str, str] = {}
    social_seen: set[tuple[str, str]] = set()
    for item in cv_payload.get("social_networks") or []:
        if not isinstance(item, dict):
            continue
        network = _canonical_social_network_name(item.get("network"))
        username = _extract_social_username(item.get("username"))
        if not network or not username:
            continue

        if network in _DEDICATED_SOCIAL_NETWORKS.values():
            social_lookup[network.lower()] = username
            continue

        key = (network.lower(), username.lower())
        if key in social_seen:
            continue

        social_seen.add(key)
        social_networks.append({"network": network, "username": username})

    summary_items = _text_list(sections.get("summary"))
    skills_entries = sections.get("skills") if isinstance(sections.get("skills"), list) else []
    additional_groups: list[dict[str, Any]] = []
    existing_group_ids: set[str] = set()

    for entry in skills_entries:
        if isinstance(entry, str):
            group_id = (
                "technicalSkills"
                if "technicalSkills" not in existing_group_ids
                else generate_additional_group_id(existing_group_ids, "Technical Skills")
            )
            existing_group_ids.add(group_id)
            additional_groups.append(
                {
                    "id": group_id,
                    "label": _default_group_label_for_id("technicalSkills", base_resume_data),
                    "items": _split_csv(entry),
                }
            )
            continue

        if not isinstance(entry, dict):
            continue

        label = _clean_text(str(entry.get("label") or entry.get("title") or "")) or "Additional"
        details = _skill_entry_items(entry)

        default_group_id = _group_id_from_label(label)
        if default_group_id and default_group_id not in existing_group_ids:
            group_id = default_group_id
        else:
            group_id = generate_additional_group_id(existing_group_ids, label)

        existing_group_ids.add(group_id)
        additional_groups.append(
            {
                "id": group_id,
                "label": label,
                "items": details,
            }
        )

    certifications = _text_list(sections.get("certifications"))
    if certifications:
        additional_groups.append(
            {
                "id": "certificationsTraining",
                "label": _default_group_label_for_id("certificationsTraining", base_resume_data),
                "items": certifications,
            }
        )
        existing_group_ids.add("certificationsTraining")

    awards = _text_list(sections.get("awards"))
    if awards:
        additional_groups.append(
            {
                "id": "awards",
                "label": _default_group_label_for_id("awards", base_resume_data),
                "items": awards,
            }
        )
        existing_group_ids.add("awards")

    work_experience = []
    for index, item in enumerate(sections.get("experience") or [], start=1):
        if not isinstance(item, dict):
            continue
        description = _text_list(item.get("highlights"))
        summary = _clean_text(item.get("summary"))
        if summary:
            description = [summary, *description]
        work_experience.append(
            {
                "id": index,
                "title": _clean_text(item.get("position")) or "",
                "company": _clean_text(item.get("company")) or "",
                "location": _clean_text(item.get("location")),
                "years": _clean_text(item.get("date")) or "",
                "description": description,
            }
        )

    education = []
    for index, item in enumerate(sections.get("education") or [], start=1):
        if not isinstance(item, dict):
            continue
        education.append(
            {
                "id": index,
                "institution": _clean_text(item.get("institution")) or "",
                "degree": _clean_text(item.get("area") or item.get("degree")) or "",
                "years": _clean_text(item.get("date")) or "",
                "description": _stringify_description(
                    _clean_text(item.get("summary")),
                    _text_list(item.get("highlights")),
                ),
            }
        )

    projects = []
    for index, item in enumerate(sections.get("projects") or [], start=1):
        if not isinstance(item, dict):
            continue
        name, website = _parse_markdown_link(item.get("name"))
        projects.append(
            {
                "id": index,
                "name": name or "",
                "role": _clean_text(item.get("summary")) or "",
                "years": _clean_text(item.get("date")) or "",
                "website": website,
                "description": _text_list(item.get("highlights")),
            }
        )

    custom_sections_payload = {
        title: values
        for title, values in sections.items()
        if title not in _KNOWN_SECTION_KEYS
    }
    base_custom_section_types = _base_custom_section_type_by_title(base_resume_data)
    parsed_custom_sections = {
        title: (
            {
                "sectionType": "text",
                "text": "\n".join(_text_list(values if isinstance(values, list) else [values])),
            }
            if base_custom_section_types.get(title) == "text"
            else {
                "sectionType": "stringList",
                "strings": _text_list(values if isinstance(values, list) else [values]),
            }
            if base_custom_section_types.get(title) == "stringList"
            else _parse_custom_section_items(values if isinstance(values, list) else [values])
        )
        for title, values in custom_sections_payload.items()
    }
    section_meta = _build_custom_section_meta(parsed_custom_sections, base_resume_data)
    custom_sections: dict[str, Any] = {}
    for meta in section_meta:
        if meta.get("isDefault", True):
            continue
        display_name = str(meta.get("displayName", "")).strip()
        if display_name in parsed_custom_sections:
            custom_sections[str(meta["key"])] = parsed_custom_sections[display_name]

    resume_data.update(
        {
            "personalInfo": {
                **(resume_data.get("personalInfo") or {}),
                "name": cv_payload.get("name") or "",
                "title": _clean_text(cv_payload.get("headline")) or "",
                "email": _clean_text(cv_payload.get("email")) or "",
                "phone": _clean_text(cv_payload.get("phone")) or "",
                "location": _clean_text(cv_payload.get("location")) or "",
                "website": _clean_text(cv_payload.get("website")),
                "linkedin": social_lookup.get("linkedin"),
                "github": social_lookup.get("github"),
                "photoUrl": _clean_text(cv_payload.get("photo")),
                "socialNetworks": social_networks,
                "customConnections": [
                    item
                    for item in cv_payload.get("custom_connections") or []
                    if isinstance(item, dict)
                ],
            },
            "summary": summary_items[0] if summary_items else "",
            "workExperience": work_experience,
            "education": education,
            "personalProjects": projects,
            "additional": normalize_additional_groups(
                {"groups": additional_groups}
                if additional_groups
                else resume_data.get("additional") or default_additional_info()
            ),
            "customSections": custom_sections,
            "sectionMeta": section_meta,
        }
    )
    return resume_data


def parse_rendercv_yaml_sections(
    yaml_sections: dict[str, str],
    *,
    base_resume_data: dict[str, Any] | None = None,
    base_theme_settings: RenderThemeSettings | None = None,
) -> tuple[dict[str, Any], RenderThemeSettings]:
    def load_section(root_key: str) -> dict[str, Any]:
        raw_text = yaml_sections.get(root_key, "")
        if not raw_text.strip():
            return {}
        try:
            parsed = yaml.safe_load(raw_text)
        except yaml.YAMLError as exc:
            mark = getattr(exc, "problem_mark", None)
            line = getattr(mark, "line", None)
            column = getattr(mark, "column", None)
            message = getattr(exc, "problem", None) or getattr(exc, "context", None) or str(exc)
            raise RenderCVYamlValidationError(
                f"{root_key.upper()} YAML is invalid: {message}",
                section=root_key,
                line=(line + 1) if isinstance(line, int) else None,
                column=(column + 1) if isinstance(column, int) else None,
            ) from exc
        if parsed is None:
            return {}
        if not isinstance(parsed, dict):
            raise RenderCVYamlValidationError(
                f"{root_key.upper()} YAML must decode to an object.",
                section=root_key,
            )
        if root_key in parsed:
            section_value = parsed[root_key]
        else:
            section_value = parsed
        if section_value is None:
            return {}
        if not isinstance(section_value, dict):
            raise RenderCVYamlValidationError(
                f"{root_key.upper()} YAML must contain a mapping.",
                section=root_key,
            )
        return section_value

    cv_payload = load_section("cv")
    design_payload = load_section("design")
    locale_payload = load_section("locale")
    settings_payload = load_section("settings")

    theme_settings = theme_settings_from_rendercv_sections(
        design=design_payload,
        locale=locale_payload,
        settings=settings_payload,
        base_settings=base_theme_settings,
    )
    resume_data = rendercv_cv_to_resume_data(
        cv_payload,
        base_resume_data=base_resume_data,
    )
    return resume_data, theme_settings
