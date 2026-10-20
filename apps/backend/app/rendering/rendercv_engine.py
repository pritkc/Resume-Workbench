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
_RENDERCV_WITH_DATE_LINE_RE = re.compile(r"^(\s*)date:\s*datetime\(", re.MULTILINE)
_SUMMARY_HEADING_RE = re.compile(r"(?im)^==\s+summary[:\s]*\r?\n(?:\r?\n)?")
_SUMMARY_SECTION_RE = re.compile(
    r"(?ims)(?P<prefix>^==\s+summary[:\s]*\r?\n(?:\r?\n)?)(?P<body>.*?)(?=\r?\n==\s+|\Z)"
)
_TYPST_DIMENSION_RE = re.compile(r"^-?\d+(?:\.\d+)?(?:cm|mm|in|pt|em|ex)$")
_HEX_COLOR_RE = re.compile(r"^#(?P<value>[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$")
_RGB_COLOR_RE = re.compile(
    r"^rgb\s*\(\s*(?P<r>\d{1,3})\s*,\s*(?P<g>\d{1,3})\s*,\s*(?P<b>\d{1,3})\s*\)$",
    re.IGNORECASE,
)
_TYPST_SECTION_HEADING_RE = re.compile(r"(?m)^=+\s+(?P<title>.+?)\s*$")
_REGULAR_ENTRY_CALL = "#regular-entry("
_PROJECT_ENTRY_CALL = "#resume-matcher-project-entry("
_RENDERCV_VENDOR_IMPORT_LINE = f'#import "{_FREEFLOW_TYST_LIB_NAME}": *'
_PROJECT_ENTRY_HELPER = r"""

// Resume Workbench project headers: keep project names left and tech stacks right.
// Reserve a compact name column so the stack can use the rest of the line.
#let resume-matcher-project-entry(main-column, date-and-location-column, main-column-second-row: none) = {
  metadata("skip-content-area")

  context {
    let config = rendercv-config.get()
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
            let main-column-width = calc.min(4.5cm, size.width * 40%)
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


def _resume_workbench_style(theme_settings: RenderThemeSettings) -> dict[str, Any]:
    settings_payload = theme_settings.settings
    if not isinstance(settings_payload, dict):
        return {}
    style = settings_payload.get("resume_workbench_style")
    return style if isinstance(style, dict) else {}


def _nested_style_dict(root: dict[str, Any], *path: str) -> dict[str, Any]:
    cursor: Any = root
    for key in path:
        if not isinstance(cursor, dict):
            return {}
        cursor = cursor.get(key)
    return cursor if isinstance(cursor, dict) else {}


def _typst_color_expr(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    if not stripped:
        return None

    hex_match = _HEX_COLOR_RE.match(stripped)
    if hex_match:
        raw = hex_match.group("value")
        if len(raw) == 3:
            raw = "".join(ch * 2 for ch in raw)
        r = int(raw[0:2], 16)
        g = int(raw[2:4], 16)
        b = int(raw[4:6], 16)
        return f"rgb({r}, {g}, {b})"

    rgb_match = _RGB_COLOR_RE.match(stripped)
    if rgb_match:
        channels = [
            max(0, min(255, int(rgb_match.group(name))))
            for name in ("r", "g", "b")
        ]
        return f"rgb({channels[0]}, {channels[1]}, {channels[2]})"

    return None


def _typst_dimension_expr(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    stripped = value.strip()
    return stripped if _TYPST_DIMENSION_RE.match(stripped) else None


def _workbench_color_settings(theme_settings: RenderThemeSettings) -> dict[str, str]:
    style = _resume_workbench_style(theme_settings)
    colors = _nested_style_dict(style, "colors")
    output: dict[str, str] = {}
    for key in ("company", "role", "stack", "date_location"):
        color = _typst_color_expr(colors.get(key))
        if color:
            output[key] = color
    return output


def _workbench_letter_spacing_settings(
    theme_settings: RenderThemeSettings,
) -> dict[str, str]:
    style = _resume_workbench_style(theme_settings)
    letter_spacing = _nested_style_dict(style, "typography", "letter_spacing")
    output: dict[str, str] = {}
    for key in ("name", "headline", "connections", "section_titles"):
        dimension = _typst_dimension_expr(letter_spacing.get(key))
        if dimension:
            output[key] = dimension
    return output


class RenderCVRenderError(RuntimeError):
    """A render failure with the stage and source position, when available."""

    def __init__(
        self,
        message: str,
        *,
        stage: str,
        line: int | None = None,
        column: int | None = None,
    ) -> None:
        super().__init__(message)
        self.stage = stage
        self.line = line
        self.column = column


_RENDER_ERROR_LOCATION_RE = re.compile(r"(?:^|\s|:)(?P<line>\d+):(?P<column>\d+)(?:\s|$)")


def _render_error_location(message: str) -> tuple[int | None, int | None]:
    matches = list(_RENDER_ERROR_LOCATION_RE.finditer(message))
    if not matches:
        return None, None
    match = matches[-1]
    return int(match.group("line")), int(match.group("column"))


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


@dataclass(frozen=True)
class _WorkbenchEntryStyleTarget:
    company: str | None = None
    role: str | None = None


@dataclass(frozen=True)
class _TypstStyleResult:
    text: str
    experience_entries: int


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


def _ensure_vendor_rendercv_import(typst_path: Path, text: str) -> str | None:
    if _RENDERCV_VENDOR_IMPORT_LINE in text:
        return text
    if not _VENDOR_RENDERCV_LIB.is_file():
        logger.warning("RenderCV vendor lib missing at %s", _VENDOR_RENDERCV_LIB)
        return None
    if not _PREVIEW_RENDERCV_IMPORT_RE.search(text):
        logger.warning(
            "RenderCV vendor import patch skipped: expected @preview/rendercv:… import in %s",
            typst_path,
        )
        return None
    dest = typst_path.parent / _FREEFLOW_TYST_LIB_NAME
    try:
        shutil.copy2(_VENDOR_RENDERCV_LIB, dest)
    except OSError:
        logger.warning("RenderCV vendor import patch could not copy vendor lib to %s", dest)
        return None
    return _PREVIEW_RENDERCV_IMPORT_RE.sub(
        _RENDERCV_VENDOR_IMPORT_LINE,
        text,
        count=1,
    )


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
    text = _ensure_vendor_rendercv_import(typst_path, text)
    if text is None:
        return
    match = _PAGE_SIZE_LINE_RE.search(text)
    if not match:
        logger.warning("Freeflow Typst patch: page-size line not found in %s", typst_path)
        return
    indent, page_line = match.group(1), match.group(2)
    insert = f"{indent}{page_line}\n{indent}continuous-page: true,"
    text = _PAGE_SIZE_LINE_RE.sub(insert, text, count=1)
    typst_path.write_text(text, encoding="utf-8")


def _wrap_typst_block_content(block: str, *, fill: str) -> str:
    open_bracket = block.find("[")
    if open_bracket == -1:
        return block
    close_bracket = _matching_typst_delimiter(block, open_bracket)
    if close_bracket is None:
        return block
    return (
        block[: open_bracket + 1]
        + f"#text(fill: {fill})["
        + block[open_bracket + 1:close_bracket]
        + "]"
        + block[close_bracket:]
    )


def _text_fill_ranges(text: str) -> list[tuple[int, int]]:
    ranges: list[tuple[int, int]] = []
    cursor = 0
    while True:
        start = text.find("#text(fill:", cursor)
        if start == -1:
            break
        open_bracket = text.find("[", start)
        if open_bracket == -1:
            break
        close_bracket = _matching_typst_delimiter(text, open_bracket)
        if close_bracket is None:
            break
        ranges.append((start, close_bracket + 1))
        cursor = close_bracket + 1
    return ranges


def _inside_ranges(index: int, ranges: list[tuple[int, int]]) -> bool:
    return any(start <= index < end for start, end in ranges)


def _wrap_typst_field_value(block: str, value: str | None, *, fill: str) -> str:
    if not value:
        return block
    needle = value.strip()
    if not needle:
        return block

    protected_ranges = _text_fill_ranges(block)
    cursor = 0
    while True:
        strong_start = block.find("#strong[", cursor)
        if strong_start == -1:
            break
        strong_open = strong_start + len("#strong")
        strong_close = _matching_typst_delimiter(block, strong_open)
        if strong_close is None:
            break
        if not _inside_ranges(strong_start, protected_ranges):
            strong_body = block[strong_open + 1:strong_close]
            if strong_body.strip() == needle:
                return (
                    block[:strong_start]
                    + f"#text(fill: {fill})["
                    + block[strong_start:strong_close + 1]
                    + "]"
                    + block[strong_close + 1:]
                )
        cursor = strong_close + 1

    cursor = 0
    while True:
        match_start = block.find(needle, cursor)
        if match_start == -1:
            return block
        match_end = match_start + len(needle)
        if not _inside_ranges(match_start, protected_ranges):
            return (
                block[:match_start]
                + f"#text(fill: {fill})["
                + block[match_start:match_end]
                + "]"
                + block[match_end:]
            )
        cursor = match_end


def _wrap_summary_text_blocks(block: str, *, fill: str) -> str:
    output: list[str] = []
    cursor = 0
    while True:
        start = block.find("#summary[", cursor)
        if start == -1:
            output.append(block[cursor:])
            break
        summary_open = start + len("#summary")
        summary_close = _matching_typst_delimiter(block, summary_open)
        if summary_close is None:
            output.append(block[cursor:])
            break
        output.append(block[cursor:start])
        output.append(f"#text(fill: {fill})[")
        output.append(block[start:summary_close + 1])
        output.append("]")
        cursor = summary_close + 1
    return "".join(output)


def _wrap_typst_calls(text: str, *, call_prefix: str, fill_prefix: str) -> str:
    output: list[str] = []
    cursor = 0
    while True:
        start = text.find(call_prefix, cursor)
        if start == -1:
            output.append(text[cursor:])
            break
        if start >= len(fill_prefix) and text[start - len(fill_prefix):start] == fill_prefix:
            output.append(text[cursor:start + len(call_prefix)])
            cursor = start + len(call_prefix)
            continue
        open_paren = start + len(call_prefix) - 1
        close_paren = _matching_typst_delimiter(text, open_paren)
        if close_paren is None:
            output.append(text[cursor:])
            break
        output.append(text[cursor:start])
        output.append(fill_prefix)
        output.append(text[start:close_paren + 1])
        output.append("]")
        cursor = close_paren + 1
    return "".join(output)


def _style_entry_call_body(
    call_body: str,
    colors: dict[str, str],
    *,
    is_company_entry: bool,
    target: _WorkbenchEntryStyleTarget | None,
) -> str:
    commas = _top_level_typst_commas(call_body)
    if not commas:
        return call_body

    first_arg_end = commas[0]
    second_arg_start = commas[0] + 1
    second_arg_end = commas[1] if len(commas) > 1 else len(call_body)

    first_arg = call_body[:first_arg_end]
    second_arg = call_body[second_arg_start:second_arg_end]

    company_color = colors.get("company")
    if company_color and is_company_entry and target is not None:
        first_arg = _wrap_typst_field_value(first_arg, target.company, fill=company_color)

    date_color = colors.get("date_location")
    if date_color:
        second_arg = _wrap_typst_block_content(second_arg, fill=date_color)

    styled_call_body = (
        first_arg
        + call_body[first_arg_end:second_arg_start]
        + second_arg
        + call_body[second_arg_end:]
    )
    role_color = colors.get("role")
    if role_color and is_company_entry and target is not None:
        styled_call_body = _wrap_typst_field_value(
            styled_call_body,
            target.role,
            fill=role_color,
        )
    stack_color = colors.get("stack")
    if stack_color:
        styled_call_body = _wrap_summary_text_blocks(styled_call_body, fill=stack_color)
    return styled_call_body


def _workbench_entry_style_targets(
    resume_data: dict[str, Any],
) -> list[_WorkbenchEntryStyleTarget]:
    raw_entries = resume_data.get("workExperience")
    if not isinstance(raw_entries, list):
        return []
    targets: list[_WorkbenchEntryStyleTarget] = []
    for entry in raw_entries:
        if not isinstance(entry, dict):
            continue
        company = entry.get("company")
        role = entry.get("position") or entry.get("title") or entry.get("role")
        targets.append(
            _WorkbenchEntryStyleTarget(
                company=company.strip() if isinstance(company, str) else None,
                role=role.strip() if isinstance(role, str) else None,
            )
        )
    return targets


def _style_entry_calls_in_typst(
    typst: str,
    colors: dict[str, str],
    *,
    work_targets: list[_WorkbenchEntryStyleTarget] | None = None,
) -> str:
    return _style_entry_calls_with_report(
        typst,
        colors,
        work_targets=work_targets,
    ).text


def _style_entry_calls_with_report(
    typst: str,
    colors: dict[str, str],
    *,
    work_targets: list[_WorkbenchEntryStyleTarget] | None = None,
) -> _TypstStyleResult:
    if not colors:
        return _TypstStyleResult(text=typst, experience_entries=0)
    output: list[str] = []
    cursor = 0
    call_prefixes = (_PROJECT_ENTRY_CALL, _REGULAR_ENTRY_CALL)
    work_target_index = 0
    work_targets = work_targets or []
    while True:
        matches = [
            (index, prefix)
            for prefix in call_prefixes
            if (index := typst.find(prefix, cursor)) != -1
        ]
        if not matches:
            output.append(typst[cursor:])
            break
        start, prefix = min(matches, key=lambda item: item[0])
        open_paren = start + len(prefix) - 1
        close_paren = _matching_typst_delimiter(typst, open_paren)
        if close_paren is None:
            output.append(typst[cursor:])
            break
        call_body = typst[open_paren + 1:close_paren]
        section_matches = list(_TYPST_SECTION_HEADING_RE.finditer(typst[:start]))
        section_title = (
            section_matches[-1].group("title").strip().casefold()
            if section_matches
            else ""
        )
        is_project_entry = prefix == _PROJECT_ENTRY_CALL or section_title == "projects"
        is_company_entry = "experience" in section_title and not is_project_entry
        target = None
        if is_company_entry:
            first_arg_end = _top_level_typst_commas(call_body)
            first_arg = call_body[:first_arg_end[0]] if first_arg_end else call_body
            matching_targets = [
                item
                for item in work_targets
                if item.company and item.company in first_arg
            ]
            if matching_targets:
                target = max(matching_targets, key=lambda item: len(item.company or ""))
            elif work_target_index < len(work_targets):
                target = work_targets[work_target_index]
            work_target_index += 1
        output.append(typst[cursor:start])
        output.append(prefix)
        output.append(
            _style_entry_call_body(
                call_body,
                colors,
                is_company_entry=is_company_entry,
                target=target,
            )
        )
        output.append(")")
        cursor = close_paren + 1
    return _TypstStyleResult(
        text="".join(output),
        experience_entries=work_target_index,
    )


def _apply_workbench_field_styles_to_typst(
    typst_path: Path,
    theme_settings: RenderThemeSettings,
    *,
    resume_data: dict[str, Any] | None = None,
) -> None:
    colors = _workbench_color_settings(theme_settings)
    if not colors:
        return
    try:
        original = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    work_targets = _workbench_entry_style_targets(resume_data or {})
    result = _style_entry_calls_with_report(
        original,
        colors,
        work_targets=work_targets,
    )
    if (colors.get("company") or colors.get("role")) and (
        result.experience_entries != len(work_targets)
    ):
        raise ValueError(
            "Experience styling stopped early: "
            f"processed {result.experience_entries} of {len(work_targets)} entries."
        )
    updated = result.text
    if updated != original:
        typst_path.write_text(updated, encoding="utf-8")


def _apply_workbench_letter_spacing_to_typst(
    typst_path: Path, theme_settings: RenderThemeSettings
) -> None:
    spacing = _workbench_letter_spacing_settings(theme_settings)
    if not spacing:
        return
    try:
        text = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    updated = text
    if name_spacing := spacing.get("name"):
        updated = re.sub(
            r"(?m)^(= )(?!#text\(tracking: )(.+?)\s*$",
            rf"\1#text(tracking: {name_spacing})[\2]",
            updated,
            count=1,
        )
    if headline_spacing := spacing.get("headline"):
        updated = _wrap_typst_calls(
            updated,
            call_prefix="#headline(",
            fill_prefix=f"#text(tracking: {headline_spacing})[",
        )
    if connections_spacing := spacing.get("connections"):
        updated = _wrap_typst_calls(
            updated,
            call_prefix="#connections(",
            fill_prefix=f"#text(tracking: {connections_spacing})[",
        )
    if section_spacing := spacing.get("section_titles"):
        updated = re.sub(
            r"(?m)^(==+ )(?!#text\(tracking: )(.+?)\s*$",
            rf"\1#text(tracking: {section_spacing})[\2]",
            updated,
        )
    if updated != text:
        typst_path.write_text(updated, encoding="utf-8")


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
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if in_string:
            if char == '"':
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
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if in_string:
            if char == '"':
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


def _patch_project_tech_stack_entries_with_count(typst: str) -> tuple[str, int, int]:
    output: list[str] = []
    cursor = 0
    replacement_count = 0
    project_entry_count = 0
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
        section_matches = list(_TYPST_SECTION_HEADING_RE.finditer(typst[:start]))
        section_title = (
            section_matches[-1].group("title").strip().casefold()
            if section_matches
            else ""
        )
        if section_title == "projects":
            project_entry_count += 1
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
        return updated, replacement_count, project_entry_count
    import_line_end = updated.find("\n", updated.find("#import "))
    if import_line_end == -1:
        return updated, replacement_count, project_entry_count
    return (
        updated[: import_line_end + 1] + _PROJECT_ENTRY_HELPER + updated[import_line_end + 1:],
        replacement_count,
        project_entry_count,
    )


def _project_target_count(resume_data: dict[str, Any]) -> int:
    projects = resume_data.get("personalProjects")
    if not isinstance(projects, list):
        return 0
    return sum(
        1
        for project in projects
        if isinstance(project, dict)
        and project.get("includeInResume", True) is not False
    )


def _apply_project_tech_stack_layout_to_typst(
    typst_path: Path,
    *,
    resume_data: dict[str, Any],
) -> None:
    try:
        original = typst_path.read_text(encoding="utf-8")
    except OSError:
        return
    updated, _, project_entry_count = _patch_project_tech_stack_entries_with_count(original)
    expected_count = _project_target_count(resume_data)
    if project_entry_count != expected_count:
        raise ValueError(
            "Project layout processing stopped early: "
            f"processed {project_entry_count} of {expected_count} entries."
        )
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

    stage = "model_validation"
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
        stage = "typst_generation"
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
            _apply_project_tech_stack_layout_to_typst(
                generated_typst,
                resume_data=resume_data,
            )
        if generated_typst is not None:
            _apply_workbench_field_styles_to_typst(
                generated_typst,
                theme_settings,
                resume_data=resume_data,
            )
        if generated_typst is not None:
            _apply_workbench_letter_spacing_to_typst(generated_typst, theme_settings)
        if generated_typst is not None:
            _apply_freeflow_typst_patch(generated_typst, theme_settings)
        stage = "pdf_generation"
        generated_pdf = _generate_pdf_with_ats_profile(
            model, generated_typst, theme_settings
        )
        stage = "preview_generation"
        generated_pngs = generate_png(model, generated_typst) or []
        stage = "text_export"
        generated_markdown = generate_markdown(model)
        generated_html = generate_html(model, generated_markdown)
    except Exception as exc:  # noqa: BLE001
        message = str(exc) or exc.__class__.__name__
        line, column = _render_error_location(message)
        raise RenderCVRenderError(
            message,
            stage=stage,
            line=line,
            column=column,
        ) from exc

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
