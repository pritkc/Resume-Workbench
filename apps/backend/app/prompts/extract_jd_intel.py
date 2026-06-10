"""Prompt: extract_jd_intel — structured intelligence from a job description."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "extract_jd_intel"
STEP_LABEL = "Extract JD intelligence"
STEP_VERSION = PROMPT_VERSIONS["extract_keywords"]
FILE_PATH = "prompts/extract_jd_intel.py"
SYSTEM_PROMPT_FILES = ("apps/backend/app/prompts/text/extract_jd_intel/system.txt",)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/extract_jd_intel/user.txt"
PIPELINE = "standalone"
PIPELINE_ORDER = 1
RECEIVES_FROM: list[str] = []
FEEDS_INTO = ["tailor_resume_full", "tailor_resume_lite"]

USER_TEMPLATE = read_shipped_txt("extract_jd_intel/user.txt")

EXTRACT_JD_INTELLIGENCE_PROMPT = USER_TEMPLATE
EXTRACT_KEYWORDS_PROMPT = USER_TEMPLATE

INSTRUCTIONS = read_shipped_txt("extract_jd_intel/system.txt")
RULES = ""
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "job_description": "Full or trimmed job description text",
}

EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT = INSTRUCTIONS.strip()
EXTRACT_KEYWORDS_SYSTEM_PROMPT = EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT


def build_messages(job_description: str) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(comp["user"], job_description=job_description)

    system = (load_override(STEP_NAME, "instructions") or INSTRUCTIONS).strip()
    user = render_user_template(USER_TEMPLATE, job_description=job_description)
    return system, user
