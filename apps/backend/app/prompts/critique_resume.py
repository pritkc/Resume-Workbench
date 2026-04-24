"""Prompt: critique_resume — hiring-manager review of tailored diff."""

from app.prompts._rules.critique import CRITIQUE_RULES
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "critique_resume"
STEP_LABEL = "Critique Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/critique_resume.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/critique_resume/instructions.txt",
    "apps/backend/app/prompts/text/fragments/critique_rules.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/critique_resume/user.txt"
PIPELINE = "full"
PIPELINE_ORDER = 3
RECEIVES_FROM = ["tailor_resume_full"]
FEEDS_INTO = ["rewrite_resume"]

INSTRUCTIONS = read_shipped_txt("critique_resume/instructions.txt")
RULES = CRITIQUE_RULES

USER_TEMPLATE = read_shipped_txt("critique_resume/user.txt")

DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
VARIABLES = {
    "tailor_resume_full_output": "Tailored diff JSON from tailor_resume_full",
    "extract_jd_intel_output": "JSON from extract_jd_intel step",
}


def build_messages(tailor_resume_full_output: str, extract_jd_intel_output: str) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            tailor_resume_full_output=tailor_resume_full_output,
            extract_jd_intel_output=extract_jd_intel_output,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override("critique")
        or RULES
    )
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        tailor_resume_full_output=tailor_resume_full_output,
        extract_jd_intel_output=extract_jd_intel_output,
    )
    return system, user
