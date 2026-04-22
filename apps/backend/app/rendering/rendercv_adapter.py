"""Adapter from Resume Matcher JSON to RenderCV input."""

from __future__ import annotations

import copy
import re
from typing import Any
from urllib.parse import urlparse

import yaml

from app.services.additional_groups import (
    DEFAULT_SKILL_GROUP_LABELS_BY_ID,
    coerce_string_list,
    default_skills_section,
    extract_skill_groups,
    normalize_additional_groups,
    normalize_skill_groups,
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
_MARKDOWN_LINK_RE = re.compile(r"^\[(?P<label>(?:\\.|[^\]])+)\]\((?P<url>[^)]+)\)$")
_MARKDOWN_LINK_INLINE_RE = re.compile(r"(?<!\\)\[(?P<label>(?:\\.|[^\]])+)\]\((?P<url>[^)]+)\)")
_NON_ALNUM_RE = re.compile(r"[^a-z0-9]+")
_FA_CLASS_TOKEN_RE = re.compile(r"\s+")
_BOLD_BOUNDARY_CLASS = r"A-Za-z0-9"

_KNOWN_SECTION_KEYS = {
    "summary",
    "experience",
    "education",
    "projects",
    "skills",
    "certifications",
    "awards",
}

# Default CV section `id` / `key` from frontend sectionMeta → RenderCV `sections` keys.
_SECTION_META_ID_TO_RENDER_KEY: dict[str, str] = {
    "summary": "summary",
    "workExperience": "experience",
    "education": "education",
    "personalProjects": "projects",
    "skills": "skills",
}

# Fallback append order when sectionMeta omits a populated default block.
_DEFAULT_RENDERCV_SECTION_KEYS: tuple[str, ...] = (
    "summary",
    "experience",
    "education",
    "projects",
    "skills",
)


def _section_meta_order_key(meta: dict[str, Any]) -> int:
    raw = meta.get("order")
    if isinstance(raw, bool):
        return int(raw)
    if isinstance(raw, int):
        return raw
    if isinstance(raw, float):
        return int(raw)
    if isinstance(raw, str):
        stripped = raw.strip()
        if stripped.removeprefix("-").isdigit():
            return int(stripped)
    return 0
_PROJECT_REPO_LABELS = {"repo", "repository", "github", "source", "code"}
_PROJECT_LIVE_LABELS = {"live", "demo", "site", "website", "web"}

_DEDICATED_SOCIAL_NETWORKS = {
    "linkedin": "LinkedIn",
    "github": "GitHub",
}
_SOCIAL_NETWORK_URL_PREFIXES = {
    "linkedin": "https://linkedin.com/in/",
    "github": "https://github.com/",
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


def _ensure_absolute_url(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None
    if cleaned.startswith(("http://", "https://")):
        return cleaned
    return f"https://{cleaned}"


def _normalize_icon_name(value: str | None) -> str | None:
    cleaned = _clean_text(value)
    if cleaned is None:
        return None

    tokens = [token for token in _FA_CLASS_TOKEN_RE.split(cleaned) if token]
    if not tokens:
        return None

    filtered_tokens = [
        token
        for token in tokens
        if token
        and token not in {
            "fa",
            "fa-brands",
            "fa-solid",
            "fa-regular",
            "fa-light",
            "fa-thin",
            "fa-duotone",
            "fab",
            "fas",
            "far",
            "fal",
            "fat",
        }
    ]
    if not filtered_tokens:
        return cleaned

    icon_token = filtered_tokens[-1]
    if icon_token.startswith("fa-"):
        return icon_token[3:]
    return icon_token


def _build_social_url(network: str | None, username: str | None) -> str | None:
    canonical_name = _canonical_social_network_name(network)
    canonical_username = _extract_social_username(username)
    if not canonical_name or not canonical_username:
        return None
    if isinstance(username, str) and username.strip().startswith(("http://", "https://")):
        return username.strip()
    prefix = _SOCIAL_NETWORK_URL_PREFIXES.get(_NON_ALNUM_RE.sub("", canonical_name.lower()))
    if prefix:
        return f"{prefix}{canonical_username}"
    if isinstance(username, str) and ("/" in username or "." in username):
        return _ensure_absolute_url(username)
    return None


def _profile_links(personal_info: dict[str, Any]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    seen_urls: set[str] = set()
    has_explicit_profile_links = isinstance(personal_info.get("profileLinks"), list) or isinstance(
        personal_info.get("profile_links"), list
    )

    def append(label: str | None, url: str | None, icon: str | None = None) -> None:
        cleaned_label = _clean_text(label)
        cleaned_url = _ensure_absolute_url(url)
        cleaned_icon = _normalize_icon_name(icon)
        if not cleaned_label or not cleaned_url:
            return

        url_key = cleaned_url.casefold()
        if url_key in seen_urls:
            return

        seen_urls.add(url_key)
        row: dict[str, str] = {"label": cleaned_label, "url": cleaned_url}
        if cleaned_icon:
            row["fontawesome_icon"] = cleaned_icon
        entries.append(row)

    for item in personal_info.get("profileLinks") or personal_info.get("profile_links") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("label") or item.get("placeholder"),
            item.get("url"),
            item.get("fontawesome_icon") or item.get("fontAwesomeIcon"),
        )

    if has_explicit_profile_links:
        return entries

    for item in personal_info.get("customConnections") or personal_info.get("custom_connections") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("label") or item.get("placeholder"),
            item.get("url"),
            item.get("fontawesome_icon") or item.get("fontAwesomeIcon"),
        )

    append("Website", personal_info.get("website"), "link")
    append("LinkedIn", _build_social_url("LinkedIn", personal_info.get("linkedin")), "linkedin-in")
    append("GitHub", _build_social_url("GitHub", personal_info.get("github")), "github")

    for item in personal_info.get("socialNetworks") or personal_info.get("social_networks") or []:
        if not isinstance(item, dict):
            continue
        append(
            item.get("network"),
            _build_social_url(item.get("network"), item.get("username")),
        )

    return entries


def _social_networks(personal_info: dict[str, Any]) -> list[dict[str, str]]:
    networks: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()

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

    has_explicit_profile_links = isinstance(personal_info.get("profileLinks"), list) or isinstance(
        personal_info.get("profile_links"), list
    )
    if has_explicit_profile_links:
        for item in _profile_links(personal_info):
            network = _canonical_social_network_name(item.get("label"))
            if network not in _DEDICATED_SOCIAL_NETWORKS.values():
                continue
            append_network(network, item.get("url"))
        return networks

    linkedin_username = _extract_social_username(personal_info.get("linkedin"))
    github_username = _extract_social_username(personal_info.get("github"))

    for item in personal_info.get("socialNetworks") or personal_info.get("social_networks") or []:
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
    for item in _profile_links(personal_info):
        placeholder = _clean_text(item.get("label"))
        if not placeholder or placeholder.casefold() == "website":
            continue
        if _canonical_social_network_name(placeholder) in _DEDICATED_SOCIAL_NETWORKS.values():
            continue
        row: dict[str, str] = {"placeholder": placeholder}
        url = _ensure_absolute_url(item.get("url"))
        icon = _normalize_icon_name(item.get("fontawesome_icon"))
        if url:
            row["url"] = url
        if icon:
            row["fontawesome_icon"] = icon
        entries.append(row)
    return entries or None


def _website_link(personal_info: dict[str, Any]) -> str | None:
    for item in _profile_links(personal_info):
        label = _clean_text(item.get("label"))
        if label and label.casefold() == "website":
            return _ensure_absolute_url(item.get("url"))
    return None


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


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off"}:
            return False
    return default


def _is_section_visible(section_meta: Any, key: str) -> bool:
    if not isinstance(section_meta, list):
        return True
    for item in section_meta:
        if not isinstance(item, dict):
            continue
        candidate_key = _clean_text(str(item.get("key") or ""))
        if candidate_key != key:
            continue
        return _coerce_bool(item.get("isVisible"), default=True)
    return True


def _resolve_bold_keywords(theme_settings: RenderThemeSettings) -> list[str]:
    if not theme_settings.bold_keywords:
        return []
    runtime_settings = theme_settings.settings
    if not isinstance(runtime_settings, dict):
        return []
    raw_keywords = runtime_settings.get("bold_keywords")
    if not isinstance(raw_keywords, list):
        return []

    keywords: list[str] = []
    seen: set[str] = set()
    for item in raw_keywords:
        if not isinstance(item, str):
            continue
        keyword = " ".join(item.split()).strip()
        if len(keyword) < 2:
            continue
        key = keyword.casefold()
        if key in seen:
            continue
        seen.add(key)
        keywords.append(keyword)

    keywords.sort(key=len, reverse=True)
    return keywords


def _bold_keyword_in_text(text: str, keyword: str) -> str:
    escaped = re.escape(keyword)
    pattern = re.compile(
        rf"(?<![{_BOLD_BOUNDARY_CLASS}])({escaped})(?![{_BOLD_BOUNDARY_CLASS}])",
        re.IGNORECASE,
    )

    def _replace(match: re.Match[str]) -> str:
        start = match.start(1)
        end = match.end(1)
        if text[max(0, start - 2):start] == "**" and text[end:end + 2] == "**":
            return match.group(1)
        return f"**{match.group(1)}**"

    return pattern.sub(_replace, text)


def _bold_keywords_in_bullet(text: str, keywords: list[str]) -> str:
    result = text
    for keyword in keywords:
        result = _bold_keyword_in_text(result, keyword)
    return result


def _entry_date_fields(item: dict[str, Any]) -> dict[str, str]:
    start_date = _clean_text(item.get("start_date") or item.get("startDate"))
    end_date = _clean_text(item.get("end_date") or item.get("endDate"))
    if start_date or end_date:
        fields: dict[str, str] = {}
        if start_date:
            fields["start_date"] = start_date
        if end_date:
            fields["end_date"] = end_date
        return fields

    date = _clean_text(item.get("date") or item.get("years"))
    return {"date": date} if date else {}


def _resume_date_label(item: dict[str, Any]) -> str:
    date = _clean_text(item.get("date"))
    if date:
        return date
    start_date = _clean_text(item.get("start_date") or item.get("startDate"))
    end_date = _clean_text(item.get("end_date") or item.get("endDate"))
    if start_date and end_date:
        return f"{start_date} - {end_date}"
    if start_date:
        return f"{start_date} - present"
    return end_date or ""


def _experience_entries(
    entries: list[dict[str, Any]],
    *,
    bold_keywords: list[str],
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for item in entries:
        stack = _clean_text(
            item.get("summary") or item.get("tech_stacks") or item.get("techStack")
        )
        bullets = coerce_string_list(item.get("description") or item.get("highlights") or [])
        while stack and bullets and _clean_text(bullets[0]) == stack:
            bullets = bullets[1:]
        rows.append(
            {
                "company": item.get("company") or "Company",
                "position": item.get("position") or item.get("title") or "Role",
                **_entry_date_fields(item),
                "location": _clean_text(item.get("location")),
                "summary": stack,
                "highlights": [
                    _bold_keywords_in_bullet(point, bold_keywords)
                    for point in bullets
                    if point
                ],
            }
        )
    return rows


def _education_entries(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "institution": item.get("institution") or "Institution",
            "area": item.get("area") or item.get("degree") or "Education",
            "degree": _clean_text(item.get("degree")),
            **_entry_date_fields(item),
            "location": _clean_text(item.get("location")),
            "summary": _clean_text(item.get("summary") or item.get("description")),
            "highlights": [
                point
                for point in (item.get("highlights") or [])
                if point
            ],
        }
        for item in entries
    ]


def _project_entries(
    entries: list[dict[str, Any]],
    *,
    bold_keywords: list[str],
) -> list[dict[str, Any]]:
    project_rows: list[dict[str, Any]] = []
    for item in entries:
        name = _clean_text(item.get("name")) or "Project"
        github = _ensure_absolute_url(_clean_text(item.get("github")))
        website = _ensure_absolute_url(_clean_text(item.get("website")))
        link_tokens: list[str] = []
        if github:
            link_tokens.append(f"\\[[repo]({github})\\]")
        if website:
            link_tokens.append(f"\\[[live]({website})\\]")
        if link_tokens:
            name = f"{name} | {' '.join(link_tokens)}"
        stack = _clean_text(
            item.get("tech_stacks")
            or item.get("techStack")
            or item.get("summary")
            or item.get("role")
        )
        bullets = coerce_string_list(item.get("description") or item.get("highlights") or [])
        while stack and bullets and _clean_text(bullets[0]) == stack:
            bullets = bullets[1:]
        project_rows.append(
            {
                "name": name,
                "date": _clean_text(item.get("date") or item.get("years")),
                "tech_stacks": stack,
                "summary": stack,
                "highlights": [_bold_keywords_in_bullet(point, bold_keywords) for point in bullets if point],
            }
        )
    return project_rows


def _skills_sections(skills_section: dict[str, Any]) -> list[dict[str, str]]:
    entries: list[dict[str, str]] = []
    for group in extract_skill_groups(skills_section):
        label = _clean_text(str(group.get("label") or ""))
        values = [item for item in group.get("values") or [] if isinstance(item, str) and item.strip()]
        if label and values:
            entries.append({"label": label, "details": ", ".join(values)})
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
    skills_section = resume_data.get("skills") or resume_data.get("additional") or {}
    bold_keywords = _resolve_bold_keywords(theme_settings)

    summary_is_visible = _is_section_visible(resume_data.get("sectionMeta"), "summary")
    summary = _summary_section(resume_data.get("summary"))
    experience = _experience_entries(
        resume_data.get("workExperience") or [],
        bold_keywords=bold_keywords,
    )
    education = _education_entries(resume_data.get("education") or [])
    projects = _project_entries(
        resume_data.get("personalProjects") or [],
        bold_keywords=bold_keywords,
    )
    skills = _skills_sections(skills_section)

    blocks: dict[str, Any] = {}
    if summary and summary_is_visible:
        blocks["summary"] = summary
    if experience:
        blocks["experience"] = experience
    if education:
        blocks["education"] = education
    if projects:
        blocks["projects"] = projects
    if skills:
        blocks["skills"] = skills

    custom_sections_map = _custom_sections(
        resume_data.get("customSections") or {},
        resume_data.get("sectionMeta") or [],
    )

    sections: dict[str, Any] = {}
    section_meta_raw = resume_data.get("sectionMeta")

    if isinstance(section_meta_raw, list) and section_meta_raw:
        sorted_meta = sorted(
            (m for m in section_meta_raw if isinstance(m, dict)),
            key=_section_meta_order_key,
        )
        for meta in sorted_meta:
            if not _coerce_bool(meta.get("isVisible"), default=True):
                continue
            sid_raw = str(meta.get("id") or meta.get("key") or "").strip()
            sid = sid_raw or ""
            if sid == "personalInfo" or not sid:
                continue
            is_default = bool(meta.get("isDefault", True))
            if is_default:
                render_key = _SECTION_META_ID_TO_RENDER_KEY.get(sid)
                if render_key and render_key in blocks and render_key not in sections:
                    sections[render_key] = blocks[render_key]
            else:
                title = _clean_text(str(meta.get("displayName") or "")) or sid
                if title in custom_sections_map and title not in sections:
                    sections[title] = custom_sections_map[title]

        for render_key in _DEFAULT_RENDERCV_SECTION_KEYS:
            if render_key in sections:
                continue
            if render_key == "summary" and not summary_is_visible:
                continue
            if render_key in blocks:
                sections[render_key] = blocks[render_key]

        for section_title, values in custom_sections_map.items():
            if section_title not in sections:
                sections[section_title] = values
    else:
        if summary and summary_is_visible:
            sections["summary"] = summary
        if experience:
            sections["experience"] = experience
        if education:
            sections["education"] = education
        if projects:
            sections["projects"] = projects
        if skills:
            sections["skills"] = skills
        for section_title, values in custom_sections_map.items():
            sections[section_title] = values

    website = _website_link(personal_info)
    payload = {
        "cv": {
            "name": personal_info.get("name") or "Candidate",
            "headline": _clean_text(personal_info.get("headline") or personal_info.get("title")),
            "location": _clean_text(personal_info.get("location")),
            "email": _clean_text(personal_info.get("email")),
            "photo": _clean_text(
                personal_info.get("photo")
                or personal_info.get("photoUrl")
                or personal_info.get("photo_url")
            ),
            "phone": _normalize_phone_number(personal_info.get("phone")),
            "website": website,
            "social_networks": _social_networks(personal_info),
            "custom_connections": _custom_connections(personal_info),
            "sections": sections,
        },
        "design": build_design(theme_settings),
    }
    locale = build_locale(theme_settings)
    settings = build_settings(theme_settings)
    if isinstance(settings, dict):
        # Enforce bullet-only keyword bolding in adapter; do not let runtime
        # settings apply broad/global highlight behavior in downstream rendering.
        settings = copy.deepcopy(settings)
        settings.pop("bold_keywords", None)
        settings.pop("show_summary_section", None)
        settings.pop("show_summary_heading", None)
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

    values = entry.get("values")
    if values is not None:
        parsed = coerce_string_list(values)
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


def _parse_project_name_and_links(value: Any) -> tuple[str | None, str | None, str | None]:
    cleaned = _clean_text(value if isinstance(value, str) else None)
    if not cleaned:
        return None, None, None

    inline_links = list(_MARKDOWN_LINK_INLINE_RE.finditer(cleaned))
    if not inline_links:
        return cleaned, None, None

    github: str | None = None
    website: str | None = None
    name_value = cleaned

    for link in inline_links:
        raw_label = _clean_text(link.group("label")) or ""
        raw_url = _ensure_absolute_url(_clean_text(link.group("url")))
        if not raw_url:
            continue

        normalized_label = _NON_ALNUM_RE.sub("", raw_label.casefold())
        is_repo = (
            normalized_label in _PROJECT_REPO_LABELS
            or "github.com" in raw_url.casefold()
        )
        is_live = normalized_label in _PROJECT_LIVE_LABELS

        if is_repo and not github:
            github = raw_url
        elif is_live and not website:
            website = raw_url
        elif not website:
            website = raw_url
        elif not github:
            github = raw_url

        name_value = name_value.replace(link.group(0), " ")

    # Remove escaped bracket wrappers left behind when names include
    # plain-text brackets around markdown links (e.g. \[[repo](...)\]).
    name_value = re.sub(r"\\\[\s*\\\]", " ", name_value)
    name_value = re.sub(r"\s*[|•·\-]\s*$", "", name_value).strip()
    name_value = re.sub(r"\s{2,}", " ", name_value)
    if not name_value:
        first = inline_links[0]
        fallback_label = _clean_text(first.group("label"))
        normalized_fallback_label = _NON_ALNUM_RE.sub("", (fallback_label or "").casefold())
        if fallback_label and normalized_fallback_label not in (
            _PROJECT_REPO_LABELS | _PROJECT_LIVE_LABELS
        ):
            name_value = fallback_label

    if not name_value:
        name_value = "Project"

    return name_value, github, website


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


def _default_group_label_for_id(group_id: str, base_resume_data: dict[str, Any] | None) -> str:
    if base_resume_data:
        for group in extract_skill_groups(base_resume_data.get("skills") or base_resume_data.get("additional")):
            if str(group.get("id", "")).strip() == group_id:
                label = _clean_text(str(group.get("label") or ""))
                if label:
                    return label
    return DEFAULT_SKILL_GROUP_LABELS_BY_ID[group_id]


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
    skill_groups: list[dict[str, Any]] = []
    existing_group_labels: set[str] = set()

    for entry in skills_entries:
        if isinstance(entry, str):
            tech_label = _default_group_label_for_id("technicalSkills", base_resume_data)
            if tech_label.lower() not in existing_group_labels:
                existing_group_labels.add(tech_label.lower())
                skill_groups.append(
                    {
                        "label": tech_label,
                        "values": _split_csv(entry),
                    }
                )
            continue

        if not isinstance(entry, dict):
            continue

        label = _clean_text(str(entry.get("label") or entry.get("title") or "")) or "Additional"
        details = _skill_entry_items(entry)

        existing_group_labels.add(label.lower())
        skill_groups.append(
            {
                "label": label,
                "values": details,
            }
        )

    certifications = _text_list(sections.get("certifications"))
    if certifications:
        cert_label = _default_group_label_for_id("certificationsTraining", base_resume_data)
        if cert_label.lower() not in existing_group_labels:
            skill_groups.append(
                {
                    "label": cert_label,
                    "values": certifications,
                }
            )
            existing_group_labels.add(cert_label.lower())

    awards = _text_list(sections.get("awards"))
    if awards:
        awards_label = _default_group_label_for_id("awards", base_resume_data)
        if awards_label.lower() not in existing_group_labels:
            skill_groups.append(
                {
                    "label": awards_label,
                    "values": awards,
                }
            )
            existing_group_labels.add(awards_label.lower())

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
                "position": _clean_text(item.get("position")) or "",
                "title": _clean_text(item.get("position")) or "",
                "company": _clean_text(item.get("company")) or "",
                "location": _clean_text(item.get("location")),
                "start_date": _clean_text(item.get("start_date")),
                "end_date": _clean_text(item.get("end_date")),
                "date": _resume_date_label(item),
                "years": _resume_date_label(item),
                "summary": summary,
                "highlights": _text_list(item.get("highlights")),
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
                "area": _clean_text(item.get("area")) or "",
                "degree": _clean_text(item.get("degree")),
                "location": _clean_text(item.get("location")),
                "start_date": _clean_text(item.get("start_date")),
                "end_date": _clean_text(item.get("end_date")),
                "date": _resume_date_label(item),
                "years": _resume_date_label(item),
                "summary": _clean_text(item.get("summary")),
                "highlights": _text_list(item.get("highlights")),
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
        name, github, website = _parse_project_name_and_links(item.get("name"))
        if not website:
            legacy_name, legacy_website = _parse_markdown_link(item.get("name"))
            if legacy_name:
                name = legacy_name
            if legacy_website:
                website = _ensure_absolute_url(legacy_website)
        stack = _clean_text(item.get("tech_stacks") or item.get("summary"))
        projects.append(
            {
                "id": index,
                "name": name or "",
                "summary": stack,
                "role": _clean_text(item.get("role")) or stack or "",
                "date": _clean_text(item.get("date")) or "",
                "years": _clean_text(item.get("date")) or "",
                "github": github,
                "website": website,
                "highlights": _text_list(item.get("highlights")),
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

    legacy_personal_info = {
        "website": _clean_text(cv_payload.get("website")),
        "linkedin": social_lookup.get("linkedin"),
        "github": social_lookup.get("github"),
        "socialNetworks": social_networks,
        "customConnections": [
            item
            for item in cv_payload.get("custom_connections") or []
            if isinstance(item, dict)
        ],
    }

    resume_data.update(
        {
            "personalInfo": {
                **(resume_data.get("personalInfo") or {}),
                "name": cv_payload.get("name") or "",
                "headline": _clean_text(cv_payload.get("headline")) or "",
                "title": _clean_text(cv_payload.get("headline")) or "",
                "email": _clean_text(cv_payload.get("email")) or "",
                "phone": _clean_text(cv_payload.get("phone")) or "",
                "location": _clean_text(cv_payload.get("location")) or "",
                **legacy_personal_info,
                "photo": _clean_text(cv_payload.get("photo")),
                "photoUrl": _clean_text(cv_payload.get("photo")),
                "profileLinks": _profile_links(legacy_personal_info),
            },
            "summary": summary_items[0] if summary_items else "",
            "workExperience": work_experience,
            "education": education,
            "personalProjects": projects,
            "skills": normalize_skill_groups(
                {"groups": skill_groups}
                if skill_groups
                else resume_data.get("skills") or resume_data.get("additional") or default_skills_section()
            ),
            "additional": normalize_additional_groups(
                {"groups": skill_groups}
                if skill_groups
                else resume_data.get("skills") or resume_data.get("additional") or default_skills_section()
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
