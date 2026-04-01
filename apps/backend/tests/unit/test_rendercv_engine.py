"""RenderCV engine tests."""

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
