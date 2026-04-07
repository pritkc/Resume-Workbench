"""RenderCV adapter tests."""

from app.rendering.rendercv_adapter import (
    parse_rendercv_yaml_sections,
    rendercv_payload_to_yaml_sections,
    resume_to_rendercv_payload,
)
from app.rendering.theme_profiles import RenderThemeSettings


def test_rendercv_adapter_supports_classic_and_moderncv(sample_resume: dict) -> None:
    classic = resume_to_rendercv_payload(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
    )
    modern = resume_to_rendercv_payload(
        sample_resume,
        RenderThemeSettings(theme_id="moderncv", show_contact_icons=True),
    )

    assert classic["design"]["theme"] == "classic"
    assert modern["design"]["theme"] == "moderncv"
    assert classic["cv"]["name"] == sample_resume["personalInfo"]["name"]
    assert "experience" in classic["cv"]["sections"]
    assert modern["design"]["header"]["connections"]["show_icons"] is True


def test_rendercv_yaml_sections_round_trip_to_resume_and_theme(sample_resume: dict) -> None:
    theme_settings = RenderThemeSettings.from_payload(
        {"theme_id": "engineeringresumes", "theme_profiles": {}},
        uses_theme_profiles=True,
    )
    sections = rendercv_payload_to_yaml_sections(sample_resume, theme_settings)

    parsed_resume, parsed_theme = parse_rendercv_yaml_sections(
        sections,
        base_resume_data=sample_resume,
        base_theme_settings=theme_settings,
    )

    assert parsed_resume["personalInfo"]["name"] == sample_resume["personalInfo"]["name"]
    assert parsed_resume["workExperience"][0]["company"] == sample_resume["workExperience"][0]["company"]
    technical_group = next(
        group for group in parsed_resume["additional"]["groups"] if group["id"] == "technicalSkills"
    )
    assert technical_group["items"] == sample_resume["additional"]["technicalSkills"]
    assert parsed_theme.theme_id == "engineeringresumes"


def test_rendercv_yaml_sections_preserve_custom_skill_group_labels(sample_resume: dict) -> None:
    sections = {
        "cv": (
            "cv:\n"
            "  name: Jane Doe\n"
            "  sections:\n"
            "    skills:\n"
            "      - label: Languages & Frameworks\n"
            "        details: English, Python\n"
        ),
        "design": "design:\n  theme: classic\n",
        "locale": "locale:\n  language: english\n",
        "settings": "settings:\n  current_date: today\n",
    }

    parsed_resume, _ = parse_rendercv_yaml_sections(
        sections,
        base_resume_data=sample_resume,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    languages_group = next(
        group for group in parsed_resume["additional"]["groups"] if group["id"] == "languages"
    )
    assert languages_group["label"] == "Languages & Frameworks"
    assert languages_group["items"] == ["English", "Python"]


def test_rendercv_yaml_sections_support_skill_details_as_yaml_lists() -> None:
    sections = {
        "cv": (
            "cv:\n"
            "  name: Jane Doe\n"
            "  sections:\n"
            "    skills:\n"
            "      - label: ML\n"
            "        details:\n"
            "          - PyTorch\n"
            "          - TensorFlow\n"
        ),
        "design": "design:\n  theme: classic\n",
        "locale": "locale:\n  language: english\n",
        "settings": "settings:\n  current_date: today\n",
    }

    parsed_resume, _ = parse_rendercv_yaml_sections(
        sections,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    assert parsed_resume["additional"]["groups"] == [
        {"id": "ml", "label": "ML", "items": ["PyTorch", "TensorFlow"]}
    ]


def test_rendercv_social_round_trip_keeps_dedicated_networks_out_of_generic_list(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["personalInfo"]["socialNetworks"] = [
        {"network": "LinkedIn", "username": "janedoe"},
        {"network": "GitHub", "username": "janedoe"},
        {"network": "Mastodon", "username": "@jane"},
    ]

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )
    social_networks = payload["cv"]["social_networks"]

    assert [item for item in social_networks if item["network"] == "LinkedIn"] == [
        {"network": "LinkedIn", "username": "janedoe"}
    ]
    assert [item for item in social_networks if item["network"] == "GitHub"] == [
        {"network": "GitHub", "username": "janedoe"}
    ]

    parsed_resume, _ = parse_rendercv_yaml_sections(
        rendercv_payload_to_yaml_sections(sample_resume_copy, RenderThemeSettings(theme_id="classic")),
        base_resume_data=sample_resume_copy,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    assert parsed_resume["personalInfo"]["linkedin"] == "janedoe"
    assert parsed_resume["personalInfo"]["github"] == "janedoe"
    assert parsed_resume["personalInfo"]["socialNetworks"] == [
        {"network": "Mastodon", "username": "jane"}
    ]


def test_rendercv_round_trip_preserves_custom_section_display_name_and_key(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["customSections"] = {
        "publications": {
            "sectionType": "text",
            "text": "Published papers on distributed systems.",
        }
    }
    sample_resume_copy["sectionMeta"] = [
        *sample_resume_copy.get("sectionMeta", []),
        {
            "id": "publications",
            "key": "publications",
            "displayName": "Publications",
            "sectionType": "text",
            "isDefault": False,
            "isVisible": True,
            "order": 6,
        },
    ]

    sections = rendercv_payload_to_yaml_sections(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )
    parsed_resume, _ = parse_rendercv_yaml_sections(
        sections,
        base_resume_data=sample_resume_copy,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    assert parsed_resume["customSections"]["publications"]["sectionType"] == "text"
    custom_meta = next(
        meta
        for meta in parsed_resume["sectionMeta"]
        if meta["key"] == "publications"
    )
    assert custom_meta["displayName"] == "Publications"
