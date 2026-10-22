"""RenderCV adapter tests."""

import copy
import yaml

from app.rendering.rendercv_adapter import (
    parse_rendercv_yaml_sections,
    rendercv_cv_to_resume_data,
    rendercv_payload_to_yaml_sections,
    resume_to_rendercv_payload,
    summary_alignment_for_rendering,
    validate_markdown_emphasis_fields,
)
from app.rendering.theme_profiles import RenderThemeSettings
from app.schemas import ResumeData, normalize_resume_data


def test_experience_highlights_drop_duplicate_tech_stack_row() -> None:
    data = normalize_resume_data(
        {
            "workExperience": [
                {
                    "id": 1,
                    "position": "Engineer",
                    "company": "Co",
                    "techStack": "Python, AWS",
                    "highlights": ["Python, AWS", "Shipped APIs"],
                }
            ]
        }
    )
    exp = ResumeData.model_validate(data).workExperience[0]
    assert exp.techStack == "Python, AWS"
    assert exp.highlights == ["Shipped APIs"]


def test_rendercv_omits_projects_with_include_in_resume_false() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Visible Project",
                "years": "2024",
                "description": ["Shipped feature A"],
                "includeInResume": True,
            },
            {
                "id": 2,
                "name": "Hidden Project",
                "years": "2023",
                "description": ["Should not appear"],
                "includeInResume": False,
            },
        ],
        "skills": {"groups": []},
    }
    payload = resume_to_rendercv_payload(resume, RenderThemeSettings(theme_id="classic"))
    projects = payload["cv"]["sections"]["projects"]
    assert len(projects) == 1
    assert projects[0]["name"] == "Visible Project"


def test_hidden_default_and_custom_sections_stay_hidden_in_rendercv_payload() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "Summary",
        "workExperience": [{"position": "Engineer", "company": "Co"}],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
        "customSections": {"custom_1": {"sectionType": "stringList", "strings": ["Hidden"]}},
        "sectionMeta": [
            {"id": "summary", "key": "summary", "displayName": "Summary", "isDefault": True, "isVisible": False, "order": 1},
            {"id": "workExperience", "key": "workExperience", "displayName": "Experience", "isDefault": True, "isVisible": False, "order": 2},
            {"id": "custom_1", "key": "custom_1", "displayName": "Custom", "isDefault": False, "isVisible": False, "order": 3},
        ],
    }
    payload = resume_to_rendercv_payload(resume, RenderThemeSettings(theme_id="classic"))
    assert payload["cv"]["sections"] == {}


def test_custom_item_description_lists_render_as_highlights_and_round_trip() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
        "customSections": {
            "custom_1": {
                "sectionType": "itemList",
                "items": [{"id": 1, "title": "Volunteer", "subtitle": "Lead", "location": "Remote", "years": "2024", "description": ["Built a program", "Managed 5 people"]}],
            }
        },
        "sectionMeta": [{"id": "custom_1", "key": "custom_1", "displayName": "Community", "sectionType": "itemList", "isDefault": False, "isVisible": True, "order": 1}],
    }
    payload = resume_to_rendercv_payload(resume, RenderThemeSettings(theme_id="classic"))
    items = payload["cv"]["sections"]["Community"]
    assert items == [{"title": "Volunteer", "summary": "Lead", "location": "Remote", "date": "2024", "highlights": ["Built a program", "Managed 5 people"]}]
    parsed = parse_rendercv_yaml_sections(
        {"cv": yaml.safe_dump({"cv": {"name": "Jane", "sections": {"Community": items}}})},
        base_resume_data=resume,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )[0]
    section = next(iter(parsed["customSections"].values()))
    assert section["sectionType"] == "itemList"
    assert section["items"][0]["description"] == ["Built a program", "Managed 5 people"]


def test_explicit_empty_skills_clears_existing_skill_groups() -> None:
    base = {"skills": {"groups": [{"id": "technicalSkills", "label": "Technical Skills", "values": ["Python"]}]}}
    parsed = rendercv_cv_to_resume_data({"name": "Jane", "sections": {"skills": []}}, base_resume_data=base)
    assert parsed["skills"]["groups"] == []


def test_yaml_edit_preserves_hidden_projects_and_matches_visible_by_name() -> None:
    base = {
        "personalProjects": [
            {"id": 1, "name": "Hidden A", "includeInResume": False, "description": ["Keep"]},
            {"id": 2, "name": "Visible B", "includeInResume": True, "description": ["Old"]},
        ],
    }
    parsed = rendercv_cv_to_resume_data(
        {"name": "Jane", "sections": {"projects": [{"name": "Visible B", "highlights": ["Edited"]}]}},
        base_resume_data=base,
    )
    projects = parsed["personalProjects"]
    assert len(projects) == 2
    assert projects[0]["name"] == "Visible B"
    assert projects[0]["includeInResume"] is True
    assert projects[0]["id"] == 2
    assert projects[1]["name"] == "Hidden A"
    assert projects[1]["includeInResume"] is False


def test_skill_details_preserve_commas_inside_parentheses() -> None:
    parsed = rendercv_cv_to_resume_data(
        {"name": "Jane", "sections": {"skills": [{"label": "Technical Skills", "details": "AWS (Lambda, S3, RDS), Docker"}]}},
        base_resume_data={},
    )
    assert parsed["skills"]["groups"][0]["values"] == ["AWS (Lambda, S3, RDS)", "Docker"]


def test_multiple_summary_entries_are_rejected_with_yaml_path() -> None:
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError
    import pytest

    with pytest.raises(RenderCVYamlValidationError, match="one summary entry") as error:
        rendercv_cv_to_resume_data({"name": "Jane", "sections": {"summary": ["First", "Second"]}})
    assert error.value.path == ["cv", "sections", "summary"]


def test_unmapped_summary_entry_format_is_rejected_with_yaml_path() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="text entries only") as error:
        parse_rendercv_yaml_sections(
            {
                "cv": "cv:\n  name: Jane\n  sections:\n    summary:\n      - title: Summary\n",
                "design": "design:\n  theme: classic\n",
            },
            base_resume_data={},
            base_theme_settings=RenderThemeSettings(theme_id="classic"),
        )

    assert error.value.path == ["cv", "sections", "summary", "0"]


def test_yaml_rejects_unknown_rendercv_cv_fields_before_saving() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="does not preserve this field"):
        parse_rendercv_yaml_sections(
            {"cv": "cv:\n  name: Jane\n  hidden_feature: true\n", "design": "design:\n  theme: classic\n"},
            base_resume_data={},
            base_theme_settings=RenderThemeSettings(theme_id="classic"),
        )


def test_yaml_rejects_unmapped_custom_section_fields_with_path() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="does not preserve this field") as error:
        parse_rendercv_yaml_sections(
            {
                "cv": (
                    "cv:\n  name: Jane\n  sections:\n"
                    "    Publications:\n      - title: Paper\n        doi: 10.1234/example\n"
                ),
                "design": "design:\n  theme: classic\n",
            },
            base_resume_data={},
            base_theme_settings=RenderThemeSettings(theme_id="classic"),
        )

    assert error.value.path == ["cv", "sections", "Publications", "0", "doi"]


def test_yaml_preserves_supported_custom_section_entry_fields() -> None:
    parsed = rendercv_cv_to_resume_data(
        {
            "name": "Jane",
            "sections": {
                "Community Work": [
                    {
                        "title": "Mentor",
                        "summary": "Early-career engineers",
                        "location": "Remote",
                        "date": "2024",
                        "highlights": ["Held monthly sessions"],
                    }
                ]
            },
        },
        base_resume_data={},
    )

    item = parsed["customSections"]["custom_1"]["items"][0]
    assert item["title"] == "Mentor"
    assert item["subtitle"] == "Early-career engineers"
    assert item["location"] == "Remote"
    assert item["years"] == "2024"
    assert item["description"] == ["Held monthly sessions"]


def test_markdown_emphasis_validation_accepts_valid_or_literal_stars() -> None:
    for text in ("plain text", "2 * 3 = 6", "**valid bold**", r"literal \*\* markers"):
        validate_markdown_emphasis_fields({"summary": text})


def test_markdown_emphasis_validation_points_to_unmatched_summary_marker() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="Unmatched bold") as error:
        validate_markdown_emphasis_fields({"summary": "Broken **bold"})

    assert error.value.path == ["cv", "summary"]


def test_markdown_emphasis_validation_checks_custom_section_descriptions() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="Unmatched bold") as error:
        validate_markdown_emphasis_fields(
            {
                "customSections": {
                    "custom_1": {
                        "sectionType": "itemList",
                        "items": [{"title": "Mentor", "description": ["Led ** sessions"]}],
                    }
                }
            }
        )

    assert error.value.path == ["cv", "customSections", "custom_1", "items", "0", "description", "0"]


def test_markdown_emphasis_validation_points_to_unmatched_experience_bullet() -> None:
    import pytest
    from app.rendering.rendercv_adapter import RenderCVYamlValidationError

    with pytest.raises(RenderCVYamlValidationError, match="workExperience.0.description.1") as error:
        validate_markdown_emphasis_fields(
            {"workExperience": [{"description": ["Valid", "Broken **bold"]}]}
        )

    assert error.value.path == ["cv", "workExperience", "0", "description", "1"]


def test_project_highlights_drop_duplicate_tech_stack_row() -> None:
    data = normalize_resume_data(
        {
            "personalProjects": [
                {
                    "id": 1,
                    "name": "Demo",
                    "techStack": "Rust, WASM",
                    "highlights": ["Rust, WASM", "Shipped CLI"],
                }
            ]
        }
    )
    proj = ResumeData.model_validate(data).personalProjects[0]
    assert proj.techStack == "Rust, WASM"
    assert proj.highlights == ["Shipped CLI"]


def test_rendercv_experience_bullets_omit_stack_when_description_prefixed() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Eng",
                "company": "Acme",
                "techStack": "Go, gRPC",
                "description": ["Go, gRPC", "Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
    }
    payload = resume_to_rendercv_payload(resume, RenderThemeSettings(theme_id="classic"))
    assert payload["cv"]["sections"]["experience"][0]["summary"] == "**Stack:** Go • gRPC"
    assert payload["cv"]["sections"]["experience"][0]["highlights"] == ["Built APIs"]


def test_rendercv_adapter_strips_rich_stack_duplicates_and_emits_one_project_stack_field() -> None:
    rich_stack = "<strong>Python</strong>, FastAPI, PostgreSQL"
    experience_stack = "<strong>Stack:</strong> Python · FastAPI · PostgreSQL"
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Eng",
                "company": "Acme",
                "techStack": experience_stack,
                "description": ["**Stack:** Python, FastAPI, PostgreSQL", "Built APIs"],
                "highlights": ["Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Demo",
                "techStack": rich_stack,
                "description": ["**Python** • FastAPI • PostgreSQL", "Shipped CLI"],
                "highlights": ["Shipped CLI"],
            }
        ],
        "skills": {"groups": []},
    }

    sections = rendercv_payload_to_yaml_sections(
        resume,
        RenderThemeSettings(theme_id="classic"),
    )
    cv_yaml = yaml.safe_load(sections["cv"])
    experience = cv_yaml["cv"]["sections"]["experience"][0]
    project = cv_yaml["cv"]["sections"]["projects"][0]

    assert experience["summary"].count("Stack:") == 1
    assert experience["highlights"] == ["Built APIs"]
    assert project["summary"] == "**Python** • FastAPI • PostgreSQL"
    assert project["highlights"] == ["Shipped CLI"]
    assert "tech_stacks" not in project


def test_rendercv_formats_work_stack_label_and_project_stack_separator() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Eng",
                "company": "Acme",
                "techStack": "Go, gRPC",
                "description": ["Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Demo",
                "techStack": "Rust, WASM",
                "description": ["Shipped CLI"],
            }
        ],
        "skills": {"groups": []},
    }
    theme_settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {},
            "settings": {
                "resume_workbench_style": {
                    "tech_stack": {"separator": "|"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    payload = resume_to_rendercv_payload(resume, theme_settings)

    assert payload["cv"]["sections"]["experience"][0]["summary"] == "**Stack:** Go | gRPC"
    assert payload["cv"]["sections"]["projects"][0]["summary"] == "Rust | WASM"


def test_rendercv_payload_strips_app_only_workbench_settings() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
    }
    theme_settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {},
            "settings": {
                "resume_workbench_style": {
                    "colors": {"company": "#123456"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    payload = resume_to_rendercv_payload(resume, theme_settings)

    assert "resume_workbench_style" not in payload.get("settings", {})


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


def test_rendercv_adapter_prefers_description_over_stale_highlights(sample_resume_copy: dict) -> None:
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
            settings={
                "bold_keywords": ["FastAPI", "Kubernetes"],
                "show_summary_heading": False,
            },
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


def test_rendercv_adapter_filters_low_signal_bold_keywords(sample_resume_copy: dict) -> None:
    themed_resume = copy.deepcopy(sample_resume_copy)
    themed_resume["workExperience"][0]["description"] = [
        "Built FastAPI services and reviewed Excel handoff data.",
    ]

    payload = resume_to_rendercv_payload(
        themed_resume,
        RenderThemeSettings(
            theme_id="classic",
            bold_keywords=True,
            settings={"bold_keywords": ["FastAPI", "Excel", "Miro", "Data Analysis"]},
        ),
    )

    bullet = payload["cv"]["sections"]["experience"][0]["highlights"][0]
    assert "**FastAPI**" in bullet
    assert "**Excel**" not in bullet
    assert "**Miro**" not in bullet


def test_rendercv_adapter_keeps_summary_content_and_strips_summary_heading_runtime_flags(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["summary"] = "Platform engineer focused on reliability."

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(
            theme_id="classic",
            settings={
                "show_summary_heading": False,
            },
        ),
    )

    assert payload["cv"]["sections"]["summary"] == ["Platform engineer focused on reliability."]
    assert "show_summary_heading" not in payload.get("settings", {})


def test_rendercv_adapter_converts_summary_rich_text_to_rendercv_markdown(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["summary"] = (
        '<div data-summary-align="center"><strong>Platform engineer</strong> focused on reliability.</div>'
    )

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )

    assert payload["cv"]["sections"]["summary"] == [
        "**Platform engineer** focused on reliability."
    ]
    assert summary_alignment_for_rendering(sample_resume_copy["summary"]) == "center"


def test_rendercv_adapter_converts_builder_rich_text_without_leaking_tags() -> None:
    resume = {
        "personalInfo": {"name": "Jane"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Eng",
                "company": "Acme",
                "techStack": "<strong>Python</strong>, AWS",
                "description": [
                    "Built <strong>FastAPI</strong> services without exposing </strong> tags"
                ],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Demo",
                "techStack": "React, <strong>TypeScript</strong>",
                "description": ["Shipped <strong>typed UI</strong> preview"],
            }
        ],
        "skills": {"groups": []},
    }

    payload = resume_to_rendercv_payload(resume, RenderThemeSettings(theme_id="classic"))
    experience = payload["cv"]["sections"]["experience"][0]
    project = payload["cv"]["sections"]["projects"][0]

    rendered_values = [
        experience["summary"],
        *experience["highlights"],
        project["summary"],
        *project["highlights"],
    ]
    assert "**Python**" in experience["summary"]
    assert "**FastAPI**" in experience["highlights"][0]
    assert "**TypeScript**" in project["summary"]
    assert "**typed UI**" in project["highlights"][0]
    assert not any("<strong>" in value or "</strong>" in value for value in rendered_values)


def test_rendercv_adapter_honors_summary_section_visibility_from_section_meta(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["summary"] = "Platform engineer focused on reliability."

    sample_resume_copy["sectionMeta"] = [
        {
            "id": "summary",
            "key": "summary",
            "displayName": "Summary",
            "sectionType": "text",
            "isDefault": True,
            "isVisible": False,
            "order": 0,
        }
    ]
    payload_with_section_hidden = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )
    assert "summary" not in payload_with_section_hidden["cv"]["sections"]


def test_rendercv_adapter_emits_repo_and_live_links_after_project_name(
    sample_resume_copy: dict,
) -> None:
    sample_resume_copy["personalProjects"][0].update(
        {
            "name": "OpenAPI Generator",
            "github": "github.com/acme/openapi-generator",
            "website": "https://openapi.acme.dev",
        }
    )

    payload = resume_to_rendercv_payload(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
    )
    project_name = payload["cv"]["sections"]["projects"][0]["name"]

    assert project_name.startswith("OpenAPI Generator | ")
    assert "\\[[repo](https://github.com/acme/openapi-generator)\\]" in project_name
    assert "\\[[live](https://openapi.acme.dev)\\]" in project_name


def test_rendercv_round_trip_parses_repo_and_live_links_from_project_name() -> None:
    sections = {
        "cv": (
            "cv:\n"
            "  name: Jane Doe\n"
            "  sections:\n"
            "    projects:\n"
            "      - name: OpenAPI Generator | \\[[repo](https://github.com/acme/openapi)\\] \\[[live](https://openapi.acme.dev)\\]\n"
            "        date: Mar 2021 - Present\n"
            "        summary: API tooling\n"
            "        highlights:\n"
            "          - Built a developer CLI.\n"
        ),
        "design": "design:\n  theme: classic\n",
        "locale": "locale:\n  language: english\n",
        "settings": "settings:\n  current_date: today\n",
    }

    parsed_resume, _ = parse_rendercv_yaml_sections(
        sections,
        base_theme_settings=RenderThemeSettings(theme_id="classic"),
    )

    project = parsed_resume["personalProjects"][0]
    assert project["name"] == "OpenAPI Generator"
    assert project["github"] == "https://github.com/acme/openapi"
    assert project["website"] == "https://openapi.acme.dev"


def test_rendercv_round_trip_parses_repo_only_project_name_once() -> None:
    sections = {
        "cv": (
            "cv:\n"
            "  name: Jane Doe\n"
            "  sections:\n"
            "    projects:\n"
            "      - name: Cloud-Native Event Stream & Order Service | \\[[repo](https://github.com/acme/orders)\\]\n"
            "        summary: Python · FastAPI\n"
        ),
        "design": "design:\n  theme: classic\n",
        "locale": "locale:\n  language: english\n",
        "settings": "settings:\n  current_date: today\n",
    }

    resume, theme = parse_rendercv_yaml_sections(sections)
    project = resume["personalProjects"][0]
    assert project["name"] == "Cloud-Native Event Stream & Order Service"
    assert project["github"] == "https://github.com/acme/orders"
    assert project["website"] is None
    rendered_name = resume_to_rendercv_payload(resume, theme)["cv"]["sections"][
        "projects"
    ][0]["name"]
    assert rendered_name.count("[repo]") == 1


def test_rendercv_round_trip_keeps_legacy_project_name_link() -> None:
    sections = {
        "cv": (
            "cv:\n"
            "  name: Jane Doe\n"
            "  sections:\n"
            "    projects:\n"
            "      - name: '[Project site](https://example.com/project)'\n"
        ),
        "design": "design:\n  theme: classic\n",
        "locale": "locale:\n  language: english\n",
        "settings": "settings:\n  current_date: today\n",
    }

    resume, _ = parse_rendercv_yaml_sections(sections)
    project = resume["personalProjects"][0]
    assert project["name"] == "Project site"
    assert project["website"] == "https://example.com/project"


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
            "techStack": "Owned platform reliability and delivery for ML systems.",
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
            "techStack": "Open-source API tooling project.",
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
    assert parsed_resume["workExperience"][0]["techStack"] == "Owned platform reliability and delivery for ML systems."
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
    assert parsed_resume["personalProjects"][0]["techStack"] == "Open-source API tooling project."
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
