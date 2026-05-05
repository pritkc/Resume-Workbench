"""Local verifiers for generated resume outputs."""

from __future__ import annotations

import re
from typing import Any

from app.services.tailoring.analysis import (
    collect_job_keywords,
    extract_resume_text,
    find_supported_keywords,
    keyword_in_text,
)
from app.services.tailoring.diffing import calculate_resume_diff, count_description_words
from app.services.tailoring.jd_intel_blob import contains_basic_resume_term
from app.services.tailoring.models import split_experience_bullets_for_llm_indexing

_METRIC_RE = re.compile(r"\d+%|\d+x|\$\d+")
_WORD_RE = re.compile(r"[a-z0-9]+")
_CLAUSE_BREAK_RE = re.compile(r"\b(?:sql|python|postgresql|bigquery|java)\s+a\s+multi-day\b", re.IGNORECASE)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def _first_text(entry: dict[str, Any], *keys: str) -> str:
    for key in keys:
        value = _clean_text(entry.get(key))
        if value:
            return value
    return ""


def _education_credential(entry: dict[str, Any]) -> str:
    degree = _clean_text(entry.get("degree"))
    area = _clean_text(entry.get("area"))
    if degree and area:
        return f"{degree}, {area}"
    return degree or area


def _entry_date(entry: dict[str, Any]) -> str:
    direct = _first_text(entry, "date", "years")
    if direct:
        return direct
    start_date = _clean_text(entry.get("start_date") or entry.get("startDate"))
    end_date = _clean_text(entry.get("end_date") or entry.get("endDate"))
    if start_date and end_date:
        return f"{start_date} - {end_date}"
    if start_date:
        return f"{start_date} - present"
    return end_date


def _experience_bullets(entry: dict[str, Any]) -> list[str]:
    _prefix, bullets = split_experience_bullets_for_llm_indexing(entry)
    return bullets


def _tokens(value: str) -> list[str]:
    return _WORD_RE.findall(value.casefold())


def _ngrams(value: str, size: int = 5) -> set[str]:
    words = _tokens(value)
    return {" ".join(words[index:index + size]) for index in range(len(words) - size + 1)}


def _keyword_families(job_keywords: dict[str, Any]) -> list[str]:
    families: list[str] = []
    seen: set[str] = set()
    for keyword in collect_job_keywords(job_keywords):
        if not isinstance(keyword, str):
            continue
        words = _tokens(keyword)
        if not words:
            continue
        family = words[0]
        if family in {"data", "analysis", "tools", "systems"} and len(words) > 1:
            family = words[-1]
        if len(family) < 4 or family in seen:
            continue
        seen.add(family)
        families.append(family)
    return families


def _warn_on_jd_phrase_copy(result: dict[str, Any], job_description: str | None) -> list[str]:
    if not job_description:
        return []
    result_ngrams = _ngrams(extract_resume_text(result))
    jd_ngrams = _ngrams(job_description)
    overlap = sorted(result_ngrams & jd_ngrams)
    if not overlap:
        return []
    return [
        "JD phrase copy detected: "
        + "; ".join(overlap[:3])
        + " - translate JD language into the candidate's own story"
    ]


def _warn_on_repeated_jd_noun_families(
    result: dict[str, Any],
    job_keywords: dict[str, Any],
) -> list[str]:
    text = extract_resume_text(result).casefold()
    warnings: list[str] = []
    for family in _keyword_families(job_keywords):
        count = len(re.findall(rf"(?<![a-z0-9]){re.escape(family)}[a-z]*(?![a-z0-9])", text))
        if count >= 4:
            warnings.append(
                f"Repeated JD noun family '{family}' appears {count} times; avoid JD-mirror saturation"
            )
    return warnings


def _warn_on_missing_clause_punctuation(result: dict[str, Any]) -> list[str]:
    warnings: list[str] = []
    for section_key in ("workExperience", "personalProjects"):
        entries = result.get(section_key, [])
        if not isinstance(entries, list):
            continue
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                continue
            bullets = (
                _experience_bullets(entry)
                if section_key == "workExperience"
                else entry.get("description") or entry.get("highlights") or []
            )
            if not isinstance(bullets, list):
                continue
            for bullet_index, bullet in enumerate(bullets):
                if isinstance(bullet, str) and _CLAUSE_BREAK_RE.search(bullet):
                    warnings.append(
                        f"Possible missing punctuation in {section_key}[{index}].description[{bullet_index}]"
                    )
    return warnings


def _warn_on_jd_saturation(
    original: dict[str, Any],
    result: dict[str, Any],
    job_keywords: dict[str, Any],
) -> list[str]:
    keywords = [
        keyword
        for keyword in collect_job_keywords(job_keywords)
        if isinstance(keyword, str) and len(keyword.strip()) >= 3
    ]
    if not keywords:
        return []

    warnings: list[str] = []
    original_entries = original.get("workExperience", [])
    result_entries = result.get("workExperience", [])
    if not isinstance(original_entries, list) or not isinstance(result_entries, list):
        return warnings

    for index, (original_entry, result_entry) in enumerate(zip(original_entries, result_entries)):
        if not isinstance(original_entry, dict) or not isinstance(result_entry, dict):
            continue
        original_entry_text = extract_resume_text(original_entry)
        jd_only_keywords = [
            keyword
            for keyword in keywords
            if not keyword_in_text(keyword, original_entry_text)
        ]
        if not jd_only_keywords:
            continue
        jd_bullet_count = sum(
            1
            for bullet in _experience_bullets(result_entry)
            if any(keyword_in_text(keyword, bullet) for keyword in jd_only_keywords)
        )
        if jd_bullet_count > 2:
            warnings.append(
                f"JD saturation: workExperience[{index}] uses new JD-only terms in "
                f"{jd_bullet_count} bullets; keep direct JD framing to 1-2 bullets"
            )
    return warnings


def verify_generated_resume_result(
    original: dict[str, Any],
    result: dict[str, Any],
    job_keywords: dict[str, Any],
    *,
    prompt_id: str | None = None,
    job_description: str | None = None,
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

    for key, identity_fields in [
        (
            "workExperience",
            [
                ("company", lambda entry: _clean_text(entry.get("company"))),
                ("position", lambda entry: _first_text(entry, "position", "title")),
                ("location", lambda entry: _clean_text(entry.get("location"))),
                ("date", _entry_date),
            ],
        ),
        (
            "education",
            [
                ("institution", lambda entry: _clean_text(entry.get("institution"))),
                ("credential", _education_credential),
                ("location", lambda entry: _clean_text(entry.get("location"))),
                ("date", _entry_date),
            ],
        ),
        (
            "personalProjects",
            [
                ("name", lambda entry: _clean_text(entry.get("name"))),
                ("techStack", lambda entry: _first_text(entry, "techStack", "summary", "role")),
                ("date", _entry_date),
                ("github", lambda entry: _clean_text(entry.get("github"))),
                ("website", lambda entry: _clean_text(entry.get("website"))),
            ],
        ),
    ]:
        orig_entries = original.get(key, [])
        result_entries = result.get(key, [])
        for index, (orig_entry, result_entry) in enumerate(zip(orig_entries, result_entries)):
            if not isinstance(orig_entry, dict) or not isinstance(result_entry, dict):
                continue
            for field, extractor in identity_fields:
                original_value = extractor(orig_entry)
                result_value = extractor(result_entry)
                if original_value and original_value != result_value:
                    warnings.append(
                        f"Identity field changed: {key}[{index}].{field} "
                        f"('{original_value}' → '{result_value}')"
                    )

    original_words = count_description_words(original)
    result_words = count_description_words(result)
    if original_words > 0 and result_words > original_words * 1.8:
        warnings.append(
            "Word count increased significantly: "
            f"{original_words} → {result_words} ({result_words / original_words:.1f}x)"
        )

    if contains_basic_resume_term(extract_resume_text(result)):
        warnings.append(
            "CRITICAL: Basic office tools appear in final resume text; remove table-stakes "
            "tools such as Excel, Microsoft Office, Slack, Jira, and Miro"
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

    if prompt_id == "lite":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Light touch mode introduced structural content changes")

    if prompt_id == "full":
        if any(
            change.change_type in {"added", "removed"}
            and change.field_type in {"description", "experience", "education", "project"}
            for change in changes
        ):
            warnings.append("Full mode changed section structure more than expected")

    if prompt_id == "full":
        warnings.extend(_warn_on_jd_saturation(original, result, job_keywords))
        warnings.extend(_warn_on_jd_phrase_copy(result, job_description))
        warnings.extend(_warn_on_repeated_jd_noun_families(result, job_keywords))
        warnings.extend(_warn_on_missing_clause_punctuation(result))

        ats_keywords = collect_job_keywords(job_keywords)
        if ats_keywords:
            original_text = extract_resume_text(original)
            supported_keywords = [k for k in ats_keywords if keyword_in_text(k, original_text)]
        else:
            supported_keywords = find_supported_keywords(job_keywords, original)
        if supported_keywords:
            result_text = extract_resume_text(result)
            missing_keywords = [
                keyword
                for keyword in supported_keywords
                if not keyword_in_text(keyword, result_text)
            ]
            if missing_keywords:
                warnings.append(
                    "Supported job keywords still missing after tailoring: "
                    + ", ".join(missing_keywords[:8])
                )

    return warnings


def verify_rendered_resume_text(
    extracted_text: str,
    *,
    job_description: str | None = None,
) -> list[str]:
    """QA checks for text extracted from the final rendered PDF."""
    pseudo_resume = {"summary": extracted_text}
    warnings: list[str] = []
    if contains_basic_resume_term(extracted_text):
        warnings.append("CRITICAL: blocked low-signal term leaked into PDF text")
    warnings.extend(_warn_on_jd_phrase_copy(pseudo_resume, job_description))
    return warnings
