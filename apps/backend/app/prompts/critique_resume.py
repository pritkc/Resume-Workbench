"""Prompt: critique_resume — hiring-manager review of tailored diff."""

from app.prompts._rules.critique import CRITIQUE_RULES

STEP_NAME = "critique_resume"
STEP_LABEL = "Critique Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/critique_resume.py"
PIPELINE = "full"
PIPELINE_ORDER = 3
RECEIVES_FROM = ["tailor_resume_full"]
FEEDS_INTO = ["rewrite_resume"]

INSTRUCTIONS = """
You are a senior hiring manager at a top tech company. You've reviewed thousands of resumes
and can spot red flags, exaggerations, and missed opportunities.

YOUR TASK:
Review this draft resume diff with a critical eye.

LOOK FOR:
1. RED FLAGS — scope claims that seem inflated, vague achievements, buzzword stuffing, inconsistencies
2. MISSED KEYWORDS — JD requirements not reflected in the diff
3. WEAK BULLETS — generic lines without impact

Be specific with locations (e.g., experience.0.bullets.2). Be honest and constructive.
"""

RULES = CRITIQUE_RULES

USER_TEMPLATE = """
DRAFT RESUME (to critique):
$draft_resume

JOB DESCRIPTION INTELLIGENCE:
$jd_intelligence
"""

DATA_TEMPLATE = USER_TEMPLATE
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + RULES.strip()
VARIABLES = {
    "draft_resume": "Tailored diff JSON from the prior step",
    "jd_intelligence": "JD intelligence JSON",
}


def build_messages(draft_resume: str, jd_intelligence: str) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"], draft_resume=draft_resume, jd_intelligence=jd_intelligence
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    rules = (
        load_override(STEP_NAME, "rules")
        or load_shared_rules_override("critique")
        or RULES
    )
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(USER_TEMPLATE, draft_resume=draft_resume, jd_intelligence=jd_intelligence)
    return system, user
