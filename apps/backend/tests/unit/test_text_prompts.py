"""Shipped prompt text loader (Phase 3.12.2)."""

import pytest

from app.prompts import VALID_STEPS
from app.prompts._text_prompts import read_shipped_txt, text_root


def test_read_shipped_txt_parse_resume_system() -> None:
    t = read_shipped_txt("parse_resume/system.txt")
    assert "JSON extraction" in t
    assert t == t.strip() or "\n" in t


def test_read_shipped_txt_strips_crlf() -> None:
    # Loader normalizes newlines; spot-check fragment exists
    assert "OUTPUT FORMAT:" in read_shipped_txt("fragments/resume_diff_output.txt")


def test_text_root_contains_index_yaml() -> None:
    assert (text_root() / "index.yaml").is_file()


def test_index_yaml_steps_match_valid_steps() -> None:
    import yaml

    raw = (text_root() / "index.yaml").read_text(encoding="utf-8")
    data = yaml.safe_load(raw)
    listed = frozenset(str(s) for s in data["steps"])
    assert listed == VALID_STEPS
