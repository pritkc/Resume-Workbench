"""RenderCV rendering engine."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any
from uuid import uuid4

import yaml
from rendercv.renderer.html import generate_html
from rendercv.renderer.markdown import generate_markdown
from rendercv.renderer.pdf_png import generate_pdf, generate_png
from rendercv.renderer.typst import generate_typst
from rendercv.schema.rendercv_model_builder import build_rendercv_dictionary_and_model

from app.config import settings
from app.rendering.rendercv_adapter import resume_to_rendercv_payload
from app.rendering.theme_profiles import RenderThemeSettings


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


def render_resume_bundle(
    resume_data: dict[str, Any],
    theme_settings: RenderThemeSettings,
    *,
    identifier: str | None = None,
) -> RenderCVBundle:
    bundle_id = _default_identifier(identifier)
    work_dir = settings.rendercv_work_dir / bundle_id
    work_dir.mkdir(parents=True, exist_ok=True)

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
        generated_pdf = generate_pdf(model, generated_typst)
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
