"""Resume improvement service using LLM."""

import copy
import json
import logging
import re
from difflib import SequenceMatcher
from dataclasses import dataclass
from typing import Any, Callable

from app.llm import complete_json
from app.prompts import (
    CRITICAL_TRUTHFULNESS_RULES,
    DEFAULT_IMPROVE_PROMPT_ID,
    EXTRACT_KEYWORDS_PROMPT,
    IMPROVE_RESUME_PROMPT,
    IMPROVE_STRATEGY_GUIDANCE,
    get_language_name,
)
from app.schemas import ResumeData, ResumeFieldDiff, ResumeDiffSummary
from app.schemas.models import ResumeChange
from app.services.cover_letter import extract_job_target_metadata
from app.services.additional_groups import (
    additional_items_match,
    extract_additional_groups,
    flatten_additional_items,
    normalize_additional_groups,
)

logger = logging.getLogger(__name__)

# LLM-011: Prompt injection patterns to sanitize
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+)?previous\s+instructions",
    r"disregard\s+(all\s+)?above",
    r"forget\s+(everything|all)",
    r"new\s+instructions?:",
    r"system\s*:",
    r"<\s*/?\s*system\s*>",
    r"\[\s*INST\s*\]",
    r"\[\s*/\s*INST\s*\]",
]

_MAX_PROMPT_JD_CHARS = 4000
_MAX_PROMPT_LIST_ITEMS = 12


@dataclass(frozen=True)
class DiffConfidence:
    added: str
    removed: str
    modified: str


def _sanitize_user_input(text: str) -> str:
    """LLM-011: Sanitize user input to prevent prompt injection.

    Removes or redacts common injection patterns that could manipulate LLM behavior.
    """
    sanitized = text
    for pattern in _INJECTION_PATTERNS:
        sanitized = re.sub(pattern, "[REDACTED]", sanitized, flags=re.IGNORECASE)
    return sanitized


def _check_for_truncation(data: dict[str, Any]) -> None:
    """LLM-006: Log warnings for obvious truncation signs before Pydantic validation.

    Note: personalInfo is intentionally excluded — the improve prompts tell the
    LLM to skip it, and _preserve_personal_info() restores it from the original.
    """

    # Check for suspiciously empty required arrays
    if "workExperience" in data and data["workExperience"] == []:
        logger.warning(
            "Resume has empty workExperience - possible truncation or unusual resume"
        )


def _normalize_prompt_list(value: Any, *, limit: int = _MAX_PROMPT_LIST_ITEMS) -> list[str]:
    """Normalize prompt lists to a short, deduplicated string list."""
    if not isinstance(value, list):
        return []

    normalized: list[str] = []
    seen: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        key = text.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(text)
        if len(normalized) >= limit:
            break
    return normalized


def _collect_job_keywords(job_keywords: dict[str, Any]) -> list[str]:
    """Return a stable list of JD keywords worth covering if supported."""
    combined: list[str] = []
    for key in ("required_skills", "preferred_skills", "keywords"):
        combined.extend(_normalize_prompt_list(job_keywords.get(key)))

    deduped: list[str] = []
    seen: set[str] = set()
    for keyword in combined:
        lowered = keyword.casefold()
        if lowered in seen:
            continue
        seen.add(lowered)
        deduped.append(keyword)
    return deduped


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check for a whole-keyword match."""
    pattern = rf"\b{re.escape(keyword.casefold())}\b"
    return bool(re.search(pattern, text.casefold()))


def _extract_resume_text(value: Any) -> str:
    """Flatten nested resume JSON into searchable text."""
    parts: list[str] = []

    def visit(node: Any) -> None:
        if isinstance(node, str):
            stripped = node.strip()
            if stripped:
                parts.append(stripped)
            return
        if isinstance(node, list):
            for item in node:
                visit(item)
            return
        if isinstance(node, dict):
            for item in node.values():
                visit(item)

    visit(value)
    return "\n".join(parts)


def _find_supported_keywords(job_keywords: dict[str, Any], resume_source: Any) -> list[str]:
    """Return JD keywords that are already supported by the source resume."""
    resume_text = _extract_resume_text(resume_source)
    return [
        keyword
        for keyword in _collect_job_keywords(job_keywords)
        if _keyword_in_text(keyword, resume_text)
    ]


def _canonicalize_prompt_resume_data(
    original_resume_data: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """Normalize resume JSON for prompt use and strip personal info noise."""
    if original_resume_data is None:
        return None

    try:
        canonical = ResumeData.model_validate(original_resume_data).model_dump()
    except Exception as exc:
        logger.warning("Falling back to raw resume JSON for prompt payload: %s", exc)
        if not isinstance(original_resume_data, dict):
            return None
        canonical = copy.deepcopy(original_resume_data)

    canonical.pop("personalInfo", None)
    additional = canonical.get("additional")
    if isinstance(additional, dict):
        canonical["additional"] = normalize_additional_groups(additional)
    return canonical


def _collect_dict_keys(entries: list[Any]) -> list[str]:
    """Preserve first-seen key order across a list of dict entries."""
    ordered_keys: list[str] = []
    seen: set[str] = set()
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        for key in entry:
            if key in seen:
                continue
            seen.add(key)
            ordered_keys.append(key)
    return ordered_keys


def _build_resume_output_plan(
    resume_data: dict[str, Any] | None,
    *,
    prompt_id: str,
) -> str:
    """Build a compact, unambiguous output contract for resume tailoring."""
    if resume_data is None:
        return (
            'Return these top-level keys only: ["summary", "workExperience", '
            '"education", "personalProjects", "additional", "sectionMeta", '
            '"customSections"].\n'
            "- summary: string\n"
            "- workExperience: array of objects copied from the input shape; tailor description only\n"
            "- education: array of objects copied from the input shape\n"
            "- personalProjects: array of objects copied from the input shape; tailor description only\n"
            '- additional: object with "groups" array; keep every original item exactly once\n'
            "- sectionMeta: copy through unchanged\n"
            "- customSections: preserve the same keys and structure from the input"
        )

    lines: list[str] = []
    top_level_keys = [
        "summary",
        "workExperience",
        "education",
        "personalProjects",
        "additional",
        "sectionMeta",
        "customSections",
    ]
    lines.append(
        "Return these top-level keys only: "
        + json.dumps(top_level_keys, ensure_ascii=True)
    )
    lines.append("- summary: string")

    work_entries = resume_data.get("workExperience", [])
    lines.append(
        f"- workExperience: {len(work_entries)} entries; keep keys "
        f"{json.dumps(_collect_dict_keys(work_entries), ensure_ascii=True)}; "
        "copy id/title/company/location/years exactly; tailor description only"
    )

    education_entries = resume_data.get("education", [])
    lines.append(
        f"- education: {len(education_entries)} entries; keep keys "
        f"{json.dumps(_collect_dict_keys(education_entries), ensure_ascii=True)}; "
        "copy id/institution/degree/location/years exactly"
    )

    project_entries = resume_data.get("personalProjects", [])
    lines.append(
        f"- personalProjects: {len(project_entries)} entries; keep keys "
        f"{json.dumps(_collect_dict_keys(project_entries), ensure_ascii=True)}; "
        "copy id/name/role/location/years exactly; tailor description only"
    )

    additional_groups = []
    additional = resume_data.get("additional")
    if isinstance(additional, dict):
        additional_groups = additional.get("groups", [])
    lines.append(
        f"- additional.groups: {len(additional_groups)} group objects; each needs "
        '["id", "label", "items"]; keep every original item exactly once; '
        "you may reorder, regroup, or relabel"
    )

    section_meta = resume_data.get("sectionMeta", [])
    lines.append(
        f"- sectionMeta: {len(section_meta)} entries; copy exactly as-is"
    )

    custom_sections = resume_data.get("customSections", {})
    if isinstance(custom_sections, dict) and custom_sections:
        section_keys = list(custom_sections.keys())
        lines.append(
            "- customSections: preserve these keys exactly: "
            + json.dumps(section_keys, ensure_ascii=True)
        )
        for section_key, section_value in custom_sections.items():
            if not isinstance(section_value, dict):
                continue
            section_type = str(section_value.get("sectionType", "")).strip() or "unknown"
            if section_type == "itemList":
                item_count = len(section_value.get("items", []))
                lines.append(
                    f'- customSections["{section_key}"]: itemList with {item_count} items; '
                    "preserve item count, ids, titles, subtitles, and years"
                )
            elif section_type == "text":
                lines.append(
                    f'- customSections["{section_key}"]: text section; keep sectionType "text" '
                    "and refine only the text value if needed"
                )
            else:
                lines.append(
                    f'- customSections["{section_key}"]: preserve the original structure exactly'
                )
    else:
        lines.append("- customSections: {}")

    if prompt_id in {"nudge", "keywords"}:
        lines.append("- description arrays: keep the same length and ordering as the input")
    else:
        lines.append(
            "- description arrays: keep them close to the input size; add at most one supported bullet per work/project entry"
        )

    return "\n".join(lines)


def _prepare_job_analysis_for_prompt(
    job_keywords: dict[str, Any],
    *,
    supported_keywords: list[str],
) -> str:
    """Build a concise job-analysis block for the primary tailoring prompt."""
    analysis: dict[str, Any] = {}
    for key in ("core_title", "company_name", "location", "experience_years", "seniority_level"):
        value = job_keywords.get(key)
        if value not in (None, "", []):
            analysis[key] = value

    for key in (
        "required_skills",
        "preferred_skills",
        "keywords",
        "key_responsibilities",
        "experience_requirements",
        "education_requirements",
    ):
        values = _normalize_prompt_list(job_keywords.get(key))
        if values:
            analysis[key] = values

    if supported_keywords:
        analysis["supported_keywords_from_resume"] = supported_keywords

    return json.dumps(analysis or {}, indent=2, ensure_ascii=True)


def _prepare_job_description_for_prompt(job_description: str) -> str:
    """Trim long job descriptions so the prompt stays focused."""
    if len(job_description) <= _MAX_PROMPT_JD_CHARS:
        return job_description
    logger.info(
        "Truncating job description for primary tailoring prompt (%d -> %d chars)",
        len(job_description),
        _MAX_PROMPT_JD_CHARS,
    )
    return job_description[:_MAX_PROMPT_JD_CHARS]


def _build_resume_retry_hint(resume_data: dict[str, Any] | None) -> str:
    """Return a prompt-specific retry hint for full resume generation."""
    top_level_keys = [
        "summary",
        "workExperience",
        "education",
        "personalProjects",
        "additional",
        "sectionMeta",
        "customSections",
    ]
    if isinstance(resume_data, dict):
        top_level_keys = [key for key in top_level_keys if key in resume_data]
    return (
        "Output the COMPLETE JSON object with these top-level keys only: "
        f"{json.dumps(top_level_keys, ensure_ascii=True)}. "
        "Do not include personalInfo. Start with { and end with }. "
        "Do not omit arrays or objects, even when they are empty."
    )


# ---------------------------------------------------------------------------
# Diff-based improvement: path resolution, applier, verifier, LLM generator
# ---------------------------------------------------------------------------

_PATH_SEGMENT_RE = re.compile(r"([a-zA-Z_]+)(?:\[(\d+)\])?")

# Allowed path patterns — only these can be modified by diffs
_ALLOWED_PATH_PATTERNS = [
    re.compile(r"^summary$"),
    re.compile(r"^workExperience\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^personalProjects\[\d+\]\.description(\[\d+\])?$"),
    re.compile(r"^additional\.groups$"),
]

# Blocked path prefixes — always rejected
_BLOCKED_PATH_PREFIXES = frozenset({
    "personalInfo",
    "customSections",
    "sectionMeta",
})

# Blocked field names — rejected when they appear as the leaf of a path
_BLOCKED_FIELD_NAMES = frozenset({
    "years",
    "company",
    "institution",
    "title",
    "degree",
    "name",
    "role",
    "github",
    "website",
    "location",
    "id",
})

_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")


def _is_path_allowed(path: str) -> bool:
    """Check if a path is in the allowed whitelist."""
    return any(p.match(path) for p in _ALLOWED_PATH_PATTERNS)


def _is_path_blocked(path: str) -> bool:
    """Check if a path matches any blocked pattern."""
    for prefix in _BLOCKED_PATH_PREFIXES:
        if path == prefix or path.startswith(prefix + ".") or path.startswith(prefix + "["):
            return True

    # Check if the leaf field is blocked
    segments = path.split(".")
    if segments:
        last_segment = segments[-1]
        field_name = re.sub(r"\[\d+\]$", "", last_segment)
        # "description" is the one allowed field that shares a name pattern
        if field_name in _BLOCKED_FIELD_NAMES and field_name != "description":
            return True

    if path.startswith("education"):
        return True

    return False


def _resolve_path(data: dict[str, Any], path: str) -> tuple[Any, bool]:
    """Resolve a dot+bracket path to a value in the data dict.

    Returns:
        (value, success). On failure returns (None, False).
    """
    current: Any = data
    for segment_match in _PATH_SEGMENT_RE.finditer(path):
        key = segment_match.group(1)
        index_str = segment_match.group(2)

        if not isinstance(current, dict) or key not in current:
            return None, False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return None, False
            current = current[index]

    return current, True


def _set_at_path(data: dict[str, Any], path: str, value: Any) -> bool:
    """Set a value at the given path. Returns True on success."""
    segments = list(_PATH_SEGMENT_RE.finditer(path))
    if not segments:
        return False

    # Navigate to parent of the target
    current: Any = data
    for seg in segments[:-1]:
        key = seg.group(1)
        index_str = seg.group(2)

        if not isinstance(current, dict) or key not in current:
            return False
        current = current[key]

        if index_str is not None:
            index = int(index_str)
            if not isinstance(current, list) or index < 0 or index >= len(current):
                return False
            current = current[index]

    # Set on the final segment
    last = segments[-1]
    key = last.group(1)
    index_str = last.group(2)

    if index_str is not None:
        if not isinstance(current, dict) or key not in current:
            return False
        target = current[key]
        index = int(index_str)
        if not isinstance(target, list) or index < 0 or index >= len(target):
            return False
        target[index] = value
    else:
        if not isinstance(current, dict):
            return False
        current[key] = value

    return True


def _verify_original_matches(actual: Any, expected: str | None) -> bool:
    """Verify that the original text from the diff matches the actual value."""
    if expected is None:
        return True  # No verification needed (e.g. append, reorder)
    if not isinstance(actual, str):
        return False
    return actual.strip().casefold() == expected.strip().casefold()


def apply_diffs(
    original: dict[str, Any],
    changes: list[ResumeChange],
) -> tuple[dict[str, Any], list[ResumeChange], list[ResumeChange]]:
    """Apply verified diffs to original resume.

    Each change goes through 4 gates:
    1. Path is in allowed whitelist
    2. Path is not in blocked list
    3. Path resolves to an actual value in the original
    4. Original text matches (for replace actions)

    For reorder: validates the new list contains exactly the same items.

    Args:
        original: The original resume data (ResumeData-compatible dict)
        changes: List of changes from the LLM

    Returns:
        (result_dict, applied_changes, rejected_changes)
    """
    result = copy.deepcopy(original)
    if isinstance(result.get("additional"), dict):
        result["additional"] = normalize_additional_groups(
            result.get("additional"),
            seed_defaults_if_empty=False,
        )
    applied: list[ResumeChange] = []
    rejected: list[ResumeChange] = []

    for change in changes:
        path = change.path
        action = change.action

        # Gate 1: Path must be in allowed whitelist
        if not _is_path_allowed(path):
            logger.info("Diff rejected (not in allowed list): %s", path)
            rejected.append(change)
            continue

        # Gate 2: Path must not be blocked
        if _is_path_blocked(path):
            logger.info("Diff rejected (blocked path): %s", path)
            rejected.append(change)
            continue

        # Gate 3: Path must resolve to a real value
        actual_value, resolved = _resolve_path(result, path)
        if not resolved:
            logger.info("Diff rejected (path not found): %s", path)
            rejected.append(change)
            continue

        if action == "replace":
            # Gate 4: Original text must match what's actually there
            if not _verify_original_matches(actual_value, change.original):
                logger.info(
                    "Diff rejected (original mismatch): path=%s expected=%r actual=%r",
                    path,
                    change.original,
                    actual_value,
                )
                rejected.append(change)
                continue

            # Replace must use a string value (not list)
            if not isinstance(change.value, str):
                logger.info("Diff rejected (replace with non-string value): %s", path)
                rejected.append(change)
                continue

            if not _set_at_path(result, path, change.value):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "append":
            if not isinstance(actual_value, list):
                logger.info("Diff rejected (append to non-list): %s", path)
                rejected.append(change)
                continue
            # Append must use a non-empty string (not list, to avoid nested lists)
            if not isinstance(change.value, str) or not change.value.strip():
                logger.info("Diff rejected (append non-string or empty value): %s", path)
                rejected.append(change)
                continue
            actual_value.append(change.value)
            applied.append(change)

        elif action == "reorder":
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue
            # Validate same items (case-insensitive)
            orig_set = sorted(s.casefold() for s in actual_value if isinstance(s, str))
            new_set = sorted(s.casefold() for s in change.value if isinstance(s, str))
            if orig_set != new_set:
                logger.info("Diff rejected (reorder items mismatch): %s", path)
                rejected.append(change)
                continue
            # Preserve original casing: map new order back to original strings
            casefold_to_originals: dict[str, list[str]] = {}
            for item in actual_value:
                if isinstance(item, str):
                    casefold_to_originals.setdefault(item.casefold(), []).append(item)
            reordered: list[str] = []
            for item in change.value:
                if isinstance(item, str):
                    originals = casefold_to_originals.get(item.casefold(), [])
                    reordered.append(originals.pop(0) if originals else item)
            if not _set_at_path(result, path, reordered):
                rejected.append(change)
                continue
            applied.append(change)

        elif action == "regroup":
            if path != "additional.groups":
                logger.info("Diff rejected (regroup path unsupported): %s", path)
                rejected.append(change)
                continue
            if not isinstance(actual_value, list) or not isinstance(change.value, list):
                rejected.append(change)
                continue

            regrouped = normalize_additional_groups(
                {"groups": change.value},
                seed_defaults_if_empty=False,
            )
            if not additional_items_match({"groups": actual_value}, regrouped):
                logger.info("Diff rejected (regroup items mismatch): %s", path)
                rejected.append(change)
                continue

            if not _set_at_path(result, path, regrouped.get("groups", [])):
                rejected.append(change)
                continue
            applied.append(change)

        else:
            logger.info("Diff rejected (unknown action): %s", action)
            rejected.append(change)

    return result, applied, rejected


def _count_description_words(data: dict[str, Any]) -> int:
    """Count total words in all description and summary fields."""
    total = 0
    for key in ("workExperience", "personalProjects"):
        for entry in data.get(key, []):
            if isinstance(entry, dict):
                desc = entry.get("description", [])
                if isinstance(desc, list):
                    total += sum(len(str(d).split()) for d in desc)
                elif isinstance(desc, str):
                    total += len(desc.split())
    summary = data.get("summary", "")
    if isinstance(summary, str):
        total += len(summary.split())
    return total


def verify_diff_result(
    original: dict[str, Any],
    result: dict[str, Any],
    applied_changes: list[ResumeChange],
    job_keywords: dict[str, Any],
) -> list[str]:
    """Local quality checks on the diff result. Returns list of warnings.

    All checks are local (zero LLM cost). Warnings are informational —
    they don't block the response.
    """
    warnings: list[str] = []

    # Check 1: No empty result
    if not applied_changes:
        warnings.append("No changes were applied — resume returned unchanged")
        return warnings

    # Check 2: Section counts preserved
    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        result_count = len(result.get(key, []))
        if orig_count != result_count:
            warnings.append(
                f"Section count changed: {label} ({orig_count} → {result_count})"
            )

    # Check 3: Identity fields unchanged
    for key, id_fields in [
        ("workExperience", ["company", "title"]),
        ("education", ["institution", "degree"]),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for i, (orig, res) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig, dict) or not isinstance(res, dict):
                continue
            for field in id_fields:
                o_val = str(orig.get(field, "")).strip()
                r_val = str(res.get(field, "")).strip()
                if o_val and o_val != r_val:
                    warnings.append(
                        f"Identity field changed: {key}[{i}].{field} "
                        f"('{o_val}' → '{r_val}')"
                    )

    # Check 4: Word count ratio
    orig_words = _count_description_words(original)
    result_words = _count_description_words(result)
    if orig_words > 0 and result_words > orig_words * 1.8:
        warnings.append(
            f"Word count increased significantly: "
            f"{orig_words} → {result_words} ({result_words / orig_words:.1f}x)"
        )

    # Check 5: Invented metrics (covers both replace and append)
    for change in applied_changes:
        if change.action in ("replace", "append") and isinstance(change.value, str):
            new_metrics = set(_METRIC_RE.findall(change.value))
            # For append, original is None — any metric is potentially invented
            original_text = change.original or ""
            old_metrics = set(_METRIC_RE.findall(original_text))
            invented = new_metrics - old_metrics
            if invented:
                warnings.append(
                    f"Possible invented metric in {change.path}: "
                    f"{', '.join(invented)} (not in original)"
                )

    return warnings


async def extract_job_keywords(job_description: str) -> dict[str, Any]:
    """Extract keywords and requirements from job description.

    Args:
        job_description: Raw job description text

    Returns:
        Structured keywords and requirements
    """
    # LLM-011: Sanitize job description before using in prompt
    sanitized_jd = _sanitize_user_input(job_description)
    prompt = EXTRACT_KEYWORDS_PROMPT.format(job_description=sanitized_jd)

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert job description analyzer.",
        operation="job_extract_keywords",
        metadata={"job_description_chars": len(job_description)},
    )
    if not isinstance(result, dict):
        result = {}

    target_metadata = extract_job_target_metadata(
        job_description,
        job_keywords=result,
    )
    result["core_title"] = target_metadata.get("role")
    result["company_name"] = target_metadata.get("company")
    result["location"] = target_metadata.get("location")
    return result


MONTH_PATTERN = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\b",
    re.IGNORECASE,
)


async def improve_resume(
    original_resume: str,
    job_description: str,
    job_keywords: dict[str, Any],
    language: str = "en",
    prompt_id: str | None = None,
    original_resume_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Improve resume to better match job description.

    Args:
        original_resume: Original resume content (markdown)
        job_description: Target job description
        job_keywords: Extracted job keywords
        language: Output language code (en, es, zh, ja)
        prompt_id: Which tailor prompt to use
        original_resume_data: Structured resume JSON; used instead of
            markdown when available for higher-fidelity LLM input

    Returns:
        Improved resume data matching ResumeData schema

    LLM-006: Validates for truncation before Pydantic validation.
    LLM-011: Sanitizes job description to prevent prompt injection.
    """
    output_language = get_language_name(language)

    selected_prompt_id = prompt_id or DEFAULT_IMPROVE_PROMPT_ID
    strategy_guidance = IMPROVE_STRATEGY_GUIDANCE.get(
        selected_prompt_id,
        IMPROVE_STRATEGY_GUIDANCE[DEFAULT_IMPROVE_PROMPT_ID],
    )
    if selected_prompt_id not in CRITICAL_TRUTHFULNESS_RULES:
        logger.warning(
            "Missing truthfulness rules for prompt '%s'; using default rules.",
            selected_prompt_id,
        )
    truthfulness_rules = CRITICAL_TRUTHFULNESS_RULES.get(
        selected_prompt_id, CRITICAL_TRUTHFULNESS_RULES[DEFAULT_IMPROVE_PROMPT_ID]
    )
    if selected_prompt_id not in IMPROVE_STRATEGY_GUIDANCE:
        logger.warning(
            "Unknown prompt_id '%s'; using default tailoring guidance.",
            selected_prompt_id,
        )

    # LLM-011: Sanitize job description to prevent prompt injection
    sanitized_jd = _prepare_job_description_for_prompt(
        _sanitize_user_input(job_description)
    )

    prompt_resume_data = _canonicalize_prompt_resume_data(original_resume_data)
    supported_keywords = _find_supported_keywords(
        job_keywords,
        prompt_resume_data if prompt_resume_data is not None else original_resume,
    )
    job_analysis = _prepare_job_analysis_for_prompt(
        job_keywords,
        supported_keywords=supported_keywords,
    )
    resume_output_plan = _build_resume_output_plan(
        prompt_resume_data,
        prompt_id=selected_prompt_id,
    )
    if prompt_resume_data is not None:
        resume_input = json.dumps(prompt_resume_data, indent=2, ensure_ascii=True)
    else:
        resume_input = original_resume

    prompt = IMPROVE_RESUME_PROMPT.format(
        job_description=sanitized_jd,
        job_analysis=job_analysis,
        original_resume=resume_input,
        resume_output_plan=resume_output_plan,
        output_language=output_language,
        critical_truthfulness_rules=truthfulness_rules,
        strategy_primary_goal=strategy_guidance["primary_goal"],
        strategy_description_rule=strategy_guidance["description_rule"],
    )

    result = await complete_json(
        prompt=prompt,
        system_prompt="You are an expert resume editor. Output only valid JSON.",
        max_tokens=8192,
        retries=1,
        operation="resume_generate_full",
        metadata={
            "prompt_id": selected_prompt_id,
            "job_description_chars": len(job_description),
            "supported_keywords_count": len(supported_keywords),
            "structured_resume_input": prompt_resume_data is not None,
        },
        retry_hint=_build_resume_retry_hint(prompt_resume_data),
    )

    # LLM-006: Pre-validation check for truncation signs
    _check_for_truncation(result)

    # Validate against schema
    validated = ResumeData.model_validate(result)
    return validated.model_dump()


def _format_entry_label(parts: list[str], fallback: str) -> str:
    label = " | ".join([part for part in parts if part])
    return label if label else fallback


def _format_experience_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("title", ""),
            entry.get("company", ""),
            entry.get("years", ""),
        ],
        f"Work experience #{index + 1}",
    )


def _format_education_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("degree", ""),
            entry.get("institution", ""),
            entry.get("years", ""),
        ],
        f"Education #{index + 1}",
    )


def _format_project_entry(entry: dict[str, Any], index: int) -> str:
    return _format_entry_label(
        [
            entry.get("name", ""),
            entry.get("role", ""),
            entry.get("years", ""),
        ],
        f"Project #{index + 1}",
    )


def _normalize_entry(
    entry: dict[str, Any],
    ignore_keys: set[str] | None,
) -> dict[str, Any]:
    """Return an entry dict with ignored keys removed for diff comparisons.

    Ignored keys are excluded so entry-level change detection can skip fields
    that are diffed separately (e.g., description lists).
    """
    if ignore_keys is None:
        return entry
    return {key: value for key, value in entry.items() if key not in ignore_keys}


def _append_entry_changes(
    changes: list[ResumeFieldDiff],
    field_key: str,
    field_type: str,
    original_items: list[dict[str, Any]],
    improved_items: list[dict[str, Any]],
    formatter: Callable[[dict[str, Any], int], str],
    ignore_keys: set[str] | None = None,
) -> None:
    min_len = min(len(original_items), len(improved_items))

    for idx in range(min_len):
        original_entry = original_items[idx]
        improved_entry = improved_items[idx]
        if _normalize_entry(original_entry, ignore_keys) != _normalize_entry(
            improved_entry, ignore_keys
        ):
            changes.append(
                ResumeFieldDiff(
                    field_path=f"{field_key}[{idx}]",
                    field_type=field_type,
                    change_type="modified",
                    original_value=formatter(original_entry, idx),
                    new_value=formatter(improved_entry, idx),
                    confidence="medium",
                )
            )

    for idx in range(min_len, len(improved_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="added",
                new_value=formatter(improved_items[idx], idx),
                confidence="high",
            )
        )

    for idx in range(min_len, len(original_items)):
        changes.append(
            ResumeFieldDiff(
                field_path=f"{field_key}[{idx}]",
                field_type=field_type,
                change_type="removed",
                original_value=formatter(original_items[idx], idx),
                confidence="medium",
            )
        )


def _normalize_string_list(value: Any, field_name: str) -> list[str]:
    """Normalize string list values and log any non-string entries.

    Accepts lists of strings or objects containing name/label/value keys.
    """
    if not isinstance(value, list):
        return []
    normalized: list[str] = []
    invalid_count = 0
    for item in value:
        if isinstance(item, str):
            stripped = item.strip()
            if stripped:
                normalized.append(stripped)
            continue
        if isinstance(item, dict):
            candidate = item.get("name") or item.get("label") or item.get("value")
            if isinstance(candidate, str):
                stripped = candidate.strip()
                if stripped:
                    normalized.append(stripped)
                else:
                    invalid_count += 1
            else:
                invalid_count += 1
            continue
        if item is None:
            continue
        invalid_count += 1
    if invalid_count:
        logger.warning("Skipped non-string entries in %s: %d", field_name, invalid_count)
    return normalized


def _build_string_index(value: Any, field_name: str) -> dict[str, str]:
    """Build a case-insensitive index for string list comparisons."""
    items = _normalize_string_list(value, field_name)
    index: dict[str, str] = {}
    for item in items:
        key = item.casefold()
        if key not in index:
            index[key] = item
    return index


def _build_additional_item_index(value: Any) -> dict[str, tuple[str, str]]:
    """Map case-folded additional items to `(original_value, group_id)`."""
    index: dict[str, tuple[str, str]] = {}
    for group in extract_additional_groups(value):
        group_id = str(group.get("id", "")).strip()
        for item in _normalize_string_list(group.get("items", []), f"additional.groups[{group_id}]"):
            key = item.casefold()
            if key not in index:
                index[key] = (item, group_id)
    return index


def _format_additional_groups(value: Any) -> str:
    parts: list[str] = []
    for group in extract_additional_groups(value):
        label = str(group.get("label") or group.get("id") or "Additional").strip()
        items = _normalize_string_list(group.get("items", []), f"{label}.items")
        parts.append(f"{label}: {', '.join(items)}" if items else label)
    return " | ".join(parts)


def _extract_description_list(entry: Any) -> list[str]:
    if not isinstance(entry, dict):
        return []
    return _normalize_string_list(entry.get("description", []), "workExperience.description")


def _append_list_changes(
    changes: list[ResumeFieldDiff],
    field_path: str,
    field_type: str,
    original_items: list[str],
    improved_items: list[str],
    confidences: DiffConfidence,
) -> None:
    matcher = SequenceMatcher(a=original_items, b=improved_items, autojunk=False)
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        if tag == "delete":
            for item in original_items[i1:i2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="removed",
                        original_value=item,
                        confidence=confidences.removed,
                    )
                )
        elif tag == "insert":
            for item in improved_items[j1:j2]:
                changes.append(
                    ResumeFieldDiff(
                        field_path=field_path,
                        field_type=field_type,
                        change_type="added",
                        new_value=item,
                        confidence=confidences.added,
                    )
                )
        elif tag == "replace":
            original_segment = original_items[i1:i2]
            improved_segment = improved_items[j1:j2]
            segment_len = max(len(original_segment), len(improved_segment))
            for offset in range(segment_len):
                original_value = (
                    original_segment[offset] if offset < len(original_segment) else None
                )
                new_value = (
                    improved_segment[offset] if offset < len(improved_segment) else None
                )
                if original_value is not None and new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="modified",
                            original_value=original_value,
                            new_value=new_value,
                            confidence=confidences.modified,
                        )
                    )
                elif new_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="added",
                            new_value=new_value,
                            confidence=confidences.added,
                        )
                    )
                elif original_value is not None:
                    changes.append(
                        ResumeFieldDiff(
                            field_path=field_path,
                            field_type=field_type,
                            change_type="removed",
                            original_value=original_value,
                            confidence=confidences.removed,
                        )
                    )


def calculate_resume_diff(
    original: dict[str, Any],
    improved: dict[str, Any],
) -> tuple[ResumeDiffSummary, list[ResumeFieldDiff]]:
    """Compute the diff between original and improved resumes.

    Args:
        original: Original resume data dict
        improved: Improved resume data dict

    Returns:
        (diff summary, detailed change list)
    """
    changes: list[ResumeFieldDiff] = []

    # 1. Compare summary
    original_summary = (original.get("summary") or "").strip()
    improved_summary = (improved.get("summary") or "").strip()
    if original_summary != improved_summary:
        if original_summary and not improved_summary:
            change_type = "removed"
        elif improved_summary and not original_summary:
            change_type = "added"
        else:
            change_type = "modified"
        changes.append(
            ResumeFieldDiff(
                field_path="summary",
                field_type="summary",
                change_type=change_type,
                original_value=original_summary or None,
                new_value=improved_summary or None,
                confidence="medium",
            )
        )

    # 2. Compare flexible additional groups
    orig_additional_items = _build_additional_item_index(original.get("additional"))
    new_additional_items = _build_additional_item_index(improved.get("additional"))
    orig_additional_keys = set(orig_additional_items)
    new_additional_keys = set(new_additional_items)

    for item_key in new_additional_keys - orig_additional_keys:
        item_value, group_id = new_additional_items[item_key]
        changes.append(
            ResumeFieldDiff(
                field_path=f"additional.groups[{group_id}].items",
                field_type="additional_item",
                change_type="added",
                new_value=item_value,
                confidence="high",
            )
        )

    for item_key in orig_additional_keys - new_additional_keys:
        item_value, group_id = orig_additional_items[item_key]
        changes.append(
            ResumeFieldDiff(
                field_path=f"additional.groups[{group_id}].items",
                field_type="additional_item",
                change_type="removed",
                original_value=item_value,
                confidence="medium",
            )
        )

    if _format_additional_groups(original.get("additional")) != _format_additional_groups(
        improved.get("additional")
    ):
        changes.append(
            ResumeFieldDiff(
                field_path="additional.groups",
                field_type="additional_group",
                change_type="modified",
                original_value=_format_additional_groups(original.get("additional")) or None,
                new_value=_format_additional_groups(improved.get("additional")) or None,
                confidence="medium",
            )
        )

    # 3. Compare work experience descriptions
    original_experiences = original.get("workExperience", [])
    improved_experiences = improved.get("workExperience", [])
    max_experience_len = max(len(original_experiences), len(improved_experiences))
    confidences = DiffConfidence(added="medium", removed="low", modified="medium")
    for idx in range(max_experience_len):
        original_entry = (
            original_experiences[idx] if idx < len(original_experiences) else None
        )
        improved_entry = (
            improved_experiences[idx] if idx < len(improved_experiences) else None
        )
        if not original_entry and not improved_entry:
            continue
        _append_list_changes(
            changes,
            field_path=f"workExperience[{idx}].description",
            field_type="description",
            original_items=_extract_description_list(original_entry),
            improved_items=_extract_description_list(improved_entry),
            confidences=confidences,
        )

    # 4. Compare added/removed/modified entries
    # Descriptions are diffed separately; ignore them when detecting entry-level changes.
    _append_entry_changes(
        changes,
        "workExperience",
        "experience",
        original.get("workExperience", []),
        improved.get("workExperience", []),
        _format_experience_entry,
        {"description"},
    )
    _append_entry_changes(
        changes,
        "education",
        "education",
        original.get("education", []),
        improved.get("education", []),
        _format_education_entry,
    )
    _append_entry_changes(
        changes,
        "personalProjects",
        "project",
        original.get("personalProjects", []),
        improved.get("personalProjects", []),
        _format_project_entry,
    )

    # 5. Build summary
    summary = ResumeDiffSummary(
        total_changes=len(changes),
        additional_items_added=len(
            [
                c
                for c in changes
                if c.field_type == "additional_item" and c.change_type == "added"
            ]
        ),
        additional_items_removed=len(
            [
                c
                for c in changes
                if c.field_type == "additional_item" and c.change_type == "removed"
            ]
        ),
        additional_groups_modified=len(
            [
                c
                for c in changes
                if c.field_type == "additional_group" and c.change_type == "modified"
            ]
        ),
        descriptions_modified=len(
            [
                c
                for c in changes
                if c.field_type == "description" and c.change_type == "modified"
            ]
        ),
        high_risk_changes=len([c for c in changes if c.confidence == "high"])
    )

    return summary, changes


def verify_generated_resume_result(
    original: dict[str, Any],
    result: dict[str, Any],
    job_keywords: dict[str, Any],
    *,
    prompt_id: str | None = None,
) -> list[str]:
    """Run local quality checks on the primary full-resume output."""
    warnings: list[str] = []
    _, changes = calculate_resume_diff(original, result)

    if not changes:
        warnings.append("No material changes were applied — resume returned nearly unchanged")
        return warnings

    for key, label in [
        ("workExperience", "work experience"),
        ("education", "education"),
        ("personalProjects", "project"),
    ]:
        orig_count = len(original.get(key, []))
        result_count = len(result.get(key, []))
        if orig_count != result_count:
            warnings.append(
                f"Section count changed: {label} ({orig_count} → {result_count})"
            )

    for key, id_fields in [
        ("workExperience", ["company", "title", "location", "years"]),
        ("education", ["institution", "degree", "location", "years"]),
        ("personalProjects", ["name", "role", "location", "years"]),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for index, (orig_entry, result_entry) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig_entry, dict) or not isinstance(result_entry, dict):
                continue
            for field in id_fields:
                original_value = str(orig_entry.get(field, "")).strip()
                result_value = str(result_entry.get(field, "")).strip()
                if original_value and original_value != result_value:
                    warnings.append(
                        f"Identity field changed: {key}[{index}].{field} "
                        f"('{original_value}' → '{result_value}')"
                    )

    original_words = _count_description_words(original)
    result_words = _count_description_words(result)
    if original_words > 0 and result_words > original_words * 1.8:
        warnings.append(
            "Word count increased significantly: "
            f"{original_words} → {result_words} ({result_words / original_words:.1f}x)"
        )

    for change in changes:
        new_text = change.new_value or ""
        if not new_text:
            continue
        new_metrics = set(_METRIC_RE.findall(new_text))
        original_metrics = set(_METRIC_RE.findall(change.original_value or ""))
        invented_metrics = new_metrics - original_metrics
        if invented_metrics:
            warnings.append(
                f"Possible invented metric in {change.field_path}: "
                f"{', '.join(sorted(invented_metrics))} (not in original)"
            )

    if prompt_id == "nudge":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Nudge mode introduced structural content changes")

    if prompt_id == "keywords":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Keyword mode changed section structure more than expected")

    if prompt_id in {"keywords", "full"}:
        supported_keywords = _find_supported_keywords(job_keywords, original)
        if supported_keywords:
            result_text = _extract_resume_text(result)
            missing_keywords = [
                keyword
                for keyword in supported_keywords
                if not _keyword_in_text(keyword, result_text)
            ]
            if missing_keywords:
                warnings.append(
                    "Supported job keywords still missing after tailoring: "
                    + ", ".join(missing_keywords[:8])
                )

    return warnings


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate improvement suggestions based on job keywords.

    Args:
        job_keywords: Extracted job keywords

    Returns:
        List of improvement suggestions
    """
    improvements = []

    # Generate suggestions based on required skills
    required_skills = job_keywords.get("required_skills", [])
    for skill in required_skills[:3]:  # Top 3 required skills
        improvements.append(
            {
                "suggestion": f"Emphasized '{skill}' to match job requirements",
                "lineNumber": None,
            }
        )

    # Generate suggestions based on key responsibilities
    responsibilities = job_keywords.get("key_responsibilities", [])
    for resp in responsibilities[:2]:  # Top 2 responsibilities
        improvements.append(
            {
                "suggestion": f"Aligned experience with: {resp}",
                "lineNumber": None,
            }
        )

    # Default improvement if none generated
    if not improvements:
        improvements.append(
            {
                "suggestion": "Resume content optimized for better keyword alignment with job description",
                "lineNumber": None,
            }
        )

    return improvements
