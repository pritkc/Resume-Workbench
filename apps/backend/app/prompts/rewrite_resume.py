"""Prompt: rewrite_resume — second pass using critique feedback."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "rewrite_resume"
STEP_LABEL = "Rewrite Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/rewrite_resume.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/rewrite_resume/system.txt",
    "apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/rewrite_resume/user.txt"
PIPELINE = "full"
PIPELINE_ORDER = 4
RECEIVES_FROM = ["critique_resume"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = read_shipped_txt("rewrite_resume/system.txt")
RULES = RESUME_DIFF_RULES
RULES_SOURCE = "resume_diff"

USER_TEMPLATE = read_shipped_txt("rewrite_resume/user.txt")

DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
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

    prose = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    diff = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override(RULES_SOURCE)
        or RULES
    )
    system = prose.strip() + "\n\n" + diff.strip()
    user = render_user_template(
        USER_TEMPLATE,
        original_resume=original_resume,
        tailor_resume_full_output=tailor_resume_full_output,
        critique_resume_output=critique_resume_output,
        extract_jd_intel_output=extract_jd_intel_output,
        response_contract=response_contract,
    )
    return system, user
