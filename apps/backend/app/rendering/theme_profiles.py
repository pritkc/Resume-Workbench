"""Curated RenderCV theme profiles."""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Literal


ThemeId = Literal["classic", "moderncv"]
PageSize = Literal["A4", "LETTER"]
DensityProfile = Literal["compact", "balanced", "spacious"]
AccentColor = Literal["blue", "green", "orange", "red"]


@dataclass(frozen=True)
class RenderThemeSettings:
    theme_id: ThemeId = "classic"
    page_size: PageSize = "A4"
    density_profile: DensityProfile = "balanced"
    bold_keywords: bool = False
    accent_color: AccentColor = "blue"
    show_contact_icons: bool = False
    margins_mm: dict[str, int] = field(
        default_factory=lambda: {"top": 10, "bottom": 10, "left": 10, "right": 10}
    )

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


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
        "regular_entries": "1em",
        "text_entries": "0.24em",
    },
    "spacious": {
        "line_spacing": "0.72em",
        "regular_entries": "1.2em",
        "text_entries": "0.32em",
    },
}


def _mm_to_inches(value: int) -> str:
    return f"{value / 25.4:.2f}in"


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
    theme_id: ThemeId = "moderncv" if "modern" in template else "classic"
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


def build_design(settings: RenderThemeSettings) -> dict[str, object]:
    density = _DENSITY_MAP[settings.density_profile]
    accent = _ACCENT_COLORS[settings.accent_color]

    return {
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
            "type": "moderncv" if settings.theme_id == "moderncv" else "with_partial_line"
        },
    }
