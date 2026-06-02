"""Typed single-prompt tailoring pipeline.

Exports stay lazy so importing a lightweight submodule such as ``section_format``
does not pull in orchestration and create circular imports with cover-letter helpers.
"""

from __future__ import annotations

from typing import Any

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


def __getattr__(name: str) -> Any:
    if name == "extract_job_keywords":
        from app.services.tailoring.analysis import extract_job_keywords

        return extract_job_keywords
    if name == "calculate_resume_diff":
        from app.services.tailoring.diffing import calculate_resume_diff

        return calculate_resume_diff
    if name in {"apply_diffs", "verify_diff_result"}:
        from app.services.tailoring.legacy_diffs import apply_diffs, verify_diff_result

        return {"apply_diffs": apply_diffs, "verify_diff_result": verify_diff_result}[name]
    if name in {"generate_tailored_resume", "improve_resume"}:
        from app.services.tailoring.orchestration import generate_tailored_resume, improve_resume

        return {
            "generate_tailored_resume": generate_tailored_resume,
            "improve_resume": improve_resume,
        }[name]
    if name == "MONTH_PATTERN":
        from app.services.tailoring.preservation import MONTH_PATTERN

        return MONTH_PATTERN
    if name == "generate_improvements":
        from app.services.tailoring.suggestions import generate_improvements

        return generate_improvements
    if name == "verify_generated_resume_result":
        from app.services.tailoring.verification import verify_generated_resume_result

        return verify_generated_resume_result
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
