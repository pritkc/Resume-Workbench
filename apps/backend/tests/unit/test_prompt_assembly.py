"""Tests for tailoring prompt block assembly and mode resolution."""

from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
    render_tailoring_user_prompt,
)
from app.services.tailoring.models import TailoringResponseContract
from app.services.tailoring.prompting import build_prompt_context
from app.services.tailoring.models import JDIntelligence, TailoringResumePayload
from app.services.tailoring.contracts import build_response_contract


def test_assemble_full_contains_contract_craft_and_mode() -> None:
    assembled = assemble_tailoring_system_prompt("full")
    assert "OUTPUT FORMAT:" in assembled
    assert "APPROACH:" in assembled
    assert "TAILORING MODE: Full edit" in assembled


def test_assemble_light_contains_light_touch() -> None:
    assembled = assemble_tailoring_system_prompt("lite")
    assert "Light touch" in assembled
    assert "Do NOT change job titles" in assembled


def test_render_user_prompt_fills_slots() -> None:
    text = render_tailoring_user_prompt(
        mode_id="full",
        job_intelligence_json="{}",
        original_resume_json="{}",
        response_contract_json="{}",
        output_language="English",
    )
    assert "MODE: full" in text
    assert "$job_intelligence" not in text
    assert "English" in text


def test_tailoring_response_contract_extensions() -> None:
    c = TailoringResponseContract(prompt_mode="full", extensions={"future": True})
    assert c.extensions.get("future") is True


def test_build_prompt_context_resolves_unknown_to_default() -> None:
    jd = JDIntelligence()
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    ctx = build_prompt_context(
        prompt_id="not_a_real_mode",
        language="en",
        jd_intelligence=jd,
        response_contract=rc,
        resume_payload=payload,
        original_resume_markdown="",
    )
    assert ctx.prompt_id == "full"


def test_config_resolve_prompt_id_migrates_legacy_ids() -> None:
    from app.prompts import IMPROVE_PROMPT_OPTIONS
    from app.routers.config import _resolve_prompt_id

    option_ids = {o["id"] for o in IMPROVE_PROMPT_OPTIONS}
    assert _resolve_prompt_id("keywords", option_ids) == "full"
    assert _resolve_prompt_id("nudge", option_ids) == "lite"
