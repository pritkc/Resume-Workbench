"""Typed single-prompt tailoring pipeline."""

from app.services.tailoring.analysis import extract_job_keywords
from app.services.tailoring.diffing import calculate_resume_diff
from app.services.tailoring.legacy_diffs import apply_diffs, verify_diff_result
from app.services.tailoring.orchestration import generate_tailored_resume, improve_resume
from app.services.tailoring.preservation import MONTH_PATTERN
from app.services.tailoring.suggestions import generate_improvements
from app.services.tailoring.verification import verify_generated_resume_result

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
