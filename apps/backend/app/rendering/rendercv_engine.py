"""RenderCV rendering engine."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import shutil
from pathlib import Path
import re
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
from app.rendering.rendercv_adapter import (
    resume_to_rendercv_payload,
    summary_alignment_for_rendering,
)
from app.rendering.theme_profiles import RenderThemeSettings

logger = logging.getLogger(__name__)

_ATS_PDF_STANDARDS = ["a-2u"]
_FREEFLOW_TYST_LIB_NAME = "rendercv_lib_resume_matcher.typ"
_VENDOR_RENDERCV_LIB = Path(__file__).resolve().parent / "vendor" / _FREEFLOW_TYST_LIB_NAME
_PREVIEW_RENDERCV_IMPORT_RE = re.compile(
    r'^#import "@preview/rendercv:[^"]+": \*\s*$',
    re.MULTILINE,
)
_PAGE_SIZE_LINE_RE = re.compile(r"^(\s*)(page-size:\s*\"[^\"]+\",)\s*$", re.MULTILINE)
_SUMMARY_HEADING_RE = re.compile(r"(?im)^==\s+summary[:\s]*\r?\n(?:\r?\n)?")
_SUMMARY_SECTION_RE = re.compile(
    r"(?ims)(?P<prefix>^==\s+summary[:\s]*\r?\n(?:\r?\n)?)(?P<body>.*?)(?=\r?\n==\s+|\Z)"
)
_TYPST_DIMENSION_RE = re.compile(r"^\d+(?:\.\d+)?(?:cm|mm|in|pt|em|ex)$")


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


def _generate_pdf_with_ats_profile(
    model: Any, typst_path: Path | None, theme_settings: RenderThemeSettings
) -> Path | None:
    if model.settings.render_command.dont_generate_pdf or typst_path is None:
        return None

    pdf_path = resolve_rendercv_file_path(model, model.settings.render_command.pdf_path)
    typst_compiler = get_typst_compiler(model._input_file_path, typst_path.parent)
    copy_photo_next_to_typst_file(model, typst_path)

    compile_kwargs: dict[str, Any] = {}
    if theme_settings.page_size != "FREEFLOW":
        compile_kwargs["pdf_standards"] = _ATS_PDF_STANDARDS

    try:
        typst_compiler.compile(
            input=typst_path,
            format="pdf",
            output=pdf_path,
            **compile_kwargs,
        )
        return pdf_path
    except Exception:  # noqa: BLE001
        logger.warning(
            "Falling back to default Typst PDF compilation without explicit ATS profile.",
            exc_info=True,
        )
        _reset_rendercv_typst_caches()
        return generate_pdf(model, typst_path)


def _apply_freeflow_typst_patch(
    typst_path: Path, theme_settings: RenderThemeSettings
) -> None:
    """Use patched RenderCV Typst lib with height:auto for single continuous PDF pages."""
    if theme_settings.page_size != "FREEFLOW":
        return
    if not _VENDOR_RENDERCV_LIB.is_file():
        logger.warning("Freeflow Typst vendor lib missing at %s", _VENDOR_RENDERCV_LIB)
        return
    try:
        text = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    if not _PREVIEW_RENDERCV_IMPORT_RE.search(text):
        logger.warning(
            "Freeflow Typst patch skipped: expected @preview/rendercv:… import in %s",
            typst_path,
        )
        return
    dest = typst_path.parent / _FREEFLOW_TYST_LIB_NAME
    try:
        shutil.copy2(_VENDOR_RENDERCV_LIB, dest)
    except OSError:
        logger.warning("Freeflow Typst patch could not copy vendor lib to %s", dest)
        return
    text = _PREVIEW_RENDERCV_IMPORT_RE.sub(
        f'#import "{_FREEFLOW_TYST_LIB_NAME}": *',
        text,
        count=1,
    )
    match = _PAGE_SIZE_LINE_RE.search(text)
    if not match:
        logger.warning("Freeflow Typst patch: page-size line not found in %s", typst_path)
        return
    indent, page_line = match.group(1), match.group(2)
    insert = f"{indent}{page_line}\n{indent}continuous-page: true,"
    text = _PAGE_SIZE_LINE_RE.sub(insert, text, count=1)
    typst_path.write_text(text, encoding="utf-8")


def _coerce_bool(value: Any, default: bool) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value != 0
    if isinstance(value, str):
        normalized = value.strip().lower()
        if normalized in {"true", "1", "yes", "y", "on"}:
            return True
        if normalized in {"false", "0", "no", "n", "off"}:
            return False
    return default


def _show_summary_heading(theme_settings: RenderThemeSettings) -> bool:
    runtime_settings = (
        theme_settings.settings if isinstance(theme_settings.settings, dict) else {}
    )
    return _coerce_bool(runtime_settings.get("show_summary_heading"), default=False)


def _resolve_summary_heading_gap(payload: dict[str, object]) -> str:
    design = payload.get("design")
    if not isinstance(design, dict):
        return "0.5cm"
    section_titles = design.get("section_titles")
    if not isinstance(section_titles, dict):
        return "0.5cm"
    raw_gap = section_titles.get("space_above")
    if isinstance(raw_gap, str):
        normalized_gap = raw_gap.strip().lower()
        if _TYPST_DIMENSION_RE.fullmatch(normalized_gap):
            return normalized_gap
    return "0.5cm"


def _strip_summary_heading_from_typst(typst_path: Path, *, heading_gap: str) -> None:
    try:
        original = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    updated = _SUMMARY_HEADING_RE.sub(f"#v({heading_gap})\n\n", original, count=1)
    if updated != original:
        typst_path.write_text(updated, encoding="utf-8")


def _summary_alignment_block(body: str, alignment: str) -> str:
    cleaned_body = body.strip()
    if not cleaned_body:
        return body

    align_value = "center" if alignment == "center" else "left"
    justify_value = "true" if alignment == "justify" else "false"
    indented_body = "\n".join(
        f"  {line}" if line else "" for line in cleaned_body.splitlines()
    )
    return (
        "#block(width: 100%)[\n"
        f"  #set align({align_value})\n"
        f"  #set par(justify: {justify_value})\n"
        f"{indented_body}\n"
        "]\n"
    )


def _apply_summary_alignment_to_typst(
    typst_path: Path, *, alignment: str | None
) -> None:
    if alignment not in {"left", "center", "justify"}:
        return
    try:
        original = typst_path.read_text(encoding="utf-8")
    except OSError:
        return

    def replace(match: re.Match[str]) -> str:
        return (
            match.group("prefix")
            + _summary_alignment_block(match.group("body"), alignment)
        )

    updated = _SUMMARY_SECTION_RE.sub(replace, original, count=1)
    if updated != original:
        typst_path.write_text(updated, encoding="utf-8")


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
    summary_alignment = summary_alignment_for_rendering(resume_data.get("summary"))
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
        if generated_typst is not None:
            _apply_summary_alignment_to_typst(
                generated_typst,
                alignment=summary_alignment,
            )
        if generated_typst is not None and not _show_summary_heading(theme_settings):
            _strip_summary_heading_from_typst(
                generated_typst,
                heading_gap=_resolve_summary_heading_gap(payload),
            )
        if generated_typst is not None:
            _apply_freeflow_typst_patch(generated_typst, theme_settings)
        generated_pdf = _generate_pdf_with_ats_profile(
            model, generated_typst, theme_settings
        )
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
