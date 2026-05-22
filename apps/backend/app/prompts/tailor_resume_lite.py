"""Prompt: tailor_resume_lite — conservative resume tailoring."""

from __future__ import annotations

from typing import Any

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "tailor_resume_lite"
STEP_LABEL = "Tailor resume (lite)"
STEP_VERSION = PROMPT_VERSIONS["tailoring_user"]
FILE_PATH = "prompts/tailor_resume_lite.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/tailor_resume_lite/system.txt",
    "apps/backend/app/prompts/text/output_file_schema_rules/resume_content_rules.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/tailor_resume_lite/user.txt"
PIPELINE = "lite"
PIPELINE_ORDER = 2
RECEIVES_FROM = ["extract_jd_intel"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = read_shipped_txt("tailor_resume_lite/system.txt")
RULES = read_shipped_txt("output_file_schema_rules/resume_content_rules.txt")
RULES_SOURCE = "resume_content"
USER_TEMPLATE = read_shipped_txt("tailor_resume_lite/user.txt")
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "custom_prompt_instructions": "Optional high-priority per-run instructions from the tailor page",
    "original_resume": "Structured resume JSON or markdown",
    "output_template": "Section-header output template for this resume",
    "jd_intel": "Section-header JD intelligence text or legacy compact JSON",
    "content_rules": "Section-header compatible resume content/writing policy",
    "response_contract": "Legacy compact JSON response shape for compatibility",
    "jd_intel_blob": "Cached JD wrapper/JSON used to derive jd_intel",
}


def build_messages(
    *,
    original_resume: str,
    jd_intel_blob: dict[str, Any],
    response_contract: str,
    output_template: str | None = None,
    jd_intel: str | None = None,
    custom_prompt_instructions: str | None = None,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template
    from app.services.tailoring.prompting import render_custom_prompt_instructions
    from app.services.tailoring.section_format import jd_intel_text_from_blob

    jd_text = jd_intel if jd_intel is not None else jd_intel_text_from_blob(jd_intel_blob)
    template = output_template or response_contract
    content_rules = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override(RULES_SOURCE)
        or RULES
    ).strip()
    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            jd_intel_blob=jd_intel_blob,
            custom_prompt_instructions=render_custom_prompt_instructions(
                custom_prompt_instructions
            ),
            original_resume=original_resume,
            response_contract=response_contract,
            output_template=template,
            jd_intel=jd_text,
            content_rules=content_rules,
        )

    prose = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    system = prose.strip()
    user = render_user_template(
        USER_TEMPLATE,
        jd_intel_blob=jd_intel_blob,
        custom_prompt_instructions=render_custom_prompt_instructions(
            custom_prompt_instructions
        ),
        original_resume=original_resume,
        response_contract=response_contract,
        output_template=template,
        jd_intel=jd_text,
        content_rules=content_rules,
    )
    return system, user
