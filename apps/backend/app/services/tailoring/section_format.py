"""Section-header parsing helpers for LLM-facing tailoring formats."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Any

from app.services.tailoring.models import TailoringResponseContract

SECTION_HEADER_FORMAT = "section_header_v1"
_DEFAULT_RETAIN_WHY = "Retained by section-header output."
_DEFAULT_CHANGE_WHY = "Changed by section-header output."


@dataclass
class SectionParseResult:
    summary: str | None = None
    summary_why: str | None = None
    experience: dict[int, dict[str, Any]] = field(default_factory=dict)
    projects: dict[int, dict[str, Any]] = field(default_factory=dict)
    skills: dict[int, dict[str, Any]] = field(default_factory=dict)
    bold_keywords: list[str] = field(default_factory=list)
    bold_keywords_why: str | None = None
    warnings: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


def _parse_header(line: str) -> tuple[str, int | None] | None:
    stripped = line.strip()
    if not stripped:
        return None
    stripped = re.sub(r"\s*\(.*$", "", stripped).strip()
    if stripped.startswith("==="):
        stripped = stripped.lstrip("= ").strip()
        if "===" in stripped:
            stripped = stripped.split("===", 1)[0].strip()
    stripped = stripped.upper()
    m = re.match(
        r"^(SUMMARY|EXPERIENCE|PROJECT|SKILLS|BOLD\s*KEYWORDS?|JD\s+METADATA|JD\s+INTEL|COVER\s+LETTER|OUTREACH\s+MESSAGE)(?:\s+(\d+))?$",
        stripped,
    )
    if not m:
        return None
    section = m.group(1).replace(" ", "_")
    index = int(m.group(2)) if m.group(2) is not None else None
    return section, index


def extract_streamed_resume_sections(raw: str) -> list[dict[str, Any]]:
    """Return displayable resume sections visible in partial section-header text."""

    sections: list[dict[str, Any]] = []
    current: tuple[str, int | None] | None = None
    current_lines: list[str] = []

    def flush() -> None:
        if current is None:
            return
        section, index = current
        if section not in {"SUMMARY", "EXPERIENCE", "PROJECT", "SKILLS", "BOLD_KEYWORDS"}:
            return
        content = "\n".join(current_lines).strip()
        if not content:
            return
        section_id = section.lower()
        if index is not None:
            section_id = f"{section_id}_{index}"
        sections.append(
            {
                "section_id": section_id,
                "section": section,
                "index": index,
                "content": content,
            }
        )

    for line in raw.splitlines():
        header = _parse_header(line)
        if header:
            flush()
            current = header
            current_lines = []
            continue
        if current is not None:
            current_lines.append(line)
    flush()
    return sections


def _normalize_label(raw: str) -> str:
    upper = re.sub(r"\s+", " ", raw.strip().upper().replace("_", " "))
    m = re.match(r"^(?:BULLET|B)\s*(\d+)$", upper)
    if m:
        return f"B{m.group(1)}"
    m = re.match(r"^(?:BULLET|B)\s*(\d+)\s*-\s*WHY$", upper)
    if m:
        return f"B{m.group(1)}-WHY"
    m = re.match(r"^(?:GROUP|SKILL|G)\s*(\d+)$", upper)
    if m:
        return f"G{m.group(1)}"
    m = re.match(r"^(?:GROUP|SKILL|G)\s*(\d+)\s*-\s*WHY$", upper)
    if m:
        return f"G{m.group(1)}-WHY"
    aliases = {
        "TITLE": "POSITION",
        "ROLE": "POSITION",
        "TECH STACK": "STACK",
        "TECHSTACK": "STACK",
        "KEYWORDS": "STACK",
        "PROJECT NAME": "NAME",
        "BOLD": "BOLD",
        "BOLD KEYWORDS": "BOLD",
    }
    return aliases.get(upper, upper)


_RETAIN_SIGNALS = {
    "",
    "-",
    "--",
    "\u2013",
    "\u2014",
    "null",
    "none",
    "unchanged",
    "keep",
    "n/a",
    "[retain]",
}


def _is_retain(value: str | None) -> bool:
    if value is None:
        return True
    normalized = value.strip().casefold()
    return normalized in _RETAIN_SIGNALS or normalized in {"-", "--"}


def _cell(value: str | None, why: str | None = None) -> dict[str, str | None]:
    changed = not _is_retain(value)
    return {
        "value": value.strip() if changed and value is not None else None,
        "why": (why or (_DEFAULT_CHANGE_WHY if changed else _DEFAULT_RETAIN_WHY)).strip(),
    }


def _split_same_line_why(value: str) -> tuple[str, str | None]:
    m = re.search(r"\s+WHY\s*:\s*", value, flags=re.IGNORECASE)
    if not m:
        return value.strip(), None
    return value[: m.start()].strip(), value[m.end() :].strip() or None


def _entry(container: dict[int, dict[str, Any]], index: int) -> dict[str, Any]:
    return container.setdefault(
        index,
        {
            "position": None,
            "name": None,
            "tech_stacks": None,
            "bullets": {},
            "why": {},
        },
    )


def parse_resume_section_output(
    raw: str,
    contract: TailoringResponseContract,
) -> SectionParseResult:
    result = SectionParseResult()
    current: tuple[str, int | None] | None = None
    current_value_target: tuple[str, int | None, str] | None = None
    summary_lines: list[str] = []

    def set_current(section: str, index: int | None) -> None:
        nonlocal current, current_value_target
        current = (section, index)
        current_value_target = None
        if section == "SUMMARY":
            summary_lines.clear()
            result.summary = None
            result.summary_why = None
        elif section == "EXPERIENCE" and index is not None:
            if index >= len(contract.experience_entries):
                result.warnings.append(f"experience[{index}] out of range; section skipped")
                current = None
            else:
                result.experience[index] = {
                    "position": None,
                    "name": None,
                    "tech_stacks": None,
                    "bullets": {},
                    "why": {},
                }
        elif section == "PROJECT" and index is not None:
            if index >= len(contract.project_entries):
                result.warnings.append(f"projects[{index}] out of range; section skipped")
                current = None
            else:
                result.projects[index] = {
                    "position": None,
                    "name": None,
                    "tech_stacks": None,
                    "bullets": {},
                    "why": {},
                }

    for raw_line in raw.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        header = _parse_header(line)
        if header:
            set_current(*header)
            continue
        if current is None:
            continue
        if line.upper().startswith("BUDGET:") or line.startswith(("- Budget:", "* Budget:", "\u2b26")):
            continue

        section, index = current
        if ":" in line:
            label_raw, _, value_raw = line.partition(":")
            label = _normalize_label(label_raw)
            value, same_line_why = _split_same_line_why(value_raw.strip())
            if label == "BOLD":
                current = ("BOLD_KEYWORDS", None)
                current_value_target = None
                result.bold_keywords.extend(_parse_csv_values(value))
                continue
            if value == "" and label not in {"WHY"} and (
                section in {"EXPERIENCE", "PROJECT", "SKILLS"} or label in {"SUMMARY", "VALUE"}
            ):
                result.warnings.append(f"blank value for {section}.{label}; treating as retain")

            if section == "SUMMARY":
                if label == "WHY":
                    result.summary_why = value
                elif label in {"SUMMARY", "VALUE"}:
                    result.summary = None if _is_retain(value) else value
                else:
                    summary_lines.append(line)
                current_value_target = None
                continue

            if section == "BOLD_KEYWORDS":
                if label == "WHY":
                    result.bold_keywords_why = value
                elif label in {"BOLD", "KEYWORDS", "BOLD KEYWORDS"}:
                    result.bold_keywords.extend(_parse_csv_values(value))
                else:
                    result.bold_keywords.extend(_parse_csv_values(line))
                current_value_target = None
                continue

            if section == "EXPERIENCE" and index is not None:
                entry = _entry(result.experience, index)
                if label == "POSITION":
                    entry["position"] = value
                    if same_line_why:
                        entry["why"]["position"] = same_line_why
                    current_value_target = ("experience", index, "position")
                elif label == "STACK":
                    entry["tech_stacks"] = value
                    if same_line_why:
                        entry["why"]["tech_stacks"] = same_line_why
                    current_value_target = ("experience", index, "tech_stacks")
                elif re.match(r"^B\d+$", label):
                    b_idx = int(label[1:])
                    if _bullet_in_range(contract.experience_bullet_counts, index, b_idx):
                        entry["bullets"][b_idx] = {"value": value, "why": same_line_why}
                        current_value_target = ("experience", index, f"B{b_idx}")
                    else:
                        result.warnings.append(f"experience[{index}].B{b_idx} out of range")
                        current_value_target = None
                elif re.match(r"^B\d+-WHY$", label):
                    b_idx = int(label[1:].split("-", 1)[0])
                    entry["bullets"].setdefault(b_idx, {"value": None, "why": None})["why"] = value
                    current_value_target = None
                continue

            if section == "PROJECT" and index is not None:
                entry = _entry(result.projects, index)
                if label == "NAME":
                    entry["name"] = value
                    if same_line_why:
                        entry["why"]["name"] = same_line_why
                    current_value_target = ("project", index, "name")
                elif label == "STACK":
                    entry["tech_stacks"] = value
                    if same_line_why:
                        entry["why"]["tech_stacks"] = same_line_why
                    current_value_target = ("project", index, "tech_stacks")
                elif re.match(r"^B\d+$", label):
                    b_idx = int(label[1:])
                    if _bullet_in_range(contract.project_bullet_counts, index, b_idx):
                        entry["bullets"][b_idx] = {"value": value, "why": same_line_why}
                        current_value_target = ("project", index, f"B{b_idx}")
                    else:
                        result.warnings.append(f"projects[{index}].B{b_idx} out of range")
                        current_value_target = None
                elif re.match(r"^B\d+-WHY$", label):
                    b_idx = int(label[1:].split("-", 1)[0])
                    entry["bullets"].setdefault(b_idx, {"value": None, "why": None})["why"] = value
                    current_value_target = None
                continue

            if section == "SKILLS":
                if re.match(r"^G\d+$", label):
                    g_idx = int(label[1:])
                    label_value, values = _parse_skill_line(value)
                    result.skills[g_idx] = {
                        "label": label_value,
                        "values": values,
                        "why": same_line_why,
                    }
                elif re.match(r"^G\d+-WHY$", label):
                    g_idx = int(label[1:].split("-", 1)[0])
                    result.skills.setdefault(g_idx, {"label": None, "values": [], "why": None})["why"] = value
                current_value_target = None
                continue

        if section == "SUMMARY":
            summary_lines.append(line)
            continue
        if section == "BOLD_KEYWORDS":
            result.bold_keywords.extend(_parse_csv_values(line))
            continue
        if current_value_target is not None:
            kind, idx, field_name = current_value_target
            container = result.experience if kind == "experience" else result.projects
            entry = _entry(container, int(idx or 0))
            if field_name.startswith("B"):
                b_idx = int(field_name[1:])
                existing = entry["bullets"].setdefault(b_idx, {"value": "", "why": None})
                existing["value"] = f"{existing.get('value') or ''} {line}".strip()
            else:
                entry[field_name] = f"{entry.get(field_name) or ''} {line}".strip()
            result.warnings.append(f"multiline continuation in {kind}[{idx}].{field_name}")

    if result.summary is None and summary_lines:
        summary = " ".join(summary_lines).strip()
        result.summary = None if _is_retain(summary) else summary
    result.bold_keywords = _dedupe(result.bold_keywords)
    return result


def _bullet_in_range(counts: list[int], entry_index: int, bullet_index: int) -> bool:
    return entry_index < len(counts) and 0 <= bullet_index < counts[entry_index]


def _parse_csv_values(value: str) -> list[str]:
    values: list[str] = []
    for part in value.split(","):
        cleaned = re.sub(r"^(?:[-*]+|\d+[.)])\s*", "", part.strip()).strip()
        if cleaned and not _is_retain(cleaned):
            values.append(cleaned)
    return values


def _dedupe(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for value in values:
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(value)
    return out


def _parse_skill_line(value: str) -> tuple[str | None, list[str | None]]:
    if "|" not in value:
        return (None if _is_retain(value) else value.strip()), []
    label, _, values = value.partition("|")
    parsed_label = None if _is_retain(label) else label.strip()
    parsed_values = [None if _is_retain(v) else v.strip() for v in values.split(",")]
    return parsed_label, parsed_values


def to_compact_diff(
    parsed: SectionParseResult,
    contract: TailoringResponseContract,
) -> dict[str, Any]:
    diff: dict[str, Any] = {
        "summary": _cell(parsed.summary, parsed.summary_why),
        "experience": {},
        "projects": {},
        "bold_keywords": parsed.bold_keywords,
    }
    if parsed.bold_keywords_why:
        diff["bold_keywords_why"] = parsed.bold_keywords_why

    for idx, count in enumerate(contract.experience_bullet_counts):
        entry = parsed.experience.get(idx, {})
        why_map = entry.get("why", {}) if isinstance(entry, dict) else {}
        diff["experience"][str(idx)] = {
            "position": _cell(entry.get("position"), why_map.get("position")),
            "tech_stacks": _cell(entry.get("tech_stacks"), why_map.get("tech_stacks")),
            "bullets": {
                str(b_idx): _cell(
                    (entry.get("bullets", {}).get(b_idx) or {}).get("value"),
                    (entry.get("bullets", {}).get(b_idx) or {}).get("why"),
                )
                for b_idx in range(count)
            },
        }

    for idx, count in enumerate(contract.project_bullet_counts):
        entry = parsed.projects.get(idx, {})
        why_map = entry.get("why", {}) if isinstance(entry, dict) else {}
        diff["projects"][str(idx)] = {
            "name": _cell(entry.get("name"), why_map.get("name")),
            "tech_stacks": _cell(entry.get("tech_stacks"), why_map.get("tech_stacks")),
            "bullets": {
                str(b_idx): _cell(
                    (entry.get("bullets", {}).get(b_idx) or {}).get("value"),
                    (entry.get("bullets", {}).get(b_idx) or {}).get("why"),
                )
                for b_idx in range(count)
            },
        }

    if contract.skill_group_value_counts:
        skills: list[dict[str, Any]] = []
        for g_idx, expected_count in enumerate(contract.skill_group_value_counts):
            group = parsed.skills.get(g_idx, {})
            values = list(group.get("values") or [])
            if len(values) < expected_count:
                parsed.warnings.append(
                    f"skills[{g_idx}] padded from {len(values)} to {expected_count} values"
                )
                values.extend([None] * (expected_count - len(values)))
            elif len(values) > expected_count:
                parsed.warnings.append(
                    f"skills[{g_idx}] truncated from {len(values)} to {expected_count} values"
                )
                values = values[:expected_count]
            skills.append(
                {
                    "label": _cell(group.get("label"), group.get("why")),
                    "values": [{"value": value if not _is_retain(value) else None} for value in values],
                }
            )
        diff["skills"] = skills

    return diff


def parse_jd_metadata(raw_extract: str) -> dict[str, str | None]:
    result: dict[str, str | None] = {"role": None, "company": None, "location": None}
    for label, value in _section_key_values(raw_extract, "JD METADATA").items():
        key = label.casefold()
        if key == "role":
            result["role"] = value or None
        elif key == "company":
            result["company"] = value or None
        elif key == "location":
            result["location"] = value or None
    return result


def extract_jd_intel_section(raw_extract: str) -> str:
    return _extract_section(raw_extract, "JD INTEL")


def section_jd_wrapper(raw_extract: str) -> dict[str, Any]:
    return {
        "format": SECTION_HEADER_FORMAT,
        "raw": raw_extract,
        "metadata": parse_jd_metadata(raw_extract),
        "intel": extract_jd_intel_section(raw_extract),
    }


def is_section_jd_wrapper(value: Any) -> bool:
    return isinstance(value, dict) and value.get("format") == SECTION_HEADER_FORMAT


def jd_intel_text_from_blob(value: Any) -> str:
    if is_section_jd_wrapper(value):
        return str(value.get("intel") or "").strip()
    if isinstance(value, dict):
        import json

        return json.dumps(value, separators=(",", ":"), ensure_ascii=True)
    return ""


def jd_metadata_from_blob(value: Any) -> dict[str, str | None]:
    if is_section_jd_wrapper(value):
        metadata = value.get("metadata")
        if isinstance(metadata, dict):
            return {
                "role": metadata.get("role") or None,
                "company": metadata.get("company") or None,
                "location": metadata.get("location") or None,
            }
        return parse_jd_metadata(str(value.get("raw") or ""))
    return {"role": None, "company": None, "location": None}


def jd_keywords_from_section_blob(value: Any) -> list[str]:
    if not is_section_jd_wrapper(value):
        return []
    intel = str(value.get("intel") or "")
    keywords: list[str] = []
    for line in intel.splitlines():
        if ":" not in line:
            continue
        label, _, raw = line.partition(":")
        if label.strip().upper() in {"AVOID", "LEVEL", "DOMAIN", "CONTEXT", "TARGETING"}:
            continue
        keywords.extend(_parse_csv_values(raw))
    return _dedupe(keywords)


def _section_key_values(raw: str, section_name: str) -> dict[str, str]:
    values: dict[str, str] = {}
    section = _extract_section(raw, section_name)
    for line in section.splitlines():
        if ":" not in line:
            continue
        key, _, value = line.partition(":")
        values[key.strip()] = value.strip()
    return values


def _extract_section(raw: str, section_name: str) -> str:
    target = section_name.strip().casefold()
    in_section = False
    lines: list[str] = []
    for line in raw.splitlines():
        header = _parse_header(line)
        if header:
            name, _idx = header
            normalized = name.replace("_", " ").casefold()
            if normalized == target:
                in_section = True
                continue
            if in_section:
                break
        elif in_section:
            lines.append(line.rstrip())
    return "\n".join(lines).strip()
