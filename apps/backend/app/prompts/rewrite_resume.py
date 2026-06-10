"""Prompt: rewrite_resume — second pass using critique feedback."""

from __future__ import annotations

from typing import Any

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "rewrite_resume"
STEP_LABEL = "Rewrite Resume"
STEP_VERSION = PROMPT_VERSIONS["rewrite_resume"]
FILE_PATH = "prompts/rewrite_resume.py"
SYSTEM_PROMPT_FILES = (
    "apps/backend/app/prompts/text/rewrite_resume/system.txt",
)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/rewrite_resume/user.txt"
PIPELINE = "full"
PIPELINE_ORDER = 4
RECEIVES_FROM = ["critique_resume"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = read_shipped_txt("rewrite_resume/system.txt")
RULES = ""

USER_TEMPLATE = read_shipped_txt("rewrite_resume/user.txt")

DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "original_resume": "Base resume JSON or markdown",
    "tailor_resume_full_output": "First-pass tailored resume output from tailor_resume_full",
    "critique_resume_output": "Section-header critique output from critique_resume",
    "response_contract": "Response contract JSON",
    "output_template": "Section-header output template for this resume",
    "extract_jd_intel_output": (
        "JD blob placeholder — expanded from jd_intel_blob before render_user_template substitution"
    ),
    "jd_intel_blob": "Cached JD dict for $extract_jd_intel_output expansion",
}


def build_messages(
    *,
    original_resume: str,
    tailor_resume_full_output: str,
    critique_resume_output: str,
    jd_intel_blob: dict[str, Any],
    response_contract: str,
    output_template: str | None = None,
) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    template = output_template or response_contract

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            jd_intel_blob=jd_intel_blob,
            original_resume=original_resume,
            tailor_resume_full_output=tailor_resume_full_output,
            critique_resume_output=critique_resume_output,
            response_contract=response_contract,
            output_template=template,
            resume_diff_rules="",
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
        output_template=template,
    )
    return system, user
