"""Multi-pass resume refinement service.

This module provides functionality to refine an initially tailored resume through
multiple passes:
1. Keyword injection - add missing JD keywords where supported by master resume
2. AI phrase removal - replace AI-generated buzzwords with simpler alternatives
3. Master alignment validation - ensure no fabricated content was added
"""

import copy
import json
import logging
import re
from functools import lru_cache
from typing import Any

from app.prompts.refinement import (
    AI_PHRASE_BLACKLIST,
    AI_PHRASE_REPLACEMENTS,
)
from app.schemas.refinement import (
    AlignmentReport,
    AlignmentViolation,
    KeywordGapAnalysis,
    RefinementConfig,
    RefinementResult,
)
from app.services.additional_groups import (
    additional_items_counter,
    extract_additional_groups,
    flatten_additional_items,
    normalize_additional_groups,
    normalize_skill_groups,
)

logger = logging.getLogger(__name__)

# LLM-012: Job description truncation limits
MAX_JD_LENGTH = 2000
MIN_TRUNCATION_WARNING_LENGTH = 1500


def _keyword_in_text(keyword: str, text: str) -> bool:
    """Check if keyword exists as a whole word in text.

    SVC-010: Uses word boundaries instead of substring matching to avoid
    false positives like 'python' matching 'pythonic' or 'go' matching 'going'.
    """
    # Escape special regex characters in keyword
    escaped = re.escape(keyword.lower())
    # Use word boundaries
    pattern = rf"\b{escaped}\b"
    return bool(re.search(pattern, text.lower()))


async def refine_resume(
    initial_tailored: dict[str, Any],
    master_resume: dict[str, Any],
    job_description: str,
    job_keywords: dict[str, Any],
    config: RefinementConfig | None = None,
) -> RefinementResult:
    """Multi-pass refinement of an initially tailored resume.

    Args:
        initial_tailored: Output from improve_resume() first pass
        master_resume: Original master resume data (source of truth)
        job_description: Raw job description text
        job_keywords: Extracted job keywords
        config: Refinement configuration

    Returns:
        RefinementResult with refined data and analysis
    """
    if config is None:
        config = RefinementConfig()

    current = _deep_copy(initial_tailored)
    passes = 0
    ai_phrases_found: list[str] = []
    keyword_analysis: KeywordGapAnalysis | None = None
    alignment: AlignmentReport | None = None

    # Pass 1: Keyword injection (if enabled)
    if config.enable_keyword_injection:
        keyword_analysis = analyze_keyword_gaps(job_keywords, current, master_resume)
        if keyword_analysis.injectable_keywords:
            logger.info(
                "Injecting %d keywords: %s",
                len(keyword_analysis.injectable_keywords),
                keyword_analysis.injectable_keywords,
            )
            try:
                current = await inject_keywords(
                    current,
                    keyword_analysis.injectable_keywords,
                    master_resume,
                    job_description,
                )
                passes += 1
            except Exception as e:
                logger.warning("Keyword injection failed: %s", e)

    # Pass 2: AI phrase removal and polish (local, no LLM call)
    if config.enable_ai_phrase_removal:
        current, removed = remove_ai_phrases(current, job_description)
        ai_phrases_found.extend(removed)
        if removed:
            logger.info("Removed %d AI phrases: %s", len(removed), removed)
            passes += 1

    # Pass 3: Master alignment validation
    # LLM-008: Alignment validation is MANDATORY - not optional fallback
    if config.enable_master_alignment_check:
        alignment = validate_master_alignment(current, master_resume)
        if not alignment.is_aligned:
            # Count critical violations
            critical_violations = [
                v for v in alignment.violations if v.severity == "critical"
            ]
            logger.warning(
                "Alignment violations found: %d total, %d critical",
                len(alignment.violations),
                len(critical_violations),
            )

            if critical_violations:
                # LLM-008: Remove fabricated content before returning
                logger.error(
                    "Alignment violations found - removing fabricated content: %s",
                    [v.value for v in critical_violations],
                )
                # Fix violations before returning
                current = fix_alignment_violations(current, alignment.violations)
                passes += 1
            else:
                # Non-critical violations - fix and continue
                current = fix_alignment_violations(current, alignment.violations)
                passes += 1

    # Calculate final match percentage
    final_match = calculate_keyword_match(current, job_keywords)

    return RefinementResult(
        refined_data=current,
        passes_completed=passes,
        keyword_analysis=keyword_analysis,
        alignment_report=alignment,
        ai_phrases_removed=ai_phrases_found,
        final_match_percentage=final_match,
    )


def analyze_keyword_gaps(
    jd_keywords: dict[str, Any],
    tailored: dict[str, Any],
    master: dict[str, Any],
) -> KeywordGapAnalysis:
    """Analyze which JD keywords are missing from the tailored resume.

    Args:
        jd_keywords: Extracted job keywords with required_skills, preferred_skills, etc.
        tailored: Current tailored resume data
        master: Master resume data (source of truth)

    Returns:
        KeywordGapAnalysis with missing, injectable, and non-injectable keywords
    """
    # Extract text content from resumes
    tailored_text = _extract_all_text(tailored).lower()
    master_text = _extract_all_text(master).lower()

    # Get all keywords from JD
    all_jd_keywords: set[str] = set()
    all_jd_keywords.update(jd_keywords.get("required_skills", []))
    all_jd_keywords.update(jd_keywords.get("preferred_skills", []))
    all_jd_keywords.update(jd_keywords.get("keywords", []))

    # Find missing keywords
    missing: list[str] = []
    injectable: list[str] = []
    non_injectable: list[str] = []

    for keyword in all_jd_keywords:
        if not _keyword_in_text(keyword, tailored_text):
            missing.append(keyword)
            if _keyword_in_text(keyword, master_text):
                injectable.append(keyword)
            else:
                non_injectable.append(keyword)

    # Calculate percentages
    total = len(all_jd_keywords) if all_jd_keywords else 1
    current_match = (total - len(missing)) / total * 100
    potential_match = (total - len(non_injectable)) / total * 100

    return KeywordGapAnalysis(
        missing_keywords=missing,
        injectable_keywords=injectable,
        non_injectable_keywords=non_injectable,
        current_match_percentage=current_match,
        potential_match_percentage=potential_match,
    )


def remove_ai_phrases(
    data: dict[str, Any],
    job_description: str = "",
) -> tuple[dict[str, Any], list[str]]:
    """Remove AI-generated phrases from resume content.

    This is a local operation that doesn't require an LLM call.
    It performs case-insensitive replacement of blacklisted phrases.
    Phrases that appear in the job description are protected from removal.

    Args:
        data: Resume data dictionary
        job_description: Job description text; phrases found here are skipped

    Returns:
        Tuple of (cleaned data, list of removed phrases)
    """
    # Build set of JD-protected phrases
    jd_lower = job_description.lower()
    jd_protected: set[str] = set()
    for phrase in AI_PHRASE_BLACKLIST:
        if phrase.lower() in jd_lower:
            jd_protected.add(phrase.lower())

    if jd_protected:
        logger.info("JD-protected phrases (skipping removal): %s", jd_protected)

    # Use a set to avoid duplicate tracking
    removed: set[str] = set()

    def clean_text(text: str) -> str:
        cleaned = text
        for phrase in AI_PHRASE_BLACKLIST:
            # Skip phrases that appear in the job description
            if phrase.lower() in jd_protected:
                continue
            if phrase.lower() in cleaned.lower():
                removed.add(phrase)
                replacement = AI_PHRASE_REPLACEMENTS.get(phrase.lower(), "")
                # Case-insensitive replacement
                pattern = re.compile(re.escape(phrase), re.IGNORECASE)
                cleaned = pattern.sub(replacement, cleaned)
        return cleaned

    def clean_recursive(obj: Any) -> Any:
        if isinstance(obj, str):
            return clean_text(obj)
        elif isinstance(obj, list):
            return [clean_recursive(item) for item in obj]
        elif isinstance(obj, dict):
            return {k: clean_recursive(v) for k, v in obj.items()}
        return obj

    cleaned_data = clean_recursive(data)
    return cleaned_data, list(removed)


def validate_master_alignment(
    tailored: dict[str, Any],
    master: dict[str, Any],
) -> AlignmentReport:
    """Verify tailored resume doesn't contain fabricated content.

    Checks that all skills, certifications, and work experience companies
    in the tailored resume exist in the master resume.

    Args:
        tailored: Tailored resume data
        master: Master resume data (source of truth)

    Returns:
        AlignmentReport with violations and confidence score
    """
    violations: list[AlignmentViolation] = []

    # Check all skill-group values against the source resume
    tailored_groups = extract_additional_groups(tailored.get("skills") or tailored.get("additional"))
    master_groups = extract_additional_groups(master.get("skills") or master.get("additional"))
    tailored_items = additional_items_counter(tailored_groups)
    master_items = additional_items_counter(master_groups)
    master_full_text = _extract_all_text(master).lower()

    for group in tailored_groups:
        group_id = str(group.get("id", "")).strip()
        field_path = f"skills.groups[{group_id or 'unknown'}]"
        for item in group.get("values", []):
            if not isinstance(item, str) or not item.strip():
                continue
            key = item.casefold()
            if tailored_items.get(key, 0) <= master_items.get(key, 0):
                continue

            master_matches = [
                master_item
                for master_item in flatten_additional_items(master_groups)
                if master_item
            ]
            has_substring_match = any(
                key in master_item.casefold() or master_item.casefold() in key
                for master_item in master_matches
            )
            found_in_text = _keyword_in_text(key, master_full_text)

            if has_substring_match or found_in_text:
                violations.append(
                    AlignmentViolation(
                        field_path=field_path,
                        violation_type="additional_item_variant",
                        value=item,
                        severity="info",
                    )
                )
            else:
                violations.append(
                    AlignmentViolation(
                        field_path=field_path,
                        violation_type="fabricated_additional_item",
                        value=item,
                        severity="critical",
                    )
                )

    # Check work experience companies (should not add new companies)
    tailored_companies = set(
        exp.get("company", "").lower()
        for exp in tailored.get("workExperience", [])
        if isinstance(exp, dict)
    )
    master_companies = set(
        exp.get("company", "").lower()
        for exp in master.get("workExperience", [])
        if isinstance(exp, dict)
    )

    for company in tailored_companies - master_companies:
        if company:  # Skip empty strings
            violations.append(
                AlignmentViolation(
                    field_path="workExperience",
                    violation_type="fabricated_company",
                    value=company,
                    severity="critical",
                )
            )

    is_aligned = len([v for v in violations if v.severity == "critical"]) == 0
    confidence = 1.0 - (len(violations) * 0.1)  # Decrease confidence per violation

    return AlignmentReport(
        is_aligned=is_aligned,
        violations=violations,
        confidence_score=max(0.0, confidence),
    )


def _prepare_job_description(job_description: str) -> tuple[str, bool]:
    """LLM-012: Prepare job description for prompt, with truncation warning.

    Returns:
        Tuple of (truncated_text, was_truncated)
    """
    was_truncated = len(job_description) > MAX_JD_LENGTH

    if was_truncated:
        logger.warning(
            "Job description truncated from %d to %d characters",
            len(job_description),
            MAX_JD_LENGTH,
        )

    return job_description[:MAX_JD_LENGTH], was_truncated


def _validate_resume_structure(data: dict[str, Any]) -> bool:
    """LLM-014: Validate resume maintains required structure after keyword injection.

    Returns:
        True if structure is valid, False otherwise.
    """
    # Check for required top-level keys
    required_keys = ["personalInfo"]
    for key in required_keys:
        if key not in data:
            logger.warning("Resume structure invalid: missing '%s'", key)
            return False

    # Check that arrays are still arrays
    array_fields = ["workExperience", "education", "personalProjects"]
    for field in array_fields:
        if field in data and not isinstance(data[field], list):
            logger.warning("Resume structure invalid: '%s' is not a list", field)
            return False

    return True


async def inject_keywords(
    tailored: dict[str, Any],
    keywords_to_inject: list[str],
    master: dict[str, Any],
    job_description: str,
) -> dict[str, Any]:
    """Use LLM to inject missing keywords into appropriate sections.

    Args:
        tailored: Current tailored resume
        keywords_to_inject: Keywords that are in master but missing from tailored
        master: Master resume (source of truth)
        job_description: Job description for context

    Returns:
        Updated resume data with keywords injected

    LLM-012: Truncates job description with warning.
    LLM-014: Validates result structure before returning.
    """
    # LLM-012: Prepare job description with truncation handling
    truncated_jd, was_truncated = _prepare_job_description(job_description)
    if was_truncated:
        logger.info(
            "Job description was truncated for keyword injection (original: %d chars)",
            len(job_description),
        )

    # Keyword injection via LLM is removed in 2.0 — the main tailoring prompt
    # handles keyword weaving comprehensively via JD intelligence.
    logger.info(
        "Keyword injection LLM pass skipped (2.0 pipeline handles keywords in main prompt). "
        "Keywords requested: %s",
        keywords_to_inject,
    )
    return tailored


def fix_alignment_violations(
    tailored: dict[str, Any],
    violations: list[AlignmentViolation],
) -> dict[str, Any]:
    """Remove or correct alignment violations.

    This is a local operation that removes fabricated content.

    Args:
        tailored: Tailored resume data
        violations: List of alignment violations to fix

    Returns:
        Fixed resume data
    """
    fixed = _deep_copy(tailored)

    for violation in violations:
        if violation.severity != "critical":
            continue

        if violation.violation_type == "fabricated_additional_item":
            skills = normalize_skill_groups(fixed.get("skills") or fixed.get("additional"))
            groups = skills.get("groups", [])
            for group in groups:
                items = group.get("values", [])
                if isinstance(items, list):
                    group["values"] = [
                        item
                        for item in items
                        if not (
                            isinstance(item, str)
                            and item.casefold() == violation.value.casefold()
                        )
                    ]
            fixed["skills"] = skills
            fixed["additional"] = normalize_additional_groups(skills)

        elif violation.violation_type == "fabricated_company":
            # SVC-002: Remove the fabricated work experience entry
            logger.error("Critical: Fabricated company detected: %s", violation.value)
            if "workExperience" in fixed:
                fixed["workExperience"] = [
                    exp
                    for exp in fixed["workExperience"]
                    if exp.get("company", "").lower() != violation.value.lower()
                ]
                logger.info(
                    "Removed fabricated company '%s' from resume",
                    violation.value,
                )

    return fixed


def calculate_keyword_match(
    resume: dict[str, Any],
    jd_keywords: dict[str, Any],
) -> float:
    """Calculate keyword match percentage.

    Args:
        resume: Resume data dictionary
        jd_keywords: Extracted job keywords

    Returns:
        Match percentage (0.0 to 100.0)
    """
    resume_text = _extract_all_text(resume).lower()

    all_keywords: set[str] = set()
    all_keywords.update(jd_keywords.get("required_skills", []))
    all_keywords.update(jd_keywords.get("preferred_skills", []))
    all_keywords.update(jd_keywords.get("keywords", []))

    # SVC-009: Return 0% if no keywords (not 100% - that's misleading)
    if not all_keywords:
        logger.warning("No keywords found in job description")
        return 0.0

    # SVC-010: Use word boundary matching instead of substring
    matched = sum(1 for kw in all_keywords if _keyword_in_text(kw, resume_text))
    return (matched / len(all_keywords)) * 100


def _extract_all_text(data: dict[str, Any]) -> str:
    """Extract all text content from resume data for keyword matching.

    SVC-011: Uses caching to avoid repeated extraction on same resume data.

    Args:
        data: Resume data dictionary

    Returns:
        Concatenated text from all resume sections
    """
    # Create a cache key from the data
    data_json = json.dumps(data, sort_keys=True, default=str)
    return _extract_all_text_cached(data_json)


@lru_cache(maxsize=100)
def _extract_all_text_cached(data_json: str) -> str:
    """Cached implementation of text extraction.

    SVC-011: LRU cache avoids re-extracting text from the same resume
    multiple times during a single refinement pass.
    """
    data = json.loads(data_json)
    parts: list[str] = []

    # Summary
    if data.get("summary"):
        parts.append(str(data["summary"]))

    # Work experience
    for exp in data.get("workExperience", []):
        if isinstance(exp, dict):
            parts.append(str(exp.get("title", "")))
            parts.append(str(exp.get("company", "")))
            parts.append(
                str(
                    exp.get("summary")
                    or exp.get("tech_stacks")
                    or exp.get("techStack")
                    or ""
                )
            )
            desc = exp.get("description", [])
            if isinstance(desc, list):
                parts.extend(str(d) for d in desc)

    # Education
    for edu in data.get("education", []):
        if isinstance(edu, dict):
            parts.append(str(edu.get("degree", "")))
            parts.append(str(edu.get("institution", "")))
            if edu.get("description"):
                parts.append(str(edu["description"]))

    # Projects
    for proj in data.get("personalProjects", []):
        if isinstance(proj, dict):
            parts.append(str(proj.get("name", "")))
            parts.append(
                str(
                    proj.get("summary")
                    or proj.get("tech_stacks")
                    or proj.get("techStack")
                    or proj.get("role")
                    or ""
                )
            )
            desc = proj.get("description", [])
            if isinstance(desc, list):
                parts.extend(str(d) for d in desc)

    # Skills
    skills = data.get("skills") or data.get("additional") or {}
    if isinstance(skills, dict):
        parts.extend(flatten_additional_items(skills))

    # Custom sections
    custom_sections = data.get("customSections", {})
    if isinstance(custom_sections, dict):
        for section in custom_sections.values():
            if not isinstance(section, dict):
                continue
            section_type = section.get("sectionType", "")
            if section_type == "itemList":
                for item in section.get("items", []):
                    if isinstance(item, dict):
                        parts.append(str(item.get("title", "")))
                        parts.append(str(item.get("subtitle", "")))
                        desc = item.get("description", [])
                        if isinstance(desc, list):
                            parts.extend(str(d) for d in desc)
                        elif isinstance(desc, str):
                            parts.append(desc)
            elif section_type == "text":
                text = section.get("text", "")
                if isinstance(text, str):
                    parts.append(text)
            elif section_type == "stringList":
                items = section.get("strings", [])
                if isinstance(items, list):
                    parts.extend(str(i) for i in items)

    return " ".join(p for p in parts if p)


def _deep_copy(data: dict[str, Any]) -> dict[str, Any]:
    """Create a deep copy of a dictionary.

    Uses copy.deepcopy for reliability. JSON serialization is avoided
    because it can't handle all Python types and loses type information.
    """
    return copy.deepcopy(data)
