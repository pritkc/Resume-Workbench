"""Shared tailoring blocks: craft text, per-mode strategy, and user shell."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts._text_prompts import read_shipped_txt

TAILORING_CONTRACT_BLOCK = RESUME_DIFF_RULES

TAILORING_CRAFT_BLOCK = read_shipped_txt("fragments/tailoring_craft.txt")

TAILORING_MODE_STRATEGY = {
    "full": read_shipped_txt("fragments/tailoring_mode_full.txt"),
    "lite": read_shipped_txt("fragments/tailoring_mode_lite.txt"),
}

TAILORING_USER_SHELL = read_shipped_txt("fragments/tailoring_user_shell.txt")

TAILORING_SYSTEM_PROMPT = "\n\n".join(
    [TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"], TAILORING_CONTRACT_BLOCK]
)

TAILORING_MODE_CONSTRAINTS = {k: v for k, v in TAILORING_MODE_STRATEGY.items()}

IMPROVE_RESUME_PROMPT_TEMPLATE = TAILORING_USER_SHELL
IMPROVE_RESUME_PROMPT = TAILORING_USER_SHELL

REWRITE_RULES_BUNDLE = "\n\n".join(
    [RESUME_DIFF_RULES, TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]]
)
