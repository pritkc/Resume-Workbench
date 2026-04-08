"""Theme profile normalization tests."""

from app.rendering.theme_profiles import (
    RenderThemeSettings,
    build_design,
    migrate_legacy_theme_settings,
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
        },
        uses_theme_profiles=False,
    )

    design = build_design(settings)

    assert design["theme"] == "classic"
    assert design["page"]["size"] == "a4"
    assert design["colors"]["name"] == "rgb(21, 128, 61)"
    assert design["header"]["connections"]["show_icons"] is True
