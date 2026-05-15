"""Tailoring prompt helpers and backward-compat exports for catalog and services."""

from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts._text_prompts import read_shipped_txt

TAILORING_CONTRACT_BLOCK = RESUME_DIFF_RULES

_MERGED_FULL = read_shipped_txt("tailor_resume_full/system.txt")
_MERGED_LITE = read_shipped_txt("tailor_resume_lite/system.txt")
_MARK = "\n\nTAILORING MODE:"


def _craft_from_merged(merged: str) -> str:
    before, sep, _rest = merged.partition(_MARK)
    return before.strip() if sep else merged.strip()


def _mode_from_merged(merged: str) -> str:
    _before, sep, rest = merged.partition(_MARK)
    if not sep:
        return ""
    return ("TAILORING MODE:" + rest).strip()


TAILORING_CRAFT_BLOCK = _craft_from_merged(_MERGED_FULL)
TAILORING_MODE_STRATEGY = {
    "full": _mode_from_merged(_MERGED_FULL),
    "lite": _mode_from_merged(_MERGED_LITE),
}
TAILORING_USER_SHELL_FULL = read_shipped_txt("tailor_resume_full/user.txt")
TAILORING_USER_SHELL_LITE = read_shipped_txt("tailor_resume_lite/user.txt")

# System prompt is craft + mode; primary tailoring output shape ships as $output_template.
TAILORING_SYSTEM_PROMPT = "\n\n".join([TAILORING_CRAFT_BLOCK, TAILORING_MODE_STRATEGY["full"]])

TAILORING_MODE_CONSTRAINTS = {k: v for k, v in TAILORING_MODE_STRATEGY.items()}

TAILORING_USER_SHELL = TAILORING_USER_SHELL_FULL
IMPROVE_RESUME_PROMPT_TEMPLATE = TAILORING_USER_SHELL_FULL
IMPROVE_RESUME_PROMPT = TAILORING_USER_SHELL_FULL
