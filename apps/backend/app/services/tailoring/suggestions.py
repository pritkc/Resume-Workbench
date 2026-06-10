"""Simple local improvement suggestions derived from job analysis."""

from __future__ import annotations

from typing import Any

from app.services.tailoring.analysis import collect_job_keywords


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate user-facing improvement suggestions based on job keywords."""

    improvements: list[dict[str, Any]] = []
    kws = collect_job_keywords(job_keywords)

    for skill in kws[:3]:
        improvements.append(
            {
                "suggestion": f"Emphasized '{skill}' to match job signals",
                "lineNumber": None,
            }
        )

    for responsibility in kws[3:5]:
        improvements.append(
            {
                "suggestion": f"Aligned experience with: {responsibility}",
                "lineNumber": None,
            }
        )

    if not improvements:
        improvements.append(
            {
                "suggestion": "Resume content optimized for better keyword alignment with job description",
                "lineNumber": None,
            }
        )

    return improvements
