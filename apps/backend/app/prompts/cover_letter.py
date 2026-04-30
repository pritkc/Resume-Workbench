"""Cover letter + outreach: one shipped system/user pair; one LLM call at runtime."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "cover_letter"
STEP_LABEL = "Cover letter and outreach"
STEP_VERSION = PROMPT_VERSIONS["cover_letter_outreach"]
FILE_PATH = "prompts/cover_letter.py"
SYSTEM_PROMPT_FILES = ("apps/backend/app/prompts/text/cover_letter/system.txt",)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/cover_letter/user.txt"
PIPELINE = "standalone"
PIPELINE_ORDER = 10
RECEIVES_FROM: list[str] = []
FEEDS_INTO: list[str] = []

COMBINED_MESSAGES_SYSTEM_PROMPT = read_shipped_txt("cover_letter/system.txt")
COVER_LETTER_OUTREACH_PROMPT = read_shipped_txt("cover_letter/user.txt")

INSTRUCTIONS = COMBINED_MESSAGES_SYSTEM_PROMPT
RULES = ""
USER_TEMPLATE = COVER_LETTER_OUTREACH_PROMPT
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + ("\n\n" + RULES.strip() if RULES.strip() else "")
VARIABLES = {
    "job_target": "Role/company JSON",
    "job_description": "JD excerpt",
    "resume_profile": "Stable compact candidate profile JSON (skills, education breadth)",
    "tailored_resume_context": "Compact JD-specific framing from the rehydrated tailored resume (summary + top bullets + projects + education + selected_skills + style_note)",
}


def build_messages(
    *,
    job_target: str,
    job_description: str,
    resume_profile: str,
    tailored_resume_context: str = "",
) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            job_target=job_target,
            job_description=job_description,
            resume_profile=resume_profile,
            tailored_resume_context=tailored_resume_context,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES
    system = instructions.strip()
    if rules.strip():
        system = system + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        job_target=job_target,
        job_description=job_description,
        resume_profile=resume_profile,
        tailored_resume_context=tailored_resume_context,
    )
    return system, user
