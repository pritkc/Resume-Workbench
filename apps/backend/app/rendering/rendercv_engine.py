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
_REGULAR_ENTRY_CALL = "#regular-entry("
_PROJECT_ENTRY_CALL = "#resume-matcher-project-entry("
_PROJECT_ENTRY_HELPER = r"""

// Resume Workbench project headers: keep project names left and tech stacks right,
// while giving tech stacks the extra room left by short project names.
#let resume-matcher-project-entry(main-column, date-and-location-column, main-column-second-row: none) = {
  metadata("skip-content-area")

  context {
    let config = rendercv-config.get()
    let entries-date-and-location-width = config.at("entries-date-and-location-width")
    let entries-highlights-bullet = config.at("entries-highlights-bullet")
    let entries-highlights-nested-bullet = config.at("entries-highlights-nested-bullet")
    let entries-highlights-space-between-items = config.at(
      "entries-highlights-space-between-items",
    )
    let entries-highlights-space-between-bullet-and-text = config.at(
      "entries-highlights-space-between-bullet-and-text",
    )
    let entries-highlights-space-above = config.at("entries-highlights-space-above")
    let typography-line-spacing = config.at("typography-line-spacing")
    let entries-allow-page-break = config.at("entries-allow-page-break")
    let sections-space-between-regular-entries = config.at("sections-space-between-regular-entries")
    let entries-side-space = config.at("entries-side-space")
    let justify = config.at("justify")
    let typography-date-and-location-column-alignment = config.at("typography-date-and-location-column-alignment")
    let entries-highlights-space-left = config.at("entries-highlights-space-left")
    let start-align = config.at("start-align")

    set list(
      marker: (entries-highlights-bullet, entries-highlights-nested-bullet),
      indent: entries-highlights-space-left,
      spacing: entries-highlights-space-between-items + typography-line-spacing,
      body-indent: entries-highlights-space-between-bullet-and-text,
    )
    let list-depth = state("list-depth", 0)
    show list.item: i => {
      list-depth.update(d => d + 1)
      i
      list-depth.update(d => d - 1)
    }
    show list: l => {
      context if list-depth.get() == 1 {
        v(entries-highlights-space-above)
      }
      context if list-depth.get() == 2 {
        v(entries-highlights-space-between-items)
      }
      l
    }
    set par(
      spacing: typography-line-spacing,
      leading: typography-line-spacing,
      justify: justify,
    )
    block(
      {
        if repr(main-column) != "[ ]" or repr(date-and-location-column) != "[ ]" {
          layout(size => {
            let project-header-gap = 0.25cm
            let minimum-stack-width = calc.min(entries-date-and-location-width, size.width * 45%)
            let max-main-width = size.width - minimum-stack-width - project-header-gap
            let main-column-width = if max-main-width > 0cm {
              calc.min(measure(main-column).width, max-main-width)
            } else {
              size.width * 50%
            }
            grid(
              columns: (main-column-width, 1fr),
              column-gutter: project-header-gap,
              align: (start-align, typography-date-and-location-column-alignment),
              main-column,
              date-and-location-column,
            )
          })
        }
        set align(start-align)
        main-column-second-row
      },
      breakable: entries-allow-page-break,
      below: sections-space-between-regular-entries + typography-line-spacing,
      inset: (
        left: entries-side-space,
        right: entries-side-space,
      ),
      width: 100%,
    )
  }
}
"""


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


def _matching_typst_delimiter(text: str, open_index: int) -> int | None:
    pairs = {"(": ")", "[": "]", "{": "}"}
    opening = text[open_index]
    closing = pairs.get(opening)
    if closing is None:
        return None

    stack = [closing]
    in_string = False
    escape = False
    for index in range(open_index + 1, len(text)):
        char = text[index]
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char in pairs:
            stack.append(pairs[char])
            continue
        if stack and char == stack[-1]:
            stack.pop()
            if not stack:
                return index
    return None


def _top_level_typst_commas(text: str) -> list[int]:
    pairs = {"(": ")", "[": "]", "{": "}"}
    stack: list[str] = []
    commas: list[int] = []
    in_string = False
    escape = False
    for index, char in enumerate(text):
        if in_string:
            if escape:
                escape = False
            elif char == "\\":
                escape = True
            elif char == '"':
                in_string = False
            continue
        if char == '"':
            in_string = True
            continue
        if char in pairs:
            stack.append(pairs[char])
            continue
        if stack and char == stack[-1]:
            stack.pop()
            continue
        if char == "," and not stack:
            commas.append(index)
    return commas


def _regular_entry_has_summary_right_column(call_body: str) -> bool:
    commas = _top_level_typst_commas(call_body)
    if not commas:
        return False
    second_arg_start = commas[0] + 1
    second_arg_end = commas[1] if len(commas) > 1 else len(call_body)
    return "#summary[" in call_body[second_arg_start:second_arg_end]


def _typst_block_is_empty(block: str) -> bool:
    stripped = block.strip()
    if not stripped.startswith("[") or not stripped.endswith("]"):
        return False
    return not stripped[1:-1].strip()


def _move_leading_summary_row_to_right_column(call_body: str) -> str | None:
    commas = _top_level_typst_commas(call_body)
    if len(commas) < 2:
        return None

    second_arg_start = commas[0] + 1
    second_arg_end = commas[1]
    if not _typst_block_is_empty(call_body[second_arg_start:second_arg_end]):
        return None

    match = re.search(r"main-column-second-row:\s*\[", call_body[second_arg_end:])
    if match is None:
        return None
    second_row_open = second_arg_end + match.end() - 1
    second_row_close = _matching_typst_delimiter(call_body, second_row_open)
    if second_row_close is None:
        return None

    second_row_body_start = second_row_open + 1
    second_row_body = call_body[second_row_body_start:second_row_close]
    leading_whitespace = len(second_row_body) - len(second_row_body.lstrip())
    summary_start = second_row_body_start + leading_whitespace
    if not call_body.startswith("#summary[", summary_start):
        return None

    summary_open = summary_start + len("#summary")
    summary_close = _matching_typst_delimiter(call_body, summary_open)
    if summary_close is None:
        return None

    summary_block = call_body[second_row_body_start:summary_close + 1]
    right_column = f"\n  [{summary_block}\n  ]"
    return (
        call_body[:second_arg_start]
        + right_column
        + call_body[second_arg_end:second_row_body_start]
        + call_body[summary_close + 1:]
    )


def _move_inline_project_summary_to_right_column(call_body: str) -> str | None:
    commas = _top_level_typst_commas(call_body)
    if len(commas) < 2:
        return None

    first_arg_end = commas[0]
    second_arg_start = commas[0] + 1
    second_arg_end = commas[1]
    if not _typst_block_is_empty(call_body[second_arg_start:second_arg_end]):
        return None

    first_arg = call_body[:first_arg_end]
    first_arg_open = first_arg.find("[")
    if first_arg_open == -1:
        return None
    first_arg_close = _matching_typst_delimiter(first_arg, first_arg_open)
    if first_arg_close is None:
        return None

    first_body_start = first_arg_open + 1
    first_body_end = first_arg_close
    first_body = first_arg[first_body_start:first_body_end]
    if not first_body.lstrip().startswith("#strong["):
        return None

    summary_start = first_arg.find("#summary[", first_body_start, first_body_end)
    if summary_start == -1:
        return None
    summary_open = summary_start + len("#summary")
    summary_close = _matching_typst_delimiter(first_arg, summary_open)
    if summary_close is None:
        return None

    summary_line_start = first_arg.rfind("\n", first_body_start, summary_start) + 1
    summary_block = first_arg[summary_line_start:summary_close + 1]
    first_body_before = first_arg[first_body_start:summary_line_start].rstrip()
    first_body_after = first_arg[summary_close + 1:first_body_end]
    patched_first_arg = (
        first_arg[:first_body_start]
        + first_body_before
        + "\n"
        + first_arg[first_body_end:first_arg_end]
    )
    right_column = f"\n  [{summary_block}\n  ]"
    second_row = (
        f",\n  main-column-second-row: [{first_body_after}\n  ]"
        if first_body_after.strip()
        else ""
    )

    return (
        patched_first_arg
        + ","
        + right_column
        + second_row
        + call_body[second_arg_end:]
    )


def _project_entry_call_body(call_body: str) -> str | None:
    if _regular_entry_has_summary_right_column(call_body):
        return call_body
    moved_leading_summary = _move_leading_summary_row_to_right_column(call_body)
    if moved_leading_summary is not None:
        return moved_leading_summary
    return _move_inline_project_summary_to_right_column(call_body)


def _patch_project_tech_stack_entries(typst: str) -> str:
    output: list[str] = []
    cursor = 0
    replacement_count = 0
    while True:
        start = typst.find(_REGULAR_ENTRY_CALL, cursor)
        if start == -1:
            output.append(typst[cursor:])
            break
        open_paren = start + len(_REGULAR_ENTRY_CALL) - 1
        close_paren = _matching_typst_delimiter(typst, open_paren)
        if close_paren is None:
            output.append(typst[cursor:])
            break
        call_body = typst[open_paren + 1:close_paren]
        output.append(typst[cursor:start])
        project_call_body = _project_entry_call_body(call_body)
        if project_call_body is not None:
            output.append(_PROJECT_ENTRY_CALL)
            output.append(project_call_body)
            replacement_count += 1
        else:
            output.append(_REGULAR_ENTRY_CALL)
            output.append(call_body)
        output.append(")")
        cursor = close_paren + 1

    updated = "".join(output)
    if replacement_count == 0 or _PROJECT_ENTRY_CALL in typst:
        return updated
    import_line_end = updated.find("\n", updated.find("#import "))
    if import_line_end == -1:
        return updated
    return updated[: import_line_end + 1] + _PROJECT_ENTRY_HELPER + updated[import_line_end + 1:]


def _apply_project_tech_stack_layout_to_typst(typst_path: Path) -> None:
    try:
        original = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    updated = _patch_project_tech_stack_entries(original)
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
            _apply_project_tech_stack_layout_to_typst(generated_typst)
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
