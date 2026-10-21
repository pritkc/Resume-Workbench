"""RenderCV engine tests."""

import hashlib
from pathlib import Path
import shutil
import subprocess

import pytest
from rendercv.renderer.pdf_png import get_package_path

from app.rendering.rendercv_engine import (
    _WorkbenchEntryStyleTarget,
    _style_entry_calls_in_typst,
    render_resume_bundle,
)
from app.rendering.rendercv_adapter import parse_rendercv_yaml_sections
from app.rendering.theme_profiles import RenderThemeSettings

ATS_PROVEN_THEMES = [
    "classic",
    "moderncv",
    "sb2nov",
    "engineeringresumes",
    "engineeringclassic",
]


def _extract_pdftotext(pdf_path: Path) -> str:
    result = subprocess.run(
        ["pdftotext", "-layout", str(pdf_path), "-"],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def test_rendercv_engine_recovers_after_bundled_typst_package_temp_removed(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    """RenderCV caches a temp copy of the Typst package; ensure we recover if it is deleted."""
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    first = render_resume_bundle(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="pkg_cache_first",
    )
    assert first.pdf_path is not None and first.pdf_path.exists()

    shutil.rmtree(get_package_path(), ignore_errors=True)

    second = render_resume_bundle(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="pkg_cache_second",
    )
    assert second.pdf_path is not None and second.pdf_path.exists()


def test_rendercv_engine_generates_pdf_png_yaml_for_freeflow_profile(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "classic",
            "theme_profiles": {"classic": {"page_size": "FREEFLOW"}},
        },
        uses_theme_profiles=True,
    )
    bundle = render_resume_bundle(
        sample_resume,
        settings,
        identifier="freeflow_smoke",
    )

    assert bundle.pdf_path is not None and bundle.pdf_path.exists()
    assert bundle.typst_path is not None
    typ = bundle.typst_path.read_text(encoding="utf-8")
    assert "continuous-page: true" in typ
    assert "rendercv_lib_resume_matcher.typ" in typ
    assert bundle.png_paths
    assert len(bundle.png_paths) == 1, "FREEFLOW should produce a single PNG (one continuous page)"
    pdfinfo_bin = shutil.which("pdfinfo")
    if pdfinfo_bin:
        proc = subprocess.run(
            [pdfinfo_bin, str(bundle.pdf_path)],
            capture_output=True,
            text=True,
            check=True,
        )
        pages_line = next((ln for ln in proc.stdout.splitlines() if ln.startswith("Pages:")), "")
        assert pages_line.split()[-1] == "1", f"expected single-page PDF, got {pages_line!r}"


def test_rendercv_engine_generates_pdf_png_and_yaml(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    bundle = render_resume_bundle(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="jane_doe_resume",
    )

    assert bundle.yaml_path.exists()
    assert bundle.pdf_path is not None
    assert bundle.pdf_path.is_absolute()
    assert bundle.pdf_path.exists()
    assert bundle.png_paths
    assert all(path.exists() for path in bundle.png_paths)


def test_rendercv_engine_uses_theme_defaults_for_theme_profile_payloads(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    classic = render_resume_bundle(
        sample_resume,
        RenderThemeSettings.from_payload(
            {"theme_id": "classic", "theme_profiles": {}},
            uses_theme_profiles=True,
        ),
        identifier="classic_resume",
    )
    harvard = render_resume_bundle(
        sample_resume,
        RenderThemeSettings.from_payload(
            {"theme_id": "harvard", "theme_profiles": {}},
            uses_theme_profiles=True,
        ),
        identifier="harvard_resume",
    )

    assert classic.yaml_path.read_text(encoding="utf-8") != harvard.yaml_path.read_text(
        encoding="utf-8"
    )
    assert hashlib.sha256(classic.png_paths[0].read_bytes()).hexdigest() != hashlib.sha256(
        harvard.png_paths[0].read_bytes()
    ).hexdigest()


def test_rendercv_engine_emits_pdfa_markers_across_ats_proven_themes(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    for theme_id in ATS_PROVEN_THEMES:
        bundle = render_resume_bundle(
            sample_resume,
            RenderThemeSettings(theme_id=theme_id),
            identifier=f"{theme_id}_ats",
        )

        pdf_bytes = bundle.pdf_path.read_bytes()
        assert b"/StructTreeRoot" in pdf_bytes
        assert b"/MarkInfo" in pdf_bytes
        assert b"/Lang" in pdf_bytes
        assert b"/ToUnicode" in pdf_bytes
        assert b"pdfaid:part" in pdf_bytes
        assert b"pdfaid:conformance" in pdf_bytes


def test_rendercv_engine_pdf_text_is_extractable_in_official_ats_themes(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    if shutil.which("pdftotext") is None:
        pytest.skip("pdftotext is required for ATS extraction checks")

    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    expected_snippets = [
        "Jane Doe",
        "Senior Backend Engineer",
        "Acme Corp",
        "MIT",
        "OpenAPI Generator",
        "AWS Solutions Architect Associate",
    ]

    for theme_id in ATS_PROVEN_THEMES:
        bundle = render_resume_bundle(
            sample_resume,
            RenderThemeSettings(theme_id=theme_id),
            identifier=f"{theme_id}_extractable",
        )

        extracted_text = _extract_pdftotext(bundle.pdf_path)

        assert "Jane Doe" in "\n".join(
            line.strip()
            for line in extracted_text.splitlines()[:10]
            if line.strip()
        )
        assert "\ufffd" not in extracted_text
        for snippet in expected_snippets:
            assert snippet in extracted_text


def test_rendercv_engine_preserves_unicode_text_in_pdf(
    sample_resume_copy: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    if shutil.which("pdftotext") is None:
        pytest.skip("pdftotext is required for Unicode extraction checks")

    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    sample_resume_copy["personalInfo"]["name"] = "María García-López"
    sample_resume_copy["personalInfo"]["location"] = "München, Germany"
    sample_resume_copy["summary"] = "Résumé engineer shipping APIs for Zürich and São Paulo teams."
    sample_resume_copy["workExperience"][0]["company"] = "São Systems"
    sample_resume_copy["education"][0]["institution"] = "Universität München"

    bundle = render_resume_bundle(
        sample_resume_copy,
        RenderThemeSettings(theme_id="classic"),
        identifier="unicode_resume",
    )

    extracted_text = _extract_pdftotext(bundle.pdf_path)

    assert "María García-López" in extracted_text
    assert "München, Germany" in extracted_text
    assert "Résumé engineer shipping APIs for Zürich and São Paulo teams." in extracted_text
    assert "São Systems" in extracted_text
    assert "Universität München" in extracted_text
    assert "\ufffd" not in extracted_text


def test_rendercv_engine_controls_summary_section_and_heading_in_typst(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Test User", "email": "test@example.com"},
        "summary": "Summary content for heading checks.",
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
    }

    hidden_heading_bundle = render_resume_bundle(
        resume,
        RenderThemeSettings(
            theme_id="classic",
            settings={"show_summary_heading": False},
        ),
        identifier="summary_heading_hidden",
    )
    hidden_heading_typst = hidden_heading_bundle.typst_path.read_text(encoding="utf-8")
    assert "Summary content for heading checks." in hidden_heading_typst
    assert "== Summary" not in hidden_heading_typst
    assert "#v(0.5cm)" in hidden_heading_typst

    shown_heading_bundle = render_resume_bundle(
        resume,
        RenderThemeSettings(
            theme_id="classic",
            settings={"show_summary_heading": True},
        ),
        identifier="summary_heading_shown",
    )
    shown_heading_typst = shown_heading_bundle.typst_path.read_text(encoding="utf-8")
    assert "== Summary" in shown_heading_typst

    hidden_section_resume = {
        **resume,
        "sectionMeta": [
            {
                "id": "summary",
                "key": "summary",
                "displayName": "Summary",
                "sectionType": "text",
                "isDefault": True,
                "isVisible": False,
                "order": 0,
            }
        ],
    }
    hidden_section_bundle = render_resume_bundle(
        hidden_section_resume,
        RenderThemeSettings(
            theme_id="classic",
            settings={"show_summary_heading": True},
        ),
        identifier="summary_section_hidden",
    )
    hidden_section_typst = hidden_section_bundle.typst_path.read_text(encoding="utf-8")
    assert "Summary content for heading checks." not in hidden_section_typst
    assert "== Summary" not in hidden_section_typst


def test_rendercv_engine_applies_summary_alignment_to_typst(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Test User", "email": "test@example.com"},
        "summary": (
            '<div data-summary-align="center">'
            "<strong>Centered summary</strong> content for preview."
            "</div>"
        ),
        "workExperience": [],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
    }

    bundle = render_resume_bundle(
        resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="summary_alignment_center",
    )

    typst = bundle.typst_path.read_text(encoding="utf-8")
    assert "#strong[Centered summary] content for preview." in typst
    assert "#set align(center)" in typst
    assert "#set par(justify: false)" in typst
    assert "data-summary-align" not in typst


def test_rendercv_engine_expands_project_stack_header_without_stack_label(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Test User", "email": "test@example.com"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "title": "Engineer",
                "company": "Acme",
                "years": "2024 - Present",
                "techStack": "Python, FastAPI",
                "description": ["Built APIs."],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Tiny",
                "techStack": (
                    "Python, FastAPI, PostgreSQL, React, Docker, Kubernetes, Terraform"
                ),
                "description": ["Built a compact project."],
            }
        ],
        "skills": {"groups": []},
    }

    bundle = render_resume_bundle(
        resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="project_stack_header",
    )

    typst = bundle.typst_path.read_text(encoding="utf-8")
    assert bundle.pdf_path is not None and bundle.pdf_path.exists()
    assert "#let resume-matcher-project-entry(" in typst
    assert "#resume-matcher-project-entry(" in typst
    assert "#regular-entry(" in typst
    assert "let project-header-gap = 0.25cm" in typst
    assert "columns: (auto, 1fr)" in typst
    assert "#strong[Stack:] Python • FastAPI" in typst
    assert "#summary[Python • FastAPI • PostgreSQL • React • Docker • Kubernetes • Terraform]" in typst
    assert "#strong[Stack:] Python • FastAPI • PostgreSQL" not in typst


def test_rendercv_engine_uses_full_project_header_width(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)
    resume = {
        "personalInfo": {"name": "Test User", "email": "test@example.com"},
        "summary": "",
        "workExperience": [],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "VisionAid",
                "github": "https://github.com/example/visionaid",
                "website": "https://example.com/visionaid",
                "techStack": "Python · PyTorch · Streamlit · Google Street View API · Folium",
                "description": ["Built a compact project."],
            }
        ],
        "skills": {"groups": []},
    }
    bundle = render_resume_bundle(
        resume,
        RenderThemeSettings(theme_id="harvard"),
        identifier="project_header_width",
    )

    assert bundle.pdf_path is not None
    pdf_text = _extract_pdftotext(bundle.pdf_path)
    assert "Python · PyTorch · Streamlit · Google Street View API · Folium" in pdf_text
    assert "\n" not in pdf_text.split("Python · PyTorch", 1)[1].split("Folium", 1)[0]


def test_live_resume_project_links_stay_on_one_line(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Render the affected project YAML with its captured design settings."""
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)
    fixture_dir = Path(__file__).parents[1] / "fixtures"
    exact_dir = Path(__file__).parents[4] / ".local/repros/project-live-link-wrap"
    for source_dir in (fixture_dir, exact_dir):
        if not source_dir.exists():
            continue
        sections = {
            section: (source_dir / f"project-live-link-wrap.{section}.yaml").read_text()
            for section in ("cv", "design", "locale", "settings")
        }
        resume, theme = parse_rendercv_yaml_sections(sections)

        bundle = render_resume_bundle(
            resume,
            theme,
            identifier=f"project_live_link_wrap_{source_dir.name}",
        )
        assert bundle.pdf_path is not None
        lines = _extract_pdftotext(bundle.pdf_path).splitlines()
        project_line = next(line for line in lines if "Resume Workbench" in line)
        assert "[repo]" in project_line
        assert "[live]" in project_line
        assert "Next.js · FastAPI · PostgreSQL" in project_line


def test_rendercv_engine_matches_company_colors_when_entry_order_differs() -> None:
    typst = """== Experience
#regular-entry([#strong[Humana (Contract)] | Engineer], [Remote])
#regular-entry([#strong[SDSU CSRC] | Engineer], [Remote])
#regular-entry([#strong[GoFundMe] | Engineer], [Remote])
#regular-entry([#strong[Maersk (Contract)] | Engineer], [Remote])
"""
    targets = [
        _WorkbenchEntryStyleTarget(company=name, role="Engineer")
        for name in ("Humana (Contract)", "SDSU CSRC", "Maersk (Contract)", "GoFundMe")
    ]

    styled = _style_entry_calls_in_typst(
        typst, {"company": "rgb(0, 79, 144)"}, work_targets=targets
    )

    for name in ("Humana (Contract)", "SDSU CSRC", "GoFundMe", "Maersk (Contract)"):
        assert f"#text(fill: rgb(0, 79, 144))[#strong[{name}]]" in styled


def test_rendercv_engine_renders_entries_after_escaped_quotes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)
    resume = {
        "personalInfo": {"name": "Test User", "email": "test@example.com"},
        "summary": "",
        "workExperience": [
            {
                "id": index,
                "company": company,
                "position": "Engineer",
                "location": "Remote",
                "date": "2024 - 2025",
                "description": [description],
            }
            for index, (company, description) in enumerate(
                (
                    ("Humana (Contract)", "Built an API."),
                    ("GoFundMe", 'Questions about "is the data in?" became self-serve.'),
                    ("Maersk (Contract)", "Built a service."),
                ),
                start=1,
            )
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "VisionAid",
                "techStack": "Python · PyTorch · Streamlit · Google Street View API · Folium",
                "description": ["Built a compact project."],
            }
        ],
        "skills": {"groups": []},
    }
    theme_settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "harvard",
            "theme_profiles": {},
            "settings": {
                "resume_workbench_style": {
                    "colors": {"company": "#004f90"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    bundle = render_resume_bundle(resume, theme_settings, identifier="escaped_quotes")

    assert bundle.pdf_path is not None
    typst = bundle.typst_path.read_text(encoding="utf-8")
    for company in ("Humana (Contract)", "GoFundMe", "Maersk (Contract)"):
        assert f"#text(fill: rgb(0, 79, 144))[#strong[{company}]]" in typst
    assert "#resume-matcher-project-entry(" in typst
    pdf_text = _extract_pdftotext(bundle.pdf_path)
    assert "Python · PyTorch · Streamlit · Google Street View API · Folium" in pdf_text
    assert "\n" not in pdf_text.split("Python · PyTorch", 1)[1].split("Folium", 1)[0]


def test_rendercv_engine_applies_workbench_field_styles(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@example.com"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Engineer",
                "company": "Acme Labs",
                "location": "Remote",
                "date": "2024 - Present",
                "techStack": "Python, FastAPI",
                "description": ["Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Project Alpha",
                "date": "2024",
                "techStack": "React, TypeScript",
                "description": ["Built UI"],
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
                    "colors": {
                        "company": "#123456",
                        "role": "#654321",
                        "stack": "rgb(10, 20, 30)",
                        "date_location": "#abcdef",
                    },
                    "typography": {
                        "letter_spacing": {
                            "name": "0.4pt",
                            "section_titles": "0.2pt",
                        }
                    },
                    "tech_stack": {"separator": "•"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    bundle = render_resume_bundle(
        resume,
        theme_settings,
        identifier="workbench_styles",
    )

    typst = bundle.typst_path.read_text(encoding="utf-8")
    assert bundle.pdf_path is not None and bundle.pdf_path.exists()
    assert "rendercv_lib_resume_matcher.typ" not in typst
    assert "= #text(tracking: 0.4pt)[Jane Doe]" in typst
    assert "== #text(tracking: 0.2pt)[Experience]" in typst
    assert "#text(fill: rgb(18, 52, 86))[#strong[Acme Labs]]" in typst
    assert "#text(fill: rgb(101, 67, 33))[Engineer]" in typst
    assert "#text(fill: rgb(18, 52, 86))[#strong[Project Alpha]]" not in typst
    assert "#text(fill: rgb(10, 20, 30))[#summary[#strong[Stack:] Python • FastAPI]]" in typst
    assert "#text(fill: rgb(10, 20, 30))[#summary[React • TypeScript]]" in typst
    assert "#strong[Stack:] React • TypeScript" not in typst
    assert "#text(fill: rgb(171, 205, 239))[" in typst


def test_rendercv_engine_colors_plain_company_line_in_experience_template(
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@example.com"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Engineer",
                "company": "Humana (Contract)",
                "location": "Remote",
                "date": "2025 - Present",
                "techStack": "Python, FastAPI",
                "description": ["Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [
            {
                "id": 1,
                "name": "Resume Workbench",
                "date": "2025",
                "techStack": "React, TypeScript",
                "description": ["Built UI"],
            }
        ],
        "skills": {"groups": []},
    }
    theme_settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "harvard",
            "theme_profiles": {
                "harvard": {
                    "design": {
                        "templates": {
                            "experience_entry": {
                                "main_column": "COMPANY\n**POSITION**\nSUMMARY\nHIGHLIGHTS",
                                "date_and_location_column": "LOCATION | DATE",
                            },
                            "normal_entry": {
                                "main_column": "**NAME**\nSUMMARY\nHIGHLIGHTS",
                                "date_and_location_column": "DATE",
                            },
                        }
                    }
                }
            },
            "settings": {
                "resume_workbench_style": {
                    "colors": {
                        "company": "#ff0000",
                        "role": "#00aa00",
                        "stack": "#0066cc",
                    },
                    "tech_stack": {"separator": "·"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    bundle = render_resume_bundle(
        resume,
        theme_settings,
        identifier="plain_company_line",
    )

    typst = bundle.typst_path.read_text(encoding="utf-8")
    assert bundle.pdf_path is not None and bundle.pdf_path.exists()
    assert "#text(fill: rgb(255, 0, 0))[Humana (Contract)]" in typst
    assert "#text(fill: rgb(0, 170, 0))[#strong[Engineer]]" in typst
    assert "#text(fill: rgb(255, 0, 0))[#strong[Resume Workbench]]" not in typst
    assert "#text(fill: rgb(0, 102, 204))[#summary[#strong[Stack:] Python · FastAPI]]" in typst
    assert "#summary[React · TypeScript]" in typst
    assert "#strong[Stack:] React · TypeScript" not in typst


@pytest.mark.parametrize(
    ("main_column", "expected_company", "expected_role"),
    [
        (
            "POSITION, COMPANY\nSUMMARY\nHIGHLIGHTS",
            "#text(fill: rgb(255, 0, 0))[Humana (Contract)]",
            "#text(fill: rgb(0, 170, 0))[Engineer]",
        ),
        (
            "**POSITION**, COMPANY\nSUMMARY\nHIGHLIGHTS",
            "#text(fill: rgb(255, 0, 0))[Humana (Contract)]",
            "#text(fill: rgb(0, 170, 0))[#strong[Engineer]]",
        ),
        (
            "POSITION, **COMPANY**\nSUMMARY\nHIGHLIGHTS",
            "#text(fill: rgb(255, 0, 0))[#strong[Humana (Contract)]]",
            "#text(fill: rgb(0, 170, 0))[Engineer]",
        ),
    ],
)
def test_rendercv_engine_field_colors_follow_values_not_template_positions(
    main_column: str,
    expected_company: str,
    expected_role: str,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    resume = {
        "personalInfo": {"name": "Jane Doe", "email": "jane@example.com"},
        "summary": "",
        "workExperience": [
            {
                "id": 1,
                "position": "Engineer",
                "company": "Humana (Contract)",
                "location": "Remote",
                "date": "2025 - Present",
                "techStack": "Python, FastAPI",
                "description": ["Built APIs"],
            }
        ],
        "education": [],
        "personalProjects": [],
        "skills": {"groups": []},
    }
    theme_settings = RenderThemeSettings.from_payload(
        {
            "theme_id": "harvard",
            "theme_profiles": {
                "harvard": {
                    "design": {
                        "templates": {
                            "experience_entry": {
                                "main_column": main_column,
                                "date_and_location_column": "LOCATION | DATE",
                            }
                        }
                    }
                }
            },
            "settings": {
                "resume_workbench_style": {
                    "colors": {
                        "company": "#ff0000",
                        "role": "#00aa00",
                        "stack": "#0066cc",
                    },
                    "tech_stack": {"separator": "·"},
                }
            },
        },
        uses_theme_profiles=True,
    )

    bundle = render_resume_bundle(
        resume,
        theme_settings,
        identifier=f"value_anchored_colors_{abs(hash(main_column))}",
    )

    typst = bundle.typst_path.read_text(encoding="utf-8")
    assert bundle.pdf_path is not None and bundle.pdf_path.exists()
    assert expected_company in typst
    assert expected_role in typst
    assert "#text(fill: rgb(255, 0, 0))[Engineer]" not in typst
    assert "#text(fill: rgb(0, 170, 0))[Humana (Contract)]" not in typst


def test_rendercv_engine_is_deterministic_for_same_input(
    sample_resume: dict,
    tmp_path: Path,
    monkeypatch,
) -> None:
    monkeypatch.setattr("app.rendering.rendercv_engine.settings.rendercv_work_dir", tmp_path)

    first = render_resume_bundle(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="deterministic_first",
    )
    second = render_resume_bundle(
        sample_resume,
        RenderThemeSettings(theme_id="classic"),
        identifier="deterministic_second",
    )

    assert hashlib.sha256(first.pdf_path.read_bytes()).hexdigest() == hashlib.sha256(
        second.pdf_path.read_bytes()
    ).hexdigest()
