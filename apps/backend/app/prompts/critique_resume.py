"""Prompt: critique_resume — hiring-manager review of tailored diff."""

from __future__ import annotations

from typing import Any

from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "critique_resume"
STEP_LABEL = "Critique Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/critique_resume.py"
SYSTEM_PROMPT_FILES = ("apps/backend/app/prompts/text/critique_resume/system.txt",)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/critique_resume/user.txt"
PIPELINE = "full"
PIPELINE_ORDER = 3
RECEIVES_FROM = ["tailor_resume_full"]
FEEDS_INTO = ["rewrite_resume"]

INSTRUCTIONS = read_shipped_txt("critique_resume/system.txt")
RULES = ""

USER_TEMPLATE = read_shipped_txt("critique_resume/user.txt")

DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "original_resume": "Original master resume JSON — used to validate scope claims in the diff",
    "tailor_resume_full_output": "Tailored diff JSON from tailor_resume_full",
    "extract_jd_intel_output": (
        "JD blob placeholder — expanded from jd_intel_blob before string.Template in render_user_template"
    ),
    "jd_intel_blob": "Cached JD dict for $extract_jd_intel_output expansion",
}


def build_messages(
    *,
    tailor_resume_full_output: str,
    jd_intel_blob: dict[str, Any],
    original_resume: str = "",
) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            jd_intel_blob=jd_intel_blob,
            original_resume=original_resume,
            tailor_resume_full_output=tailor_resume_full_output,
        )

    system = (load_override(STEP_NAME, "instructions") or INSTRUCTIONS).strip()
    user = render_user_template(
        USER_TEMPLATE,
        jd_intel_blob=jd_intel_blob,
        original_resume=original_resume,
        tailor_resume_full_output=tailor_resume_full_output,
    )
    return system, user
