"""Simple local improvement suggestions derived from job analysis."""

from __future__ import annotations

from typing import Any


def generate_improvements(job_keywords: dict[str, Any]) -> list[dict[str, Any]]:
    """Generate user-facing improvement suggestions based on job keywords."""

    improvements: list[dict[str, Any]] = []

    for skill in job_keywords.get("required_skills", [])[:3]:
        improvements.append(
            {
                "suggestion": f"Emphasized '{skill}' to match job requirements",
                "lineNumber": None,
            }
        )

    for responsibility in job_keywords.get("key_responsibilities", [])[:2]:
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
