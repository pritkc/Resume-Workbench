"""RenderCV rendering engine."""

from __future__ import annotations

from dataclasses import dataclass
import logging
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from rendercv.renderer.html import generate_html
from rendercv.renderer.markdown import generate_markdown
from rendercv.renderer.path_resolver import resolve_rendercv_file_path
from rendercv.renderer.pdf_png import (
    copy_photo_next_to_typst_file,
    generate_pdf,
    generate_png,
    get_package_path,
    get_typst_compiler,
)
from rendercv.renderer.typst import generate_typst
from rendercv.schema.rendercv_model_builder import build_rendercv_dictionary_and_model

from app.config import settings
from app.rendering.rendercv_adapter import resume_to_rendercv_payload
from app.rendering.theme_profiles import RenderThemeSettings

logger = logging.getLogger(__name__)

_ATS_PDF_STANDARDS = ["a-2u"]


def _reset_rendercv_typst_caches() -> None:
    """Clear RenderCV's cached Typst package dir and compiler.

    RenderCV caches the path to a temp directory that mirrors the bundled
    ``rendercv`` Typst package. If that temp directory is removed (OS temp
    cleanup, etc.), compilation fails looking for ``typst.toml``. Resetting
    before each render ensures a fresh package path.
    """
    get_package_path.cache_clear()
    get_typst_compiler.cache_clear()


class RenderCVRenderError(RuntimeError):
    pass


@dataclass
class RenderCVBundle:
    identifier: str
    yaml_path: Path
    typst_path: Path | None
    pdf_path: Path | None
    png_paths: list[Path]
    markdown_path: Path | None
    html_path: Path | None
    theme_settings: RenderThemeSettings
    payload: dict[str, object]


def _default_identifier(seed: str | None = None) -> str:
    if seed:
        candidate = "".join(char if char.isalnum() else "_" for char in seed)
        if candidate:
            return candidate[:80]
    return str(uuid4())


def _generate_pdf_with_ats_profile(model: Any, typst_path: Path | None) -> Path | None:
    if model.settings.render_command.dont_generate_pdf or typst_path is None:
        return None

    pdf_path = resolve_rendercv_file_path(model, model.settings.render_command.pdf_path)
    typst_compiler = get_typst_compiler(model._input_file_path, typst_path.parent)
    copy_photo_next_to_typst_file(model, typst_path)

    try:
        typst_compiler.compile(
            input=typst_path,
            format="pdf",
            output=pdf_path,
            pdf_standards=_ATS_PDF_STANDARDS,
        )
        return pdf_path
    except Exception:  # noqa: BLE001
        logger.warning(
            "Falling back to default Typst PDF compilation without explicit ATS profile.",
            exc_info=True,
        )
        _reset_rendercv_typst_caches()
        return generate_pdf(model, typst_path)


def render_resume_bundle(
    resume_data: dict[str, Any],
    theme_settings: RenderThemeSettings,
    *,
    identifier: str | None = None,
) -> RenderCVBundle:
    bundle_id = _default_identifier(identifier)
    work_dir = (settings.rendercv_work_dir / bundle_id).resolve()
    work_dir.mkdir(parents=True, exist_ok=True)

    _reset_rendercv_typst_caches()

    payload = resume_to_rendercv_payload(resume_data, theme_settings)
    yaml_path = work_dir / f"{bundle_id}.yaml"
    typst_path = work_dir / f"{bundle_id}.typ"
    pdf_path = work_dir / f"{bundle_id}.pdf"
    png_path = work_dir / f"{bundle_id}.png"
    markdown_path = work_dir / f"{bundle_id}.md"
    html_path = work_dir / f"{bundle_id}.html"

    yaml_text = yaml.safe_dump(payload, sort_keys=False, allow_unicode=True)
    yaml_path.write_text(yaml_text, encoding="utf-8")

    try:
        _, model = build_rendercv_dictionary_and_model(
            yaml_text,
            input_file_path=yaml_path,
            pdf_path=str(pdf_path),
            typst_path=str(typst_path),
            png_path=str(png_path),
            markdown_path=str(markdown_path),
            html_path=str(html_path),
        )
        generated_typst = generate_typst(model)
        generated_pdf = _generate_pdf_with_ats_profile(model, generated_typst)
        generated_pngs = generate_png(model, generated_typst) or []
        generated_markdown = generate_markdown(model)
        generated_html = generate_html(model, generated_markdown)
    except Exception as exc:  # noqa: BLE001
        raise RenderCVRenderError(str(exc)) from exc

    return RenderCVBundle(
        identifier=bundle_id,
        yaml_path=yaml_path,
        typst_path=generated_typst,
        pdf_path=generated_pdf,
        png_paths=list(generated_pngs),
        markdown_path=generated_markdown,
        html_path=generated_html,
        theme_settings=theme_settings,
        payload=payload,
    )
