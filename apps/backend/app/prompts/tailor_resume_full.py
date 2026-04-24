"""Prompt: tailor_resume_full — full-intensity resume tailoring."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._rules.resume_diff import RESUME_DIFF_RULES, RULES_NAME
from app.prompts.tailoring_blocks import (
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL_FULL,
)

STEP_NAME = "tailor_resume_full"
STEP_LABEL = "Tailor resume (full)"
STEP_VERSION = PROMPT_VERSIONS["tailoring_user"]
FILE_PATH = "prompts/tailor_resume_full.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/fragments/tailoring_craft.txt",
    "apps/backend/app/prompts/text/fragments/tailoring_mode_full.txt",
    "apps/backend/app/prompts/text/fragments/resume_diff_output.txt",
    "apps/backend/app/prompts/tailor_resume_full.py",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/fragments/tailoring_user_shell_full.txt"
PIPELINE = "full"
PIPELINE_ORDER = 2
RECEIVES_FROM = ["extract_jd_intel"]
FEEDS_INTO = ["critique_resume"]

INSTRUCTIONS = TAILORING_CRAFT_BLOCK + "\n\n" + TAILORING_MODE_STRATEGY["full"]
RULES = RESUME_DIFF_RULES
RULES_SOURCE = RULES_NAME
USER_TEMPLATE = TAILORING_USER_SHELL_FULL
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
VARIABLES = {
    "extract_jd_intel_output": "JSON from extract_jd_intel step",
    "original_resume": "Structured resume JSON or markdown",
    "response_contract": "Allowed response shape for this resume",
}


def build_messages(
    *,
    original_resume: str,
    extract_jd_intel_output: str,
    response_contract: str,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            extract_jd_intel_output=extract_jd_intel_output,
            original_resume=original_resume,
            response_contract=response_contract,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override(RULES_SOURCE)
        or RULES
    )
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        extract_jd_intel_output=extract_jd_intel_output,
        original_resume=original_resume,
        response_contract=response_contract,
    )
    return system, user
