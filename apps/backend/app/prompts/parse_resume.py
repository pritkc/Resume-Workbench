"""Prompt: parse_resume — structured JSON from raw resume text."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._schema import RESUME_SCHEMA_COMPACT
from app.prompts._text_prompts import read_shipped_txt

STEP_NAME = "parse_resume"
STEP_LABEL = "Parse resume"
STEP_VERSION = PROMPT_VERSIONS["parse_resume"]
FILE_PATH = "prompts/parse_resume.py"
SYSTEM_PROMPT_FILES = ("apps/backend/app/prompts/text/parse_resume/system.txt",)
USER_PROMPT_FILE = "apps/backend/app/prompts/text/parse_resume/user.txt"
PIPELINE = "standalone"
PIPELINE_ORDER = 0
RECEIVES_FROM: list[str] = []
FEEDS_INTO = ["tailor_resume_full", "tailor_resume_lite"]

PARSE_SYSTEM_PROMPT = read_shipped_txt("parse_resume/system.txt")
USER_TEMPLATE = read_shipped_txt("parse_resume/user.txt")

PARSE_RESUME_PROMPT = USER_TEMPLATE

INSTRUCTIONS = PARSE_SYSTEM_PROMPT
RULES = ""
DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + ("\n\n" + RULES.strip() if RULES.strip() else "")
VARIABLES = {
    "schema": "JSON schema compact example",
    "resume_text": "Raw resume text from upload",
}


def build_messages(resume_text: str, schema: str | None = None) -> tuple[str, str]:
    from app.prompts import load_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    sch = schema or RESUME_SCHEMA_COMPACT
    if comp:
        return comp["system"], render_user_template(comp["user"], schema=sch, resume_text=resume_text)

    inst = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = load_override(STEP_NAME, "rules") or RULES
    system = inst.strip()
    if rules.strip():
        system = system + "\n\n" + rules.strip()
    user = render_user_template(USER_TEMPLATE, schema=sch, resume_text=resume_text)
    return system, user
