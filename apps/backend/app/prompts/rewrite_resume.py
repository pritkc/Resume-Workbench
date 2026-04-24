"""Prompt: rewrite_resume — second pass using critique feedback."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts._text_prompts import read_shipped_txt
from app.prompts.tailoring_blocks import REWRITE_RULES_BUNDLE, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY

STEP_NAME = "rewrite_resume"
STEP_LABEL = "Rewrite Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/rewrite_resume.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/rewrite_resume/instructions.txt",
    "apps/backend/app/prompts/text/fragments/resume_diff_output.txt",
    "apps/backend/app/prompts/text/fragments/tailoring_craft.txt",
    "apps/backend/app/prompts/text/fragments/tailoring_mode_full.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/rewrite_resume/user.txt"
PIPELINE = "full"
PIPELINE_ORDER = 4
RECEIVES_FROM = ["critique_resume"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = read_shipped_txt("rewrite_resume/instructions.txt")

RULES = REWRITE_RULES_BUNDLE
RULES_SOURCE = "resume_diff"

USER_TEMPLATE = read_shipped_txt("rewrite_resume/user.txt")

DATA_TEMPLATE = USER_TEMPLATE
_SHIPPED_RULES_BUNDLE = "\n\n".join([RESUME_DIFF_RULES, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + _SHIPPED_RULES_BUNDLE.strip()
VARIABLES = {
    "original_resume": "Base resume JSON or markdown",
    "tailor_resume_full_output": "First-pass diff JSON from tailor_resume_full",
    "critique_resume_output": "Critique JSON from critique_resume",
    "extract_jd_intel_output": "JSON from extract_jd_intel step",
    "response_contract": "Response contract JSON",
}


def build_messages(
    *,
    original_resume: str,
    tailor_resume_full_output: str,
    critique_resume_output: str,
    extract_jd_intel_output: str,
    response_contract: str,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            original_resume=original_resume,
            tailor_resume_full_output=tailor_resume_full_output,
            critique_resume_output=critique_resume_output,
            extract_jd_intel_output=extract_jd_intel_output,
            response_contract=response_contract,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    step_rules = load_override(STEP_NAME, "rules")
    if step_rules:
        rules = step_rules
    else:
        shared_rd = load_shared_rules_override("resume_diff")
        diff_block = shared_rd or RESUME_DIFF_RULES
        rules = "\n\n".join([diff_block, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        original_resume=original_resume,
        tailor_resume_full_output=tailor_resume_full_output,
        critique_resume_output=critique_resume_output,
        extract_jd_intel_output=extract_jd_intel_output,
        response_contract=response_contract,
    )
    return system, user
