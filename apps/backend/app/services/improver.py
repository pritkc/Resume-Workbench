"""Compatibility facade for the typed tailoring pipeline."""

from app.services.tailoring import (
    MONTH_PATTERN,
    apply_diffs,
    calculate_resume_diff,
    extract_job_keywords,
    generate_improvements,
    generate_tailored_resume,
    improve_resume,
    verify_diff_result,
    verify_generated_resume_result,
)

__all__ = [
    "MONTH_PATTERN",
    "apply_diffs",
    "calculate_resume_diff",
    "extract_job_keywords",
    "generate_improvements",
    "generate_tailored_resume",
    "improve_resume",
    "verify_diff_result",
    "verify_generated_resume_result",
]
