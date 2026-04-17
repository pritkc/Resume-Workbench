"""Shared rule fragments for prompt steps."""

from app.prompts._rules.critique import (
    CRITIQUE_RULES,
    RULES_LABEL as CRITIQUE_LABEL,
    RULES_NAME as CRITIQUE_NAME,
    USED_BY as CRITIQUE_USED_BY,
)

__all__ = [
    "CRITIQUE_LABEL",
    "CRITIQUE_NAME",
    "CRITIQUE_RULES",
    "CRITIQUE_USED_BY",
]
