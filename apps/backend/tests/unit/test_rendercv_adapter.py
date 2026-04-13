"""RenderCV adapter tests."""

import copy
import yaml

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
        group for group in parsed_resume["additional"]["groups"] if group["label"] == "Technical Skills"
    )
    assert technical_group["items"] == sample_resume["additional"]["technicalSkills"]
    assert parsed_theme.theme_id == "engineeringresumes"


def test_rendercv_yaml_sections_emit_full_resolved_design(sample_resume: dict) -> None:
    theme_settings = RenderThemeSettings.from_payload(
        {"theme_id": "moderncv", "theme_profiles": {}},
        uses_theme_profiles=True,
    )

    sections = rendercv_payload_to_yaml_sections(sample_resume, theme_settings)
    design = yaml.safe_load(sections["design"])["design"]

    assert design["theme"] == "moderncv"
    assert design["page"]["show_footer"] is True
    assert design["page"]["show_top_note"] is True
    assert design["header"]["alignment"] == "left"
    assert design["templates"]["education_entry"]["degree_column"] is None


def test_rendercv_adapter_prefers_description_over_highlights(sample_resume_copy: dict) -> None:
    sample_resume_copy["workExperience"][0]["description"] = [
        "Canonical tailored bullet",
        "Another canonical tailored bullet",
    ]
    sample_resume_copy["workExperience"][0]["highlights"] = [
        "Legacy stale bullet",
    ]
    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )

    assert payload["cv"]["sections"]["experience"][0]["highlights"] == [
        "Canonical tailored bullet",
        "Another canonical tailored bullet",
    ]


def test_rendercv_adapter_limits_auto_bold_keywords_to_experience_and_project_bullets(
    sample_resume_copy: dict,
) -> None:
    themed_resume = copy.deepcopy(sample_resume_copy)
    themed_resume["summary"] = "FastAPI engineer with platform focus."
    themed_resume["workExperience"][0]["description"] = [
        "Built FastAPI services and Kubernetes deployment tooling.",
    ]
    themed_resume["personalProjects"][0]["description"] = [
        "Created FastAPI utilities for Kubernetes maintenance tasks.",
    ]
    themed_resume["additional"]["technicalSkills"] = ["FastAPI", "Kubernetes", "Python"]

    payload = resume_to_rendercv_payload(
        themed_resume,
        RenderThemeSettings(
            theme_id="classic",
            bold_keywords=True,
            settings={"bold_keywords": ["FastAPI", "Kubernetes"]},
        ),
    )

    experience_bullets = payload["cv"]["sections"]["experience"][0]["highlights"]
    project_bullets = payload["cv"]["sections"]["projects"][0]["highlights"]

    assert experience_bullets == [
        "Built **FastAPI** services and **Kubernetes** deployment tooling."
    ]
    assert project_bullets == [
        "Created **FastAPI** utilities for **Kubernetes** maintenance tasks."
    ]
    assert payload["cv"]["sections"]["summary"] == ["FastAPI engineer with platform focus."]
    assert payload["cv"]["sections"]["skills"][0]["details"].startswith("FastAPI, Kubernetes")
    assert "bold_keywords" not in payload.get("settings", {})


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
        group for group in parsed_resume["additional"]["groups"] if group["label"] == "Languages & Frameworks"
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
        {"label": "ML", "items": ["PyTorch", "TensorFlow"]}
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


def test_rendercv_adapter_round_trip_preserves_rendercv_native_fields(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["personalInfo"].update(
        {
            "headline": "Data Infrastructure Engineer",
            "photo": "https://example.com/photo.jpg",
            "socialNetworks": [{"network": "LinkedIn", "username": "janedoe"}],
            "customConnections": [
                {
                    "placeholder": "Portfolio",
                    "url": "portfolio.example.com",
                    "fontawesome_icon": "fa-solid fa-link",
                }
            ],
        }
    )
    sample_resume_copy["workExperience"][0].update(
        {
            "position": "Software Engineer, Data Infra & MLOps",
            "date": "Jan 2021 - Present",
            "summary": "Owned platform reliability and delivery for ML systems.",
            "description": [
                "Built a CDC-powered ETL pipeline for production embeddings.",
                "Improved retrieval latency by 35% with semantic caching.",
            ],
            "highlights": [
                "Built a CDC-powered ETL pipeline for production embeddings.",
                "Improved retrieval latency by 35% with semantic caching.",
            ],
        }
    )
    sample_resume_copy["education"][0].update(
        {
            "degree": None,
            "area": "Computer Science",
            "date": "2014 - 2018",
            "location": "Cambridge, MA",
            "summary": "GPA: 4.0",
            "highlights": ["Dean's List", "Distributed systems capstone"],
        }
    )
    sample_resume_copy["personalProjects"][0].update(
        {
            "summary": "Open-source API tooling project.",
            "date": "Mar 2021 - Present",
            "description": [
                "500+ GitHub stars",
                "Used by 30+ engineering teams",
            ],
            "highlights": [
                "500+ GitHub stars",
                "Used by 30+ engineering teams",
            ],
        }
    )

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )

    assert payload["cv"]["headline"] == "Data Infrastructure Engineer"
    assert payload["cv"]["photo"] == "https://example.com/photo.jpg"
    assert payload["cv"]["custom_connections"] == [
        {
            "placeholder": "Portfolio",
            "url": "https://portfolio.example.com",
            "fontawesome_icon": "link",
        }
    ]
    assert payload["cv"]["sections"]["experience"][0] == {
        "company": "Acme Corp",
        "position": "Software Engineer, Data Infra & MLOps",
        "date": "Jan 2021 - Present",
        "location": "San Francisco, CA",
        "summary": "Owned platform reliability and delivery for ML systems.",
        "highlights": [
            "Built a CDC-powered ETL pipeline for production embeddings.",
            "Improved retrieval latency by 35% with semantic caching.",
        ],
    }
    assert payload["cv"]["sections"]["education"][0] == {
        "institution": "MIT",
        "area": "Computer Science",
        "degree": None,
        "date": "2014 - 2018",
        "location": "Cambridge, MA",
        "summary": "GPA: 4.0",
        "highlights": ["Dean's List", "Distributed systems capstone"],
    }
    assert payload["cv"]["sections"]["projects"][0] == {
        "name": "OpenAPI Generator",
        "date": "Mar 2021 - Present",
        "summary": "Open-source API tooling project.",
        "highlights": ["500+ GitHub stars", "Used by 30+ engineering teams"],
    }

    sections = rendercv_payload_to_yaml_sections(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )
    parsed_resume, _ = parse_rendercv_yaml_sections(
        sections,
        base_resume_data=sample_resume_copy,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    assert parsed_resume["personalInfo"]["headline"] == "Data Infrastructure Engineer"
    assert parsed_resume["personalInfo"]["photo"] == "https://example.com/photo.jpg"
    assert parsed_resume["personalInfo"]["profileLinks"] == [
        {
            "label": "Portfolio",
            "url": "https://portfolio.example.com",
            "fontawesome_icon": "link",
        },
        {
            "label": "Website",
            "url": "https://janedoe.dev",
            "fontawesome_icon": "link",
        },
        {
            "label": "LinkedIn",
            "url": "https://linkedin.com/in/janedoe",
            "fontawesome_icon": "linkedin-in",
        },
        {
            "label": "GitHub",
            "url": "https://github.com/janedoe",
            "fontawesome_icon": "github",
        },
    ]
    assert parsed_resume["workExperience"][0]["position"] == "Software Engineer, Data Infra & MLOps"
    assert parsed_resume["workExperience"][0]["summary"] == "Owned platform reliability and delivery for ML systems."
    assert parsed_resume["workExperience"][0]["highlights"] == [
        "Built a CDC-powered ETL pipeline for production embeddings.",
        "Improved retrieval latency by 35% with semantic caching.",
    ]
    assert parsed_resume["education"][0]["area"] == "Computer Science"
    assert parsed_resume["education"][0]["summary"] == "GPA: 4.0"
    assert parsed_resume["education"][0]["highlights"] == [
        "Dean's List",
        "Distributed systems capstone",
    ]
    assert parsed_resume["personalProjects"][0]["summary"] == "Open-source API tooling project."
    assert parsed_resume["personalProjects"][0]["highlights"] == [
        "500+ GitHub stars",
        "Used by 30+ engineering teams",
    ]


def test_rendercv_adapter_prefers_split_dates_and_preserves_profile_links(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["personalInfo"] = {
        **sample_resume_copy["personalInfo"],
        "profileLinks": [
            {
                "label": "Portfolio",
                "url": "portfolio.example.com",
                "fontawesome_icon": "fa-solid fa-link",
            },
            {
                "label": "LinkedIn",
                "url": "https://linkedin.com/in/janedoe",
                "fontawesome_icon": "fa-brands fa-linkedin-in",
            },
        ],
    }
    sample_resume_copy["workExperience"][0].update(
        {
            "date": "",
            "years": "",
            "start_date": "2021-01",
            "end_date": "present",
        }
    )
    sample_resume_copy["education"][0].update(
        {
            "date": "",
            "years": "",
            "degree": "B.S.",
            "area": "",
            "start_date": "2014",
            "end_date": "2018",
        }
    )

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )

    assert payload["cv"]["website"] is None
    assert payload["cv"]["social_networks"] == [{"network": "LinkedIn", "username": "janedoe"}]
    assert payload["cv"]["custom_connections"] == [
        {
            "placeholder": "Portfolio",
            "url": "https://portfolio.example.com",
            "fontawesome_icon": "link",
        }
    ]
    assert payload["cv"]["sections"]["experience"][0]["start_date"] == "2021-01"
    assert payload["cv"]["sections"]["experience"][0]["end_date"] == "present"
    assert "date" not in payload["cv"]["sections"]["experience"][0]
    assert payload["cv"]["sections"]["education"][0]["area"] == "B.S."
    assert payload["cv"]["sections"]["education"][0]["degree"] == "B.S."
    assert payload["cv"]["sections"]["education"][0]["start_date"] == "2014"
    assert payload["cv"]["sections"]["education"][0]["end_date"] == "2018"
    assert "date" not in payload["cv"]["sections"]["education"][0]

    parsed_resume, _ = parse_rendercv_yaml_sections(
        rendercv_payload_to_yaml_sections(sample_resume_copy, RenderThemeSettings(theme_id="classic")),
        base_resume_data=sample_resume_copy,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    assert parsed_resume["workExperience"][0]["start_date"] == "2021-01"
    assert parsed_resume["workExperience"][0]["end_date"] == "present"
    assert parsed_resume["workExperience"][0]["date"] == "2021-01 - present"
    assert parsed_resume["education"][0]["start_date"] == "2014"
    assert parsed_resume["education"][0]["end_date"] == "2018"
    assert parsed_resume["education"][0]["date"] == "2014 - 2018"
    assert parsed_resume["personalInfo"]["profileLinks"] == [
        {
            "label": "Portfolio",
            "url": "https://portfolio.example.com",
            "fontawesome_icon": "link",
        },
        {
            "label": "LinkedIn",
            "url": "https://linkedin.com/in/janedoe",
            "fontawesome_icon": "linkedin-in",
        },
    ]
