"""Prompt: rewrite_resume — second pass using critique feedback."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts.tailoring_blocks import REWRITE_RULES_BUNDLE, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY

STEP_NAME = "rewrite_resume"
STEP_LABEL = "Rewrite Resume"
STEP_VERSION = "v1.0"
FILE_PATH = "prompts/rewrite_resume.py"
PIPELINE = "full"
PIPELINE_ORDER = 4
RECEIVES_FROM = ["critique_resume"]
FEEDS_INTO: list[str] = []

INSTRUCTIONS = """
You are a senior resume strategist. You received hiring-manager critique and must improve the diff.

Address every critique item. Scale back exaggerations, add specifics from the original resume,
weave missed keywords naturally, and strengthen weak bullets. Do not invent facts.

Maintain the same JSON diff shape as the first tailoring pass.
"""

RULES = REWRITE_RULES_BUNDLE
RULES_SOURCE = "resume_diff"

USER_TEMPLATE = """
ORIGINAL RESUME:
$original_resume

DRAFT RESUME (first pass):
$draft_resume

CRITIQUE (JSON):
$critique

JOB DESCRIPTION INTELLIGENCE:
$jd_intelligence

RESPONSE CONTRACT:
$response_contract
"""

DATA_TEMPLATE = USER_TEMPLATE
_SHIPPED_RULES_BUNDLE = "\n\n".join([RESUME_DIFF_RULES, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])
SYSTEM_DEFAULT = INSTRUCTIONS.strip() + "\n\n" + _SHIPPED_RULES_BUNDLE.strip()
VARIABLES = {
    "original_resume": "Base resume JSON or markdown",
    "draft_resume": "First-pass diff JSON",
    "critique": "Critique JSON",
    "jd_intelligence": "JD intelligence JSON",
    "response_contract": "Response contract JSON",
}


def build_messages(
    *,
    original_resume: str,
    draft_resume: str,
    critique: str,
    jd_intelligence: str,
    response_contract: str,
) -> tuple[str, str]:
    from app.prompts import load_override, load_shared_rules_override
    from app.prompts._prompt_loader import load_composer_override, render_user_template

    comp = load_composer_override(STEP_NAME)
    if comp:
        return comp["system"], render_user_template(
            comp["user"],
            original_resume=original_resume,
            draft_resume=draft_resume,
            critique=critique,
            jd_intelligence=jd_intelligence,
            response_contract=response_contract,
        )

    instructions = load_override(STEP_NAME, "instructions") or INSTRUCTIONS
    step_rules = load_override(STEP_NAME, "rules")
    if step_rules:
        rules = step_rules
    else:
        shared_rd = load_shared_rules_override("resume_diff")
        diff_block = shared_rd or RESUME_DIFF_RULES
        rules = "\n\n".join([diff_block, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])
    system = instructions.strip() + "\n\n" + rules.strip()
    user = render_user_template(
        USER_TEMPLATE,
        original_resume=original_resume,
        draft_resume=draft_resume,
        critique=critique,
        jd_intelligence=jd_intelligence,
        response_contract=response_contract,
    )
    return system, user
