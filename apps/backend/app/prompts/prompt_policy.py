"""Runtime helpers that derive enforcement policy from prompt text and constants."""

from __future__ import annotations

from functools import lru_cache
import re

from app.prompts._constants import BASIC_RESUME_TOOLS
from app.prompts._text_prompts import read_shipped_txt

_QUOTED_PHRASE_RE = re.compile(r'"([^"]+)"')


@lru_cache(maxsize=None)
def _resume_diff_rules() -> str:
    return read_shipped_txt("output_file_schema_rules/resume_diff_output.txt")


def _line_containing(needle: str) -> str:
    needle_lower = needle.casefold()
    for line in _resume_diff_rules().splitlines():
        if needle_lower in line.casefold():
            return line.strip()
    return ""


def _comma_terms_after_colon(line: str) -> frozenset[str]:
    if ":" not in line:
        return frozenset()
    tail = line.split(":", 1)[1].rstrip(".")
    return frozenset(
        term.strip().casefold()
        for term in tail.split(",")
        if term.strip()
    )


def resume_basic_terms() -> frozenset[str]:
    return BASIC_RESUME_TOOLS


def low_signal_bold_keywords() -> frozenset[str]:
    return _comma_terms_after_colon(_line_containing("Examples of low-signal bold terms to exclude"))


def generic_project_labels() -> frozenset[str]:
    parenthetical_line = _line_containing("never add JD-flavored parentheticals")
    parenthetical_terms = {
        match.strip("()").casefold()
        for match in _QUOTED_PHRASE_RE.findall(parenthetical_line)
        if match.strip()
    }
    return frozenset(parenthetical_terms | set(low_signal_bold_keywords()))
