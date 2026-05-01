"""Migration equivalence: assembled tailoring prompts match get_prompt modules."""

from string import Template

from app.prompts import get_prompt
from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
from app.prompts.tailoring_blocks import TAILORING_USER_SHELL_FULL, TAILORING_USER_SHELL_LITE
from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
)


def test_full_system_message_matches_tailor_resume_full_module() -> None:
    old = assemble_tailoring_system_prompt("full")
    mod = get_prompt("tailor_resume_full")
    new, _ = mod.build_messages(
        original_resume="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    assert old == new


def test_lite_system_message_matches_tailor_resume_lite_module() -> None:
    old = assemble_tailoring_system_prompt("lite")
    mod = get_prompt("tailor_resume_lite")
    new, _ = mod.build_messages(
        original_resume="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    assert old == new


def test_full_user_message_matches_module() -> None:
    old = Template(TAILORING_USER_SHELL_FULL).substitute(
        extract_jd_intel_output="{}",
        original_resume="{}",
        response_contract="{}",
        resume_diff_rules=RESUME_DIFF_RULES.strip(),
    )
    mod = get_prompt("tailor_resume_full")
    _, new = mod.build_messages(
        original_resume="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    assert old == new


def test_lite_user_message_matches_module() -> None:
    old = Template(TAILORING_USER_SHELL_LITE).substitute(
        extract_jd_intel_output="{}",
        original_resume="{}",
        response_contract="{}",
        resume_diff_rules=RESUME_DIFF_RULES.strip(),
    )
    mod = get_prompt("tailor_resume_lite")
    _, new = mod.build_messages(
        original_resume="{}",
        jd_intel_blob={},
        response_contract="{}",
    )
    assert old == new
