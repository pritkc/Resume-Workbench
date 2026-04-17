"""Prompt: tailor_resume_full — full-intensity resume tailoring."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._rules.resume_diff import RESUME_DIFF_RULES, RULES_NAME
from app.prompts.tailoring_blocks import (
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_STRATEGY,
    TAILORING_USER_SHELL,
)

STEP_NAME = "tailor_resume_full"
STEP_LABEL = "Tailor resume (full)"
STEP_VERSION = PROMPT_VERSIONS["tailoring_user"]
FILE_PATH = "prompts/tailor_resume_full.py"
PIPELINE = "full"
PIPELINE_ORDER = 2
RECEIVES_FROM = ["extract_jd_intel"]
FEEDS_INTO = ["critique_resume"]

INSTRUCTIONS = TAILORING_CRAFT_BLOCK + "\n\n" + TAILORING_MODE_STRATEGY["full"]
RULES = RESUME_DIFF_RULES
RULES_SOURCE = RULES_NAME
USER_TEMPLATE = TAILORING_USER_SHELL
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
VARIABLES = {
    "mode_id": "full | lite",
    "job_intelligence": "JD intelligence JSON",
    "original_resume": "Structured resume JSON or markdown",
    "response_contract": "Allowed response shape for this resume",
    "output_language": "Human-readable output language",
}


def build_messages(
    *,
    original_resume: str,
    job_intelligence: str,
    response_contract: str,
    output_language: str,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            mode_id="full",
            job_intelligence=job_intelligence,
            original_resume=original_resume,
            response_contract=response_contract,
            output_language=output_language,
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
        mode_id="full",
        job_intelligence=job_intelligence,
        original_resume=original_resume,
        response_contract=response_contract,
        output_language=output_language,
    )
    return system, user
