"""Theme profile normalization tests."""

import app.rendering.theme_profiles as theme_profiles
from app.rendering.theme_profiles import (
    RenderThemeSettings,
    build_design,
    migrate_legacy_theme_settings,
    theme_settings_from_rendercv_sections,
)


def test_migrate_legacy_theme_settings_creates_sparse_theme_profiles() -> None:
    legacy = RenderThemeSettings(
        theme_id="moderncv",
        page_size="A4",
        density_profile="compact",
        accent_color="green",
        show_contact_icons=True,
        margins_mm={"top": 12, "bottom": 12, "left": 11, "right": 11},
    )

    migrated = migrate_legacy_theme_settings(legacy)

    assert migrated.uses_theme_profiles is True
    assert "moderncv" in migrated.theme_profiles
    assert migrated.theme_profiles["moderncv"].density_profile == "compact"
    assert migrated.to_storage_dict()["theme_profiles"]["moderncv"]["density_profile"] == "compact"


def test_build_design_uses_only_the_active_theme_profile() -> None:
    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "harvard",
            "theme_profiles": {
                "classic": {
                    "design": {"colors": {"name": "#ff0000"}},
                },
                "harvard": {
                    "show_contact_icons": False,
                    "design": {"header": {"alignment": "right"}},
                },
            },
        },
        uses_theme_profiles=True,
    )

    design = build_design(settings)

    assert design["theme"] == "harvard"
    assert design["header"]["alignment"] == "right"
    assert design["header"]["connections"]["show_icons"] is False
    assert design["colors"]["name"] != "#ff0000"
    assert design["page"]["size"] == "us-letter"
    assert "education_entry" in design["templates"]


def test_build_design_keeps_legacy_flat_payload_behavior() -> None:
    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "page_size": "A4",
            "density_profile": "compact",
            "accent_color": "green",
            "show_contact_icons": True,
            "margins_mm": {"top": 10, "bottom": 10, "left": 10, "right": 10},
            "design": {"colors": {"links": "rgb(255, 0, 0)"}},
        },
        uses_theme_profiles=False,
    )

    design = build_design(settings)

    assert design["theme"] == "classic"
    assert design["page"]["size"] == "a4"
    assert design["colors"]["name"] == "rgb(21, 128, 61)"
    assert design["colors"]["links"] == "rgb(0, 79, 144)"
    assert design["header"]["connections"]["show_icons"] is True


def test_build_design_keeps_fixed_link_color_for_theme_profile_overrides() -> None:
    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {
                "classic": {
                    "accent_color": "red",
                    "design": {"colors": {"links": "rgb(0, 0, 0)"}},
                }
            },
        },
        uses_theme_profiles=True,
    )

    design = build_design(settings)

    assert design["colors"]["name"] == "rgb(220, 38, 38)"
    assert design["colors"]["links"] == "rgb(0, 79, 144)"


def test_build_design_resolves_freeflow_with_a4_typst_width() -> None:
    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {
                "classic": {
                    "page_size": "FREEFLOW",
                }
            },
        },
        uses_theme_profiles=True,
    )

    design = build_design(settings)

    assert settings.page_size == "FREEFLOW"
    # Physical width comes from merged theme baseline (classic defaults to us-letter in baselines).
    assert design["page"]["size"] in ("a4", "us-letter")


def test_build_design_falls_back_from_missing_calibri(monkeypatch) -> None:
    monkeypatch.setattr(theme_profiles, "_font_family_available", lambda _font: False)
    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {
                "classic": {
                    "design": {
                        "typography": {
                            "font_family": {
                                "body": "Calibri",
                                "name": "Calibri",
                            }
                        }
                    }
                }
            },
        },
        uses_theme_profiles=True,
    )

    design = build_design(settings)

    assert design["typography"]["font_family"]["body"] == "Arial"
    assert design["typography"]["font_family"]["name"] == "Arial"


def test_theme_settings_from_rendercv_sections_preserves_app_runtime_settings() -> None:
    base = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {},
            "settings": {
                "current_date": "today",
                "show_summary_heading": False,
                "resume_workbench_style": {
                    "colors": {"company": "#123456"},
                },
            },
        },
        uses_theme_profiles=True,
    )

    parsed = theme_settings_from_rendercv_sections(
        design=build_design(base),
        locale={"language": "english"},
        settings={"current_date": "2026-04-13"},
        base_settings=base,
    )

    assert parsed.settings["current_date"] == "2026-04-13"
    assert parsed.settings["show_summary_heading"] is False
    assert parsed.settings["resume_workbench_style"] == {
        "colors": {"company": "#123456"},
    }
