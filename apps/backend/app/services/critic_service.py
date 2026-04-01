"""Critic pass for application pack generation."""

from __future__ import annotations

from typing import Any

from app.llm import complete_json
from app.services.prompt_pack_loader import load_default_prompt_pack


def _normalize_string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


async def run_critic_pass(
    *,
    resume_data: dict[str, Any] | None,
    job_description: str,
    language: str,
) -> dict[str, Any]:
    prompt_pack = load_default_prompt_pack()
    house_rules = prompt_pack.get("house_rules", "")
    prompt = prompt_pack.get("critic_user", "").format(
        language=language,
        house_rules=house_rules,
        resume_json=resume_data or {},
        job_description=job_description,
    )
    system_prompt = prompt_pack.get("critic_system", "")

    result = await complete_json(prompt, system_prompt=system_prompt, max_tokens=1800)
    return {
        "priority_keywords": _normalize_string_list(result.get("priority_keywords")),
        "recruiter_gaps": _normalize_string_list(result.get("recruiter_gaps")),
        "strengthen_bullets": _normalize_string_list(result.get("strengthen_bullets")),
        "avoid_claims": _normalize_string_list(result.get("avoid_claims")),
        "summary": result.get("summary", "") if isinstance(result.get("summary"), str) else "",
    }
