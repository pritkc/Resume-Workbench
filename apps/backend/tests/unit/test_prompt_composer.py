"""Unit tests for string.Template-based prompts and composer helpers."""

from pathlib import Path
from string import Template

import pytest

from app.prompts import get_prompt
from app.prompts._prompt_loader import (
    render_user_template,
    validate_user_template_against_variables,
)
from app.prompts.extract_jd_intel import USER_TEMPLATE as JD_USER


def test_extract_jd_intel_user_substitutes_job_description() -> None:
    jd = "Senior Python engineer role\nRemote OK"
    out = Template(JD_USER).substitute(job_description=jd)
    assert jd in out
    assert "$job_description" not in out
    assert "=== JD METADATA ===" in out
    assert "ROLE:" in out
    assert "=== JD INTEL ===" in out


def test_render_user_template_rejects_unknown_placeholder() -> None:
    with pytest.raises(ValueError, match="Missing template variable"):
        render_user_template("Hello $name", foo="bar")


def test_render_user_template_allows_literal_dollar_not_a_placeholder() -> None:
    """Currency or other $text that is not a declared key stays literal in the template body."""
    text = render_user_template(
        "A=$x mid$50k tail=$y",
        x="1",
        y="2",
    )
    assert text == "A=1 mid$50k tail=2"


def test_validate_user_template_against_variables() -> None:
    validate_user_template_against_variables(
        "A $x and $y",
        frozenset({"x", "y"}),
    )
    with pytest.raises(ValueError, match="unknown placeholders"):
        validate_user_template_against_variables(
            "A $x and $z",
            frozenset({"x", "y"}),
        )


def test_tailor_build_messages_fills_template() -> None:
    mod = get_prompt("tailor_resume_full")
    _, user = mod.build_messages(
        original_resume="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    assert "$extract_jd_intel_output" not in user
    assert "JD INTELLIGENCE:" in user


def test_second_pass_prompts_preserve_anti_mirror_guards() -> None:
    """Critique/rewrite pass must not undo primary anti-JD-mirror constraints."""
    critique = get_prompt("critique_resume")
    rewrite = get_prompt("rewrite_resume")

    critique_system, critique_user = critique.build_messages(
        original_resume="{}",
        tailor_resume_full_output="{}",
        jd_intel_blob={},
    )
    rewrite_system, rewrite_user = rewrite.build_messages(
        original_resume="{}",
        tailor_resume_full_output="{}",
        critique_resume_output="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    combined = "\n".join([critique_system, critique_user, rewrite_system, rewrite_user]).lower()

    assert "jd is only a prioritization lens" in combined
    assert "do not introduce named vendor products" in combined
    assert "do not increase jd noun repetition" in combined
    assert "must appear in diff" not in combined
    assert "exact forms, exact capitalization" not in combined


def test_composer_override_takes_precedence(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    from app.prompts import extract_jd_intel as mod
    from app.prompts import _prompt_loader as pl

    monkeypatch.setattr(pl, "_OVERRIDE_DIR", tmp_path)
    path = tmp_path / "extract_jd_intel.composer.json"
    path.write_text(
        '{"system": "SYS", "user": "USER $job_description"}',
        encoding="utf-8",
    )
    s, u = mod.build_messages("hello")
    assert s == "SYS"
    assert u == "USER hello"
