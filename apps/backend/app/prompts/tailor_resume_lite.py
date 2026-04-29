"""Prompt: tailor_resume_lite — conservative resume tailoring."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._rules.resume_diff import RESUME_DIFF_RULES, RULES_NAME
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "tailor_resume_lite"
STEP_LABEL = "Tailor resume (lite)"
STEP_VERSION = PROMPT_VERSIONS["tailoring_user"]
FILE_PATH = "prompts/tailor_resume_lite.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/tailor_resume_lite/system.txt",
    "apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/tailor_resume_lite/user.txt"
PIPELINE = "lite"
PIPELINE_ORDER = 2
RECEIVES_FROM = ["extract_jd_intel"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = read_shipped_txt("tailor_resume_lite/system.txt")
RULES = RESUME_DIFF_RULES
RULES_SOURCE = RULES_NAME
USER_TEMPLATE = read_shipped_txt("tailor_resume_lite/user.txt")
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "extract_jd_intel_output": "JSON from extract_jd_intel step",
    "original_resume": "Structured resume JSON or markdown",
    "response_contract": "Allowed response shape for this resume",
    "resume_diff_rules": "Shared compact JSON output schema (resume_diff; DB override supported)",
}


def build_messages(
    *,
    original_resume: str,
    extract_jd_intel_output: str,
    response_contract: str,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    diff = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override(RULES_SOURCE)
        or RULES
    )
    resume_diff_rules = diff.strip()

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            extract_jd_intel_output=extract_jd_intel_output,
            original_resume=original_resume,
            response_contract=response_contract,
            resume_diff_rules=resume_diff_rules,
        )

    prose = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    system = prose.strip()
    user = render_user_template(
        USER_TEMPLATE,
        extract_jd_intel_output=extract_jd_intel_output,
        original_resume=original_resume,
        response_contract=response_contract,
        resume_diff_rules=resume_diff_rules,
    )
    return system, user
