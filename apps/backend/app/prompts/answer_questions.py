"""Prompt: answer_questions — job application custom question answers."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "answer_questions"
STEP_LABEL = "Application questions"
STEP_VERSION = PROMPT_VERSIONS["application_questions_generate"]
FILE_PATH = "prompts/answer_questions.py"
SYSTEM_PROMPT_FILES = ("apps/backend/app/prompts/text/answer_questions/system.txt",)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/answer_questions/user.txt"
PIPELINE = "standalone"
PIPELINE_ORDER = 11
RECEIVES_FROM: list[str] = []
FEEDS_INTO: list[str] = []

APPLICATION_QUESTIONS_PROMPT = read_shipped_txt("answer_questions/user.txt")

APPLICATION_QUESTIONS_SYSTEM_PROMPT = read_shipped_txt("answer_questions/system.txt")

INSTRUCTIONS = APPLICATION_QUESTIONS_SYSTEM_PROMPT
RULES = ""
USER_TEMPLATE = APPLICATION_QUESTIONS_PROMPT
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip()
VARIABLES = {
    "job_target": "Role/company/location JSON (from job + JD metadata)",
    "job_description": "JD excerpt",
    "resume_profile": "Stable compact candidate profile (headline, summary, top roles/projects/education/skills) — same shape as cover letter profile",
    "tailored_resume": "Full current resume JSON (typically tailored) — use for role-specific facts and impact",
    "questions": "Questions list JSON",
}


def build_messages(
    *,
    job_target: str,
    job_description: str,
    resume_profile: str,
    tailored_resume: str,
    questions: str,
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
            tailored_resume=tailored_resume,
            questions=questions,
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
        tailored_resume=tailored_resume,
        questions=questions,
    )
    return system, user
