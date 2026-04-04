"""RenderCV theme profile helpers."""

from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
from functools import lru_cache
import json
from pathlib import Path
from typing import Any, Literal


ThemeId = Literal[
    "classic",
    "moderncv",
    "sb2nov",
    "engineeringresumes",
    "engineeringclassic",
    "harvard",
    "opal",
    "ember",
    "ink",
]
PageSize = Literal["A4", "LETTER"]
DensityProfile = Literal["compact", "balanced", "spacious"]
AccentColor = Literal["blue", "green", "orange", "red"]

DEFAULT_THEME_ID: ThemeId = "classic"
DEFAULT_MARGINS_MM = {"top": 10, "bottom": 10, "left": 10, "right": 10}

THEME_OPTIONS = [
    {
        "id": "classic",
        "label": "Classic",
        "description": "Single-column ATS-safe layout inspired by polished academic resumes.",
    },
    {
        "id": "moderncv",
        "label": "ModernCV",
        "description": "RenderCV's stronger visual profile while keeping a professional reading order.",
    },
    {
        "id": "sb2nov",
        "label": "Sb2nov",
        "description": "Compact sidebar-free layout popular with software engineering students.",
    },
    {
        "id": "engineeringresumes",
        "label": "Engineering Resumes",
        "description": "Clean, dense engineering resume styling similar to the hosted editor.",
    },
    {
        "id": "engineeringclassic",
        "label": "Engineering Classic",
        "description": "Traditional engineering layout with restrained typography.",
    },
    {
        "id": "harvard",
        "label": "Harvard",
        "description": "Academic-style layout with a formal reading rhythm.",
    },
    {
        "id": "opal",
        "label": "Opal",
        "description": "Balanced modern theme with softer spacing and hierarchy.",
    },
    {
        "id": "ember",
        "label": "Ember",
        "description": "Warm, modern theme with stronger visual accents.",
    },
    {
        "id": "ink",
        "label": "Ink",
        "description": "High-contrast editorial styling for compact resumes.",
    },
]

_ACCENT_COLORS: dict[AccentColor, str] = {
    "blue": "rgb(0, 79, 144)",
    "green": "rgb(21, 128, 61)",
    "orange": "rgb(249, 115, 22)",
    "red": "rgb(220, 38, 38)",
}

_DENSITY_MAP: dict[DensityProfile, dict[str, str]] = {
    "compact": {
        "line_spacing": "0.48em",
        "regular_entries": "0.8em",
        "text_entries": "0.16em",
    },
    "balanced": {
        "line_spacing": "0.6em",
        "regular_entries": "1.2em",
        "text_entries": "0.3em",
    },
    "spacious": {
        "line_spacing": "0.72em",
        "regular_entries": "1.6em",
        "text_entries": "0.42em",
    },
}

_LEGACY_DENSITY_MAP: dict[DensityProfile, dict[str, str]] = {
    "compact": {
        "line_spacing": "0.48em",
        "regular_entries": "0.8em",
        "text_entries": "0.16em",
    },
    "balanced": {
        "line_spacing": "0.6em",
        "regular_entries": "1em",
        "text_entries": "0.24em",
    },
    "spacious": {
        "line_spacing": "0.72em",
        "regular_entries": "1.2em",
        "text_entries": "0.32em",
    },
}

_THEME_BASELINE_PATH = (
    Path(__file__).resolve().parents[3]
    / "frontend"
    / "lib"
    / "rendercv"
    / "theme-baselines.json"
)


def _normalize_theme_id(value: Any) -> ThemeId:
    if value in {
        "classic",
        "moderncv",
        "sb2nov",
        "engineeringresumes",
        "engineeringclassic",
        "harvard",
        "opal",
        "ember",
        "ink",
    }:
        return value
    return DEFAULT_THEME_ID


def _normalize_page_size(value: Any) -> PageSize:
    return "LETTER" if value == "LETTER" else "A4"


def _normalize_density(value: Any) -> DensityProfile:
    if value in {"compact", "balanced", "spacious"}:
        return value
    return "balanced"


def _normalize_accent(value: Any) -> AccentColor:
    if value in {"blue", "green", "orange", "red"}:
        return value
    return "blue"


def _mm_to_inches(value: int) -> str:
    return f"{value / 25.4:.2f}in"


def _dimension_to_mm(value: Any, fallback: int) -> int:
    if not isinstance(value, str) or not value.strip():
        return fallback

    normalized = value.strip().lower()
    numeric_text = "".join(ch for ch in normalized if ch.isdigit() or ch in ".-")
    try:
        numeric = float(numeric_text)
    except ValueError:
        return fallback

    if normalized.endswith("mm"):
        return round(numeric)
    if normalized.endswith("cm"):
        return round(numeric * 10)
    if normalized.endswith("pt"):
        return round((numeric / 72) * 25.4)
    if normalized.endswith("in"):
        return round(numeric * 25.4)
    if normalized.endswith("em") or normalized.endswith("ex"):
        return fallback
    return round(numeric * 25.4)


def _deep_merge(base: dict[str, Any], updates: dict[str, Any]) -> dict[str, Any]:
    merged = deepcopy(base)
    for key, value in updates.items():
        if value is None:
            merged[key] = None
            continue
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = _deep_merge(merged[key], value)
        else:
            merged[key] = deepcopy(value)
    return merged


def _deep_equal(left: Any, right: Any) -> bool:
    if left == right:
        return True
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(
            _deep_equal(left[index], right[index]) for index in range(len(left))
        )
    if isinstance(left, dict) and isinstance(right, dict):
        if set(left.keys()) != set(right.keys()):
            return False
        return all(_deep_equal(left[key], right[key]) for key in left)
    return False


def _deep_diff(base: Any, value: Any) -> Any:
    if _deep_equal(base, value):
        return None
    if isinstance(value, list):
        return deepcopy(value)
    if not isinstance(value, dict):
        return deepcopy(value)

    base_dict = base if isinstance(base, dict) else {}
    output: dict[str, Any] = {}
    for key, nested_value in value.items():
        diff = _deep_diff(base_dict.get(key), nested_value)
        if diff is not None:
            output[key] = diff
    return output or None


def _normalize_color(value: Any) -> str | None:
    if not isinstance(value, str) or not value:
        return None
    return "".join(value.lower().split())


@lru_cache(maxsize=1)
def _load_theme_baselines() -> dict[str, dict[str, Any]]:
    return json.loads(_THEME_BASELINE_PATH.read_text(encoding="utf-8"))


@dataclass(frozen=True)
class ThemeProfileSettings:
    page_size: PageSize | None = None
    density_profile: DensityProfile | None = None
    accent_color: AccentColor | None = None
    show_contact_icons: bool | None = None
    margins_mm: dict[str, int] = field(default_factory=dict)
    design: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, object]:
        data: dict[str, object] = {}
        if self.page_size:
            data["page_size"] = self.page_size
        if self.density_profile:
            data["density_profile"] = self.density_profile
        if self.accent_color:
            data["accent_color"] = self.accent_color
        if self.show_contact_icons is not None:
            data["show_contact_icons"] = self.show_contact_icons
        if self.margins_mm:
            data["margins_mm"] = deepcopy(self.margins_mm)
        if self.design:
            data["design"] = deepcopy(self.design)
        return data


def _normalize_theme_profile(value: Any) -> ThemeProfileSettings:
    if not isinstance(value, dict):
        return ThemeProfileSettings()

    margins = value.get("margins_mm")
    normalized_margins = {
        key: int(raw)
        for key, raw in (margins.items() if isinstance(margins, dict) else [])
        if key in {"top", "bottom", "left", "right"}
        and isinstance(raw, (int, float))
    }

    return ThemeProfileSettings(
        page_size=_normalize_page_size(value.get("page_size"))
        if value.get("page_size") is not None
        else None,
        density_profile=_normalize_density(value.get("density_profile"))
        if value.get("density_profile") is not None
        else None,
        accent_color=_normalize_accent(value.get("accent_color"))
        if value.get("accent_color") is not None
        else None,
        show_contact_icons=bool(value.get("show_contact_icons"))
        if value.get("show_contact_icons") is not None
        else None,
        margins_mm=normalized_margins,
        design=deepcopy(value.get("design")) if isinstance(value.get("design"), dict) else {},
    )


def _normalize_theme_profiles(value: Any) -> dict[ThemeId, ThemeProfileSettings]:
    if not isinstance(value, dict):
        return {}

    profiles: dict[ThemeId, ThemeProfileSettings] = {}
    for option in THEME_OPTIONS:
        theme_id = option["id"]
        profile = _normalize_theme_profile(value.get(theme_id))
        if profile.to_dict():
            profiles[theme_id] = profile
    return profiles


def get_theme_design_baseline(theme_id: ThemeId) -> dict[str, Any]:
    baselines = _load_theme_baselines()
    classic = deepcopy(baselines["classic"])
    if theme_id == "classic":
        return classic
    merged = _deep_merge(classic, deepcopy(baselines.get(theme_id, {"theme": theme_id})))
    merged["theme"] = theme_id
    return merged


def _infer_accent_from_design(design: dict[str, Any]) -> AccentColor:
    colors = design.get("colors") if isinstance(design.get("colors"), dict) else {}
    candidates = [
        _normalize_color(colors.get("name")),
        _normalize_color(colors.get("headline")),
        _normalize_color(colors.get("connections")),
        _normalize_color(colors.get("section_titles")),
        _normalize_color(colors.get("links")),
    ]
    candidates = [candidate for candidate in candidates if candidate]

    for accent, rgb in _ACCENT_COLORS.items():
        normalized_rgb = _normalize_color(rgb)
        if candidates and all(candidate == normalized_rgb for candidate in candidates):
            return accent

    name_color = _normalize_color(colors.get("name"))
    for accent, rgb in _ACCENT_COLORS.items():
        if name_color == _normalize_color(rgb):
            return accent

    return "blue"


def _infer_density_from_design(design: dict[str, Any]) -> DensityProfile:
    typography = design.get("typography") if isinstance(design.get("typography"), dict) else {}
    sections = design.get("sections") if isinstance(design.get("sections"), dict) else {}
    line_spacing = typography.get("line_spacing")
    regular_entries = sections.get("space_between_regular_entries")
    text_entries = sections.get("space_between_text_based_entries")

    for density, values in _DENSITY_MAP.items():
        if (
            line_spacing == values["line_spacing"]
            and regular_entries == values["regular_entries"]
            and text_entries == values["text_entries"]
        ):
            return density

    return "balanced"


def _resolve_theme_profile_state(
    theme_id: ThemeId,
    profile: ThemeProfileSettings | None,
) -> dict[str, Any]:
    active_profile = profile or ThemeProfileSettings()
    design = _deep_merge(get_theme_design_baseline(theme_id), active_profile.design)

    if active_profile.page_size:
        page = design.setdefault("page", {})
        page["size"] = "a4" if active_profile.page_size == "A4" else "us-letter"

    if active_profile.margins_mm:
        page = design.setdefault("page", {})
        if "top" in active_profile.margins_mm:
            page["top_margin"] = _mm_to_inches(active_profile.margins_mm["top"])
        if "bottom" in active_profile.margins_mm:
            page["bottom_margin"] = _mm_to_inches(active_profile.margins_mm["bottom"])
        if "left" in active_profile.margins_mm:
            page["left_margin"] = _mm_to_inches(active_profile.margins_mm["left"])
        if "right" in active_profile.margins_mm:
            page["right_margin"] = _mm_to_inches(active_profile.margins_mm["right"])

    if active_profile.show_contact_icons is not None:
        header = design.setdefault("header", {})
        connections = header.setdefault("connections", {})
        connections["show_icons"] = active_profile.show_contact_icons

    if active_profile.density_profile:
        typography = design.setdefault("typography", {})
        sections = design.setdefault("sections", {})
        density_values = _DENSITY_MAP[active_profile.density_profile]
        typography["line_spacing"] = density_values["line_spacing"]
        sections["space_between_regular_entries"] = density_values["regular_entries"]
        sections["space_between_text_based_entries"] = density_values["text_entries"]

    if active_profile.accent_color:
        colors = design.setdefault("colors", {})
        accent = _ACCENT_COLORS[active_profile.accent_color]
        for key in ("name", "headline", "connections", "section_titles", "links"):
            colors[key] = accent

    page = design.get("page") if isinstance(design.get("page"), dict) else {}
    page_size: PageSize = (
        "LETTER" if page.get("size") == "us-letter" else "A4"
    )
    margins_mm = {
        "top": _dimension_to_mm(page.get("top_margin"), DEFAULT_MARGINS_MM["top"]),
        "bottom": _dimension_to_mm(page.get("bottom_margin"), DEFAULT_MARGINS_MM["bottom"]),
        "left": _dimension_to_mm(page.get("left_margin"), DEFAULT_MARGINS_MM["left"]),
        "right": _dimension_to_mm(page.get("right_margin"), DEFAULT_MARGINS_MM["right"]),
    }
    connections = (
        design.get("header", {}).get("connections", {})
        if isinstance(design.get("header"), dict)
        else {}
    )
    show_contact_icons = (
        active_profile.show_contact_icons
        if active_profile.show_contact_icons is not None
        else bool(connections.get("show_icons", False))
    )

    design["theme"] = theme_id
    page["size"] = "a4" if page_size == "A4" else "us-letter"
    header = design.setdefault("header", {})
    header_connections = header.setdefault("connections", {})
    header_connections["show_icons"] = show_contact_icons

    return {
        "page_size": page_size,
        "density_profile": active_profile.density_profile or _infer_density_from_design(design),
        "accent_color": active_profile.accent_color or _infer_accent_from_design(design),
        "show_contact_icons": show_contact_icons,
        "margins_mm": margins_mm,
        "design": design,
    }


def _build_sparse_design_from_profile(
    theme_id: ThemeId,
    profile: ThemeProfileSettings | None,
) -> dict[str, Any]:
    active_profile = profile or ThemeProfileSettings()
    design: dict[str, Any] = {"theme": theme_id}

    if active_profile.page_size:
        design.setdefault("page", {})["size"] = (
            "a4" if active_profile.page_size == "A4" else "us-letter"
        )

    if active_profile.margins_mm:
        page = design.setdefault("page", {})
        if "top" in active_profile.margins_mm:
            page["top_margin"] = _mm_to_inches(active_profile.margins_mm["top"])
        if "bottom" in active_profile.margins_mm:
            page["bottom_margin"] = _mm_to_inches(active_profile.margins_mm["bottom"])
        if "left" in active_profile.margins_mm:
            page["left_margin"] = _mm_to_inches(active_profile.margins_mm["left"])
        if "right" in active_profile.margins_mm:
            page["right_margin"] = _mm_to_inches(active_profile.margins_mm["right"])

    if active_profile.show_contact_icons is not None:
        design.setdefault("header", {}).setdefault("connections", {})[
            "show_icons"
        ] = active_profile.show_contact_icons

    if active_profile.density_profile:
        density_values = _DENSITY_MAP[active_profile.density_profile]
        design.setdefault("typography", {})["line_spacing"] = density_values[
            "line_spacing"
        ]
        sections = design.setdefault("sections", {})
        sections["space_between_regular_entries"] = density_values["regular_entries"]
        sections["space_between_text_based_entries"] = density_values["text_entries"]

    if active_profile.accent_color:
        accent = _ACCENT_COLORS[active_profile.accent_color]
        colors = design.setdefault("colors", {})
        for key in ("name", "headline", "connections", "section_titles", "links"):
            colors[key] = accent

    if active_profile.design:
        design = _deep_merge(design, active_profile.design)

    design["theme"] = theme_id
    return design


@dataclass(frozen=True)
class RenderThemeSettings:
    theme_id: ThemeId = DEFAULT_THEME_ID
    page_size: PageSize = "A4"
    density_profile: DensityProfile = "balanced"
    bold_keywords: bool = False
    accent_color: AccentColor = "blue"
    show_contact_icons: bool = False
    margins_mm: dict[str, int] = field(
        default_factory=lambda: deepcopy(DEFAULT_MARGINS_MM)
    )
    design: dict[str, Any] = field(default_factory=dict)
    theme_profiles: dict[ThemeId, ThemeProfileSettings] = field(default_factory=dict)
    locale: dict[str, Any] = field(default_factory=dict)
    settings: dict[str, Any] = field(default_factory=dict)
    uses_theme_profiles: bool = False

    @classmethod
    def from_payload(
        cls,
        payload: dict[str, Any] | None = None,
        *,
        uses_theme_profiles: bool | None = None,
    ) -> "RenderThemeSettings":
        raw_payload = payload or {}
        theme_id = _normalize_theme_id(
            raw_payload.get("theme_id")
            or raw_payload.get("design", {}).get("theme")
            if isinstance(raw_payload.get("design"), dict)
            else raw_payload.get("theme_id")
        )
        uses_profiles = (
            ("theme_profiles" in raw_payload)
            if uses_theme_profiles is None
            else uses_theme_profiles
        )

        if uses_profiles:
            theme_profiles = _normalize_theme_profiles(raw_payload.get("theme_profiles"))
            resolved = _resolve_theme_profile_state(
                theme_id, theme_profiles.get(theme_id)
            )
            return cls(
                theme_id=theme_id,
                page_size=resolved["page_size"],
                density_profile=resolved["density_profile"],
                bold_keywords=bool(raw_payload.get("bold_keywords", False)),
                accent_color=resolved["accent_color"],
                show_contact_icons=resolved["show_contact_icons"],
                margins_mm=resolved["margins_mm"],
                design=resolved["design"],
                theme_profiles=theme_profiles,
                locale=deepcopy(raw_payload.get("locale") or {}),
                settings=deepcopy(raw_payload.get("settings") or {}),
                uses_theme_profiles=True,
            )

        margins = raw_payload.get("margins_mm")
        normalized_margins = {
            **DEFAULT_MARGINS_MM,
            **(
                {
                    key: int(value)
                    for key, value in margins.items()
                    if key in {"top", "bottom", "left", "right"}
                    and isinstance(value, (int, float))
                }
                if isinstance(margins, dict)
                else {}
            ),
        }

        return cls(
            theme_id=theme_id,
            page_size=_normalize_page_size(raw_payload.get("page_size")),
            density_profile=_normalize_density(raw_payload.get("density_profile")),
            bold_keywords=bool(raw_payload.get("bold_keywords", False)),
            accent_color=_normalize_accent(raw_payload.get("accent_color")),
            show_contact_icons=bool(raw_payload.get("show_contact_icons", False)),
            margins_mm=normalized_margins,
            design=deepcopy(raw_payload.get("design") or {}),
            locale=deepcopy(raw_payload.get("locale") or {}),
            settings=deepcopy(raw_payload.get("settings") or {}),
            uses_theme_profiles=False,
        )

    def to_dict(self) -> dict[str, object]:
        data: dict[str, object] = {
            "theme_id": self.theme_id,
            "page_size": self.page_size,
            "density_profile": self.density_profile,
            "bold_keywords": self.bold_keywords,
            "accent_color": self.accent_color,
            "show_contact_icons": self.show_contact_icons,
            "margins_mm": deepcopy(self.margins_mm),
            "design": deepcopy(self.design),
            "locale": deepcopy(self.locale),
            "settings": deepcopy(self.settings),
        }
        if self.uses_theme_profiles or self.theme_profiles:
            data["theme_profiles"] = {
                theme_id: profile.to_dict()
                for theme_id, profile in self.theme_profiles.items()
                if profile.to_dict()
            }
        return data

    def to_storage_dict(self) -> dict[str, object]:
        if self.uses_theme_profiles or self.theme_profiles:
            return {
                "theme_id": self.theme_id,
                "bold_keywords": self.bold_keywords,
                "locale": deepcopy(self.locale),
                "settings": deepcopy(self.settings),
                "theme_profiles": {
                    theme_id: profile.to_dict()
                    for theme_id, profile in self.theme_profiles.items()
                    if profile.to_dict()
                },
            }

        return {
            "theme_id": self.theme_id,
            "page_size": self.page_size,
            "density_profile": self.density_profile,
            "bold_keywords": self.bold_keywords,
            "accent_color": self.accent_color,
            "show_contact_icons": self.show_contact_icons,
            "margins_mm": deepcopy(self.margins_mm),
            "design": deepcopy(self.design),
            "locale": deepcopy(self.locale),
            "settings": deepcopy(self.settings),
        }


def legacy_to_theme_settings(
    *,
    template: str = "swiss-single",
    page_size: PageSize = "A4",
    compact_mode: bool = False,
    section_spacing: int = 3,
    item_spacing: int = 2,
    line_height: int = 3,
    accent_color: AccentColor = "blue",
    show_contact_icons: bool = False,
    margin_top: int = 10,
    margin_bottom: int = 10,
    margin_left: int = 10,
    margin_right: int = 10,
) -> RenderThemeSettings:
    template_to_theme: dict[str, ThemeId] = {
        "modern": "moderncv",
        "moderncv": "moderncv",
        "modern-one-column": "moderncv",
        "modern-two-column": "moderncv",
        "classic": "classic",
        "swiss-single": "classic",
        "swiss-two-column": "classic",
        "sb2nov": "sb2nov",
        "engineeringresumes": "engineeringresumes",
        "engineeringclassic": "engineeringclassic",
        "harvard": "harvard",
        "opal": "opal",
        "ember": "ember",
        "ink": "ink",
    }
    theme_id: ThemeId = template_to_theme.get(template, "classic")
    if compact_mode or (section_spacing <= 2 and item_spacing <= 2 and line_height <= 2):
        density_profile: DensityProfile = "compact"
    elif section_spacing >= 4 or item_spacing >= 4 or line_height >= 4:
        density_profile = "spacious"
    else:
        density_profile = "balanced"

    return RenderThemeSettings(
        theme_id=theme_id,
        page_size=page_size,
        density_profile=density_profile,
        accent_color=accent_color,
        show_contact_icons=show_contact_icons,
        margins_mm={
            "top": margin_top,
            "bottom": margin_bottom,
            "left": margin_left,
            "right": margin_right,
        },
    )


def migrate_legacy_theme_settings(settings: RenderThemeSettings) -> RenderThemeSettings:
    legacy_design = build_design(settings)
    baseline_state = _resolve_theme_profile_state(settings.theme_id, ThemeProfileSettings())
    design_diff = _deep_diff(get_theme_design_baseline(settings.theme_id), legacy_design)

    profile = ThemeProfileSettings(
        page_size=settings.page_size
        if settings.page_size != baseline_state["page_size"]
        else None,
        density_profile=settings.density_profile
        if settings.density_profile != baseline_state["density_profile"]
        else None,
        accent_color=settings.accent_color
        if settings.accent_color != baseline_state["accent_color"]
        else None,
        show_contact_icons=settings.show_contact_icons
        if settings.show_contact_icons != baseline_state["show_contact_icons"]
        else None,
        margins_mm=(
            deepcopy(settings.margins_mm)
            if not _deep_equal(settings.margins_mm, baseline_state["margins_mm"])
            else {}
        ),
        design=design_diff if isinstance(design_diff, dict) else {},
    )

    payload: dict[str, Any] = {
        "theme_id": settings.theme_id,
        "bold_keywords": settings.bold_keywords,
        "locale": deepcopy(settings.locale),
        "settings": deepcopy(settings.settings),
        "theme_profiles": {},
    }
    if profile.to_dict():
        payload["theme_profiles"] = {settings.theme_id: profile.to_dict()}

    return RenderThemeSettings.from_payload(payload, uses_theme_profiles=True)


def build_design(settings: RenderThemeSettings) -> dict[str, object]:
    if settings.uses_theme_profiles:
        return _build_sparse_design_from_profile(
            settings.theme_id, settings.theme_profiles.get(settings.theme_id)
        )

    density = _LEGACY_DENSITY_MAP[settings.density_profile]
    accent = _ACCENT_COLORS[settings.accent_color]
    legacy_design: dict[str, Any] = {
        "theme": settings.theme_id,
        "page": {
            "size": "a4" if settings.page_size == "A4" else "us-letter",
            "top_margin": _mm_to_inches(settings.margins_mm["top"]),
            "bottom_margin": _mm_to_inches(settings.margins_mm["bottom"]),
            "left_margin": _mm_to_inches(settings.margins_mm["left"]),
            "right_margin": _mm_to_inches(settings.margins_mm["right"]),
        },
        "colors": {
            "name": accent,
            "headline": accent,
            "connections": accent,
            "section_titles": accent,
            "links": accent,
        },
        "header": {
            "connections": {
                "show_icons": settings.show_contact_icons,
                "display_urls_instead_of_usernames": False,
            }
        },
        "typography": {
            "line_spacing": density["line_spacing"],
            "bold": {
                "name": True,
                "section_titles": True,
            },
        },
        "sections": {
            "space_between_regular_entries": density["regular_entries"],
            "space_between_text_based_entries": density["text_entries"],
        },
        "section_titles": {
            "type": "moderncv"
            if settings.theme_id == "moderncv"
            else "with_partial_line"
        },
    }

    merged = _deep_merge({"theme": settings.theme_id}, legacy_design)
    if settings.design:
        merged = _deep_merge(merged, settings.design)
    merged["theme"] = settings.theme_id
    return merged


def build_locale(settings: RenderThemeSettings) -> dict[str, object] | None:
    if not settings.locale:
        return None
    locale = _deep_merge({"language": "english"}, settings.locale)
    return locale


def build_settings(settings: RenderThemeSettings) -> dict[str, object] | None:
    if not settings.settings:
        return None
    return _deep_merge({}, settings.settings)


def theme_settings_from_rendercv_sections(
    *,
    design: dict[str, Any] | None = None,
    locale: dict[str, Any] | None = None,
    settings: dict[str, Any] | None = None,
    base_settings: RenderThemeSettings | None = None,
) -> RenderThemeSettings:
    base = base_settings or RenderThemeSettings.from_payload(
        {"theme_id": DEFAULT_THEME_ID, "theme_profiles": {}},
        uses_theme_profiles=True,
    )
    design_payload = deepcopy(design or build_design(base))
    theme_id = _normalize_theme_id(design_payload.get("theme") or base.theme_id)
    design_payload["theme"] = theme_id

    page = design_payload.get("page") if isinstance(design_payload.get("page"), dict) else {}
    connections = (
        design_payload.get("header", {}).get("connections", {})
        if isinstance(design_payload.get("header"), dict)
        else {}
    )

    page_size: PageSize = (
        "LETTER"
        if page.get("size") == "us-letter"
        else ("A4" if page.get("size") == "a4" else base.page_size)
    )
    margins_mm = {
        "top": _dimension_to_mm(page.get("top_margin"), base.margins_mm["top"]),
        "bottom": _dimension_to_mm(page.get("bottom_margin"), base.margins_mm["bottom"]),
        "left": _dimension_to_mm(page.get("left_margin"), base.margins_mm["left"]),
        "right": _dimension_to_mm(page.get("right_margin"), base.margins_mm["right"]),
    }
    show_contact_icons = bool(
        connections.get("show_icons")
        if "show_icons" in connections
        else base.show_contact_icons
    )
    density_profile = _infer_density_from_design(design_payload)
    accent_color = _infer_accent_from_design(design_payload)

    baseline_state = _resolve_theme_profile_state(theme_id, ThemeProfileSettings())
    design_diff = _deep_diff(get_theme_design_baseline(theme_id), design_payload)

    next_profile = ThemeProfileSettings(
        page_size=page_size if page_size != baseline_state["page_size"] else None,
        density_profile=(
            density_profile
            if density_profile != baseline_state["density_profile"]
            else None
        ),
        accent_color=(
            accent_color if accent_color != baseline_state["accent_color"] else None
        ),
        show_contact_icons=(
            show_contact_icons
            if show_contact_icons != baseline_state["show_contact_icons"]
            else None
        ),
        margins_mm=(
            deepcopy(margins_mm)
            if not _deep_equal(margins_mm, baseline_state["margins_mm"])
            else {}
        ),
        design=design_diff if isinstance(design_diff, dict) else {},
    )

    theme_profiles = deepcopy(base.theme_profiles)
    if next_profile.to_dict():
        theme_profiles[theme_id] = next_profile
    elif theme_id in theme_profiles:
        del theme_profiles[theme_id]

    payload = {
        "theme_id": theme_id,
        "bold_keywords": base.bold_keywords,
        "locale": deepcopy(locale if locale is not None else base.locale),
        "settings": deepcopy(settings if settings is not None else base.settings),
        "theme_profiles": {
            key: profile.to_dict()
            for key, profile in theme_profiles.items()
            if profile.to_dict()
        },
    }
    return RenderThemeSettings.from_payload(payload, uses_theme_profiles=True)
