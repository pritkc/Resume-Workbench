"""RenderCV engine tests."""

import hashlib
from pathlib import Path
import shutil
import subprocess

import pytest

from app.rendering.rendercv_engine import render_resume_bundle
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
