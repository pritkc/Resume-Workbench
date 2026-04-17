"""Migration equivalence: assembled tailoring prompts match get_prompt modules."""

from string import Template

from app.prompts import get_prompt
from app.prompts.tailoring_blocks import TAILORING_USER_SHELL
from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
    render_tailoring_user_prompt,
)


def test_full_system_message_matches_tailor_resume_full_module() -> None:
    old = assemble_tailoring_system_prompt("full")
    mod = get_prompt("tailor_resume_full")
    new, _ = mod.build_messages(
        original_resume="{}",
        job_intelligence="{}",
        response_contract="{}",
        output_language="English",
    )
    assert old == new


def test_lite_system_message_matches_tailor_resume_lite_module() -> None:
    old = assemble_tailoring_system_prompt("lite")
    mod = get_prompt("tailor_resume_lite")
    new, _ = mod.build_messages(
        original_resume="{}",
        job_intelligence="{}",
        response_contract="{}",
        output_language="English",
    )
    assert old == new


def test_full_user_message_matches_module() -> None:
    old = Template(TAILORING_USER_SHELL).substitute(
        mode_id="full",
        job_intelligence="{}",
        original_resume="{}",
        response_contract="{}",
        output_language="English",
    )
    mod = get_prompt("tailor_resume_full")
    _, new = mod.build_messages(
        original_resume="{}",
        job_intelligence="{}",
        response_contract="{}",
        output_language="English",
    )
    assert old == new
