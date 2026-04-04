"""RenderCV engine tests."""

import hashlib
from pathlib import Path

from app.rendering.rendercv_engine import render_resume_bundle
from app.rendering.theme_profiles import RenderThemeSettings


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
