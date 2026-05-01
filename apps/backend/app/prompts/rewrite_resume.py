"""Prompt: rewrite_resume — second pass using critique feedback."""

from __future__ import annotations

from typing import Any

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
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "original_resume": "Base resume JSON or markdown",
    "tailor_resume_full_output": "First-pass diff JSON from tailor_resume_full",
    "critique_resume_output": "Critique JSON from critique_resume",
    "response_contract": "Response contract JSON",
    "resume_diff_rules": "Shared compact JSON output schema (resume_diff; DB override supported)",
    "jd_intel_blob": (
        "Cached JD JSON ($extract_jd_intel_output + optional .paths)"
    ),
}


def build_messages(
    *,
    original_resume: str,
    tailor_resume_full_output: str,
    critique_resume_output: str,
    jd_intel_blob: dict[str, Any],
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
            jd_intel_blob=jd_intel_blob,
            original_resume=original_resume,
            tailor_resume_full_output=tailor_resume_full_output,
            critique_resume_output=critique_resume_output,
            response_contract=response_contract,
            resume_diff_rules=resume_diff_rules,
        )

    prose = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    system = prose.strip()
    user = render_user_template(
        USER_TEMPLATE,
        jd_intel_blob=jd_intel_blob,
        original_resume=original_resume,
        tailor_resume_full_output=tailor_resume_full_output,
        critique_resume_output=critique_resume_output,
        response_contract=response_contract,
        resume_diff_rules=resume_diff_rules,
    )
    return system, user
