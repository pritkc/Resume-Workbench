"""LLM prompt registry, overrides, and re-exports."""

from __future__ import annotations

import importlib
import re
from pathlib import Path
from types import ModuleType

from app.prompts._constants import (
    DEFAULT_IMPROVE_PROMPT_ID,
    IMPROVE_PROMPT_OPTIONS,
    PROMPT_VERSIONS,
    get_language_name,
)
from app.prompts._rules.jd_intel import JD_INTELLIGENCE_CONTRACT_BLOCK, JD_INTELLIGENCE_CRAFT_BLOCK
from app.prompts.answer_questions import APPLICATION_QUESTIONS_PROMPT, APPLICATION_QUESTIONS_SYSTEM_PROMPT
from app.prompts.cover_letter import COMBINED_MESSAGES_SYSTEM_PROMPT
from app.prompts.extract_jd_intel import (
    EXTRACT_JD_INTELLIGENCE_PROMPT,
    EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT,
    EXTRACT_KEYWORDS_PROMPT,
    EXTRACT_KEYWORDS_SYSTEM_PROMPT,
)
from app.prompts.parse_resume import PARSE_RESUME_PROMPT
from app.prompts.tailoring_blocks import (
    IMPROVE_RESUME_PROMPT,
    IMPROVE_RESUME_PROMPT_TEMPLATE,
    TAILORING_CONTRACT_BLOCK,
    TAILORING_CRAFT_BLOCK,
    TAILORING_MODE_CONSTRAINTS,
    TAILORING_MODE_STRATEGY,
    TAILORING_SYSTEM_PROMPT,
    TAILORING_USER_SHELL,
    TAILORING_USER_SHELL_FULL,
    TAILORING_USER_SHELL_LITE,
)

VALID_STEPS = frozenset(
    {
        "parse_resume",
        "extract_jd_intel",
        "tailor_resume_full",
        "tailor_resume_lite",
        "critique_resume",
        "rewrite_resume",
        "cover_letter",
        "answer_questions",
    }
)

_VALID_SHARED_RULES = frozenset({"resume_diff", "jd_intel", "critique"})

_OVERRIDE_DIR = Path(__file__).parent.parent / "prompt_overrides"

_PROMPT_MODULE_CACHE: dict[str, ModuleType] = {}

_STEP_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


def get_prompt(step_name: str) -> ModuleType:
    if step_name not in VALID_STEPS:
        raise ValueError(f"Unknown step: {step_name}")
    if step_name not in _PROMPT_MODULE_CACHE:
        _PROMPT_MODULE_CACHE[step_name] = importlib.import_module(f"app.prompts.{step_name}")
    return _PROMPT_MODULE_CACHE[step_name]


def load_override(step_name: str, part: str) -> str | None:
    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    if part not in ("instructions", "rules"):
        raise ValueError("Invalid part")
    if not _STEP_NAME_RE.fullmatch(step_name):
        raise ValueError("Invalid step_name")
    path = _OVERRIDE_DIR / f"{step_name}.{part}.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def save_override(step_name: str, part: str, content: str) -> None:
    if step_name not in VALID_STEPS:
        raise ValueError("Invalid step_name")
    if part not in ("instructions", "rules"):
        raise ValueError("Invalid part")
    _OVERRIDE_DIR.mkdir(parents=True, exist_ok=True)
    (_OVERRIDE_DIR / f"{step_name}.{part}.txt").write_text(content, encoding="utf-8")


def delete_override(step_name: str, part: str) -> bool:
    path = _OVERRIDE_DIR / f"{step_name}.{part}.txt"
    if path.exists():
        path.unlink()
        return True
    return False


def has_override(step_name: str, part: str) -> bool:
    return (_OVERRIDE_DIR / f"{step_name}.{part}.txt").exists()


def load_shared_rules_override(rules_name: str) -> str | None:
    if rules_name not in _VALID_SHARED_RULES:
        raise ValueError("Invalid shared rules name")
    path = _OVERRIDE_DIR / f"_rules.{rules_name}.txt"
    if not path.exists():
        return None
    return path.read_text(encoding="utf-8")


def save_shared_rules_override(rules_name: str, content: str) -> None:
    if rules_name not in _VALID_SHARED_RULES:
        raise ValueError("Invalid shared rules name")
    _OVERRIDE_DIR.mkdir(parents=True, exist_ok=True)
    (_OVERRIDE_DIR / f"_rules.{rules_name}.txt").write_text(content, encoding="utf-8")


def delete_shared_rules_override(rules_name: str) -> bool:
    if rules_name not in _VALID_SHARED_RULES:
        raise ValueError("Invalid shared rules name")
    path = _OVERRIDE_DIR / f"_rules.{rules_name}.txt"
    if path.exists():
        path.unlink()
        return True
    return False


def has_shared_rules_override(rules_name: str) -> bool:
    if rules_name not in _VALID_SHARED_RULES:
        raise ValueError("Invalid shared rules name")
    return (_OVERRIDE_DIR / f"_rules.{rules_name}.txt").exists()


from app.prompts._prompt_loader import (  # noqa: E402
    delete_composer_override,
    has_composer_override,
    load_composer_override,
    render_user_template,
    save_composer_override,
    validate_user_template_against_variables,
)


__all__ = [
    "APPLICATION_QUESTIONS_PROMPT",
    "APPLICATION_QUESTIONS_SYSTEM_PROMPT",
    "COMBINED_MESSAGES_SYSTEM_PROMPT",
    "DEFAULT_IMPROVE_PROMPT_ID",
    "EXTRACT_JD_INTELLIGENCE_PROMPT",
    "EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT",
    "EXTRACT_KEYWORDS_PROMPT",
    "EXTRACT_KEYWORDS_SYSTEM_PROMPT",
    "IMPROVE_PROMPT_OPTIONS",
    "IMPROVE_RESUME_PROMPT",
    "IMPROVE_RESUME_PROMPT_TEMPLATE",
    "JD_INTELLIGENCE_CONTRACT_BLOCK",
    "JD_INTELLIGENCE_CRAFT_BLOCK",
    "PARSE_RESUME_PROMPT",
    "PROMPT_VERSIONS",
    "TAILORING_CONTRACT_BLOCK",
    "TAILORING_CRAFT_BLOCK",
    "TAILORING_MODE_CONSTRAINTS",
    "TAILORING_MODE_STRATEGY",
    "TAILORING_SYSTEM_PROMPT",
    "TAILORING_USER_SHELL",
    "TAILORING_USER_SHELL_FULL",
    "TAILORING_USER_SHELL_LITE",
    "VALID_STEPS",
    "delete_composer_override",
    "delete_override",
    "delete_shared_rules_override",
    "has_composer_override",
    "get_language_name",
    "get_prompt",
    "has_override",
    "has_shared_rules_override",
    "load_composer_override",
    "load_override",
    "load_shared_rules_override",
    "render_user_template",
    "save_composer_override",
    "save_override",
    "save_shared_rules_override",
    "validate_user_template_against_variables",
]
