"""LLM call helpers for the tailoring pipeline."""

from __future__ import annotations

from typing import Any

from app.config import get_step_llm_config
from app.llm import complete_json
from app.prompts import PROMPT_VERSIONS
from app.services.tailoring.prompting import TailoringPromptContext


def tailor_step_name(prompt_id: str) -> str:
    return "tailor_resume_full" if prompt_id == "full" else "tailor_resume_lite"


async def run_primary_tailoring(
    prompt_context: TailoringPromptContext,
    job_description: str,
) -> dict[str, Any]:
    return await complete_json(
        prompt=prompt_context.user_prompt,
        system_prompt=prompt_context.system_prompt,
        config=get_step_llm_config(tailor_step_name(prompt_context.prompt_id)),
        max_tokens=15000,
        retries=1,
        operation="resume_generate_full",
        metadata={
            "prompt_id": prompt_context.prompt_id,
            "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown"),
            "job_description_chars": len(job_description),
            "structured_resume_input": prompt_context.used_structured_resume_input,
        },
        retry_hint=prompt_context.retry_hint,
    )
