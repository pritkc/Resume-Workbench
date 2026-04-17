"""Prompt: parse_resume — structured JSON from raw resume text."""

from app.prompts._constants import PROMPT_VERSIONS
from app.prompts._schema import RESUME_SCHEMA_COMPACT

STEP_NAME = "parse_resume"
STEP_LABEL = "Parse resume"
STEP_VERSION = PROMPT_VERSIONS["parse_resume"]
FILE_PATH = "prompts/parse_resume.py"
PIPELINE = "standalone"
PIPELINE_ORDER = 0
RECEIVES_FROM: list[str] = []
FEEDS_INTO = ["tailor_resume_full", "tailor_resume_lite"]

PARSE_SYSTEM_PROMPT = "You are a JSON extraction engine. Output only valid JSON, no explanations."

USER_TEMPLATE = """Parse this resume into JSON. Output ONLY the JSON object.

Schema:
$schema

SECTIONS: Map to standard keys when possible. Non-standard sections → customSections with sectionType "text" (single block), "itemList" (title/subtitle/years/description entries), or "stringList" (simple list).

RULES:
- "" for missing text, [] for missing arrays, null for optional fields
- IDs start from 1
- skills.groups: use natural category labels from the resume (e.g., Backend, ML, Infra, Languages, Certifications)
- Custom section keys: snake_case (e.g., "volunteer_work", "publications")
- Overlapping dates (concurrent roles): preserve both, don't merge

DATES (critical — never discard month precision):
- Copy months exactly when present: "Jan 2020 - Dec 2023", "May 2021 - Present"
- "YYYY - YYYY" only when source truly has no months
- Normalize separators: "2020-2021" → "2020 - 2021", "Current"/"Ongoing" → "Present"
- Ambiguous durations ("3 years experience"): infer approximate years or use "~YYYY"

Resume:
$resume_text"""

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
