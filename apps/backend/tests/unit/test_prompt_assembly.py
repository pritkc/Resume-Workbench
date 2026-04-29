"""Tests for tailoring prompt block assembly and mode resolution."""

from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
    build_prompt_context,
    render_tailoring_user_prompt,
)
from app.services.tailoring.models import (
    JDIntelligence,
    TailoringResumePayload,
    TailoringResponseContract,
)
from app.services.tailoring.contracts import build_response_contract


def test_assemble_full_contains_craft_and_mode_without_embedded_diff_rules() -> None:
    assembled = assemble_tailoring_system_prompt("full")
    assert "OUTPUT FORMAT:" not in assembled
    assert "ROLE & GOAL:" in assembled
    assert "OUTPUT HABIT" in assembled


def test_assemble_light_contains_light_touch() -> None:
    assembled = assemble_tailoring_system_prompt("lite")
    assert "Light touch" in assembled
    assert "Do NOT change job titles" in assembled


def test_render_user_prompt_fills_slots() -> None:
    text = render_tailoring_user_prompt(
        mode_id="full",
        extract_jd_intel_output_json="{}",
        original_resume_json="{}",
        response_contract_json="{}",
    )
    assert "EXTRACTED JD INTELLIGENCE:" in text
    assert "MODE:" not in text
    assert "$extract_jd_intel_output" not in text
    assert "OUTPUT FORMAT:" in text


def test_tailoring_response_contract_extensions() -> None:
    c = TailoringResponseContract(prompt_mode="full", extensions={"future": True})
    assert c.extensions.get("future") is True


def test_build_prompt_context_resolves_unknown_to_default() -> None:
    jd = JDIntelligence()
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    ctx = build_prompt_context(
        prompt_id="not_a_real_mode",
        jd_intelligence=jd,
        response_contract=rc,
        resume_payload=payload,
        original_resume_markdown="",
    )
    assert ctx.prompt_id == "full"


def test_tailoring_resume_to_llm_prompt_education_and_skills_without_group_ids(
    sample_resume: dict,
) -> None:
    payload = TailoringResumePayload.from_resume_data(sample_resume)
    assert payload is not None
    d = payload.to_llm_prompt_dict()
    assert "education" in d
    assert d["education"][0].get("institution") == "MIT"
    assert "groups" in d["skills"]
    assert all("id" not in g for g in d["skills"]["groups"])
    exp0 = d["workExperience"][0]
    assert exp0.get("company") == "Acme Corp"
    assert "date" not in exp0 and "years" not in exp0
    proj0 = d["personalProjects"][0]
    assert "date" not in proj0 and "years" not in proj0
    assert "project_period" in proj0 or proj0.get("role")


def test_config_resolve_prompt_id_migrates_legacy_ids() -> None:
    from app.prompts import IMPROVE_PROMPT_OPTIONS
    from app.routers.config import _resolve_prompt_id

    option_ids = {o["id"] for o in IMPROVE_PROMPT_OPTIONS}
    assert _resolve_prompt_id("keywords", option_ids) == "full"
    assert _resolve_prompt_id("nudge", option_ids) == "lite"
