"""Tests for tailoring prompt block assembly and mode resolution."""

from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
    build_prompt_context,
    render_tailoring_user_prompt,
)
from app.services.tailoring.models import (
    TailoringResumePayload,
    TailoringResponseContract,
)
from app.services.tailoring.contracts import build_response_contract


def test_assemble_full_contains_craft_and_mode_without_embedded_diff_rules() -> None:
    assembled = assemble_tailoring_system_prompt("full")
    assert "OUTPUT FORMAT:" not in assembled
    assert "ROLE & GOAL:" in assembled


def test_assemble_light_contains_light_touch() -> None:
    assembled = assemble_tailoring_system_prompt("lite")
    assert "Light touch" in assembled
    assert "Do NOT change job titles" in assembled


def test_render_user_prompt_fills_slots() -> None:
    text = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
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
    jd_blob: dict = {}
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    ctx = build_prompt_context(
        prompt_id="not_a_real_mode",
        jd_intel_blob=jd_blob,
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


# ── P0 contradiction checks ────────────────────────────────────────────────


def test_full_system_prompt_has_no_output_format_section() -> None:
    """OUTPUT FORMAT must NOT appear in system prompt — it belongs in $resume_diff_rules only."""
    system = assemble_tailoring_system_prompt("full")
    assert "OUTPUT FORMAT:" not in system, (
        "OUTPUT FORMAT instructions must live in resume_diff_output.txt (user message), "
        "not in the system prompt. Having it in both creates conflicting output authorities."
    )


def test_full_system_prompt_has_no_thinking_trace_instruction() -> None:
    """Thinking-trace / YAML instructions conflict with JSON-only compact diff output."""
    system = assemble_tailoring_system_prompt("full")
    lower = system.lower()
    assert "thinking trace" not in lower, "Remove 'thinking trace' from system prompt"
    assert "updated yaml" not in lower, "Remove 'updated yaml' from system prompt"


def test_full_system_prompt_has_role_and_goal() -> None:
    system = assemble_tailoring_system_prompt("full")
    assert "ROLE & GOAL:" in system


def test_resume_diff_rules_in_user_prompt() -> None:
    """$resume_diff_rules must be rendered into the user message (output-format authority)."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    assert "OUTPUT FORMAT:" in user, (
        "$resume_diff_rules must include OUTPUT FORMAT instructions in the user message"
    )
    assert "$resume_diff_rules" not in user, "Template placeholder must be substituted"


def test_resume_diff_rules_no_years_format() -> None:
    """Summary schema must NOT force '[N]+ years in [domain]' — conflicts with SUMMARY section."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    assert "[N]+ years" not in RESUME_DIFF_RULES, (
        "resume_diff_output.txt summary rule forces a years-count format that "
        "the SUMMARY section in the same file explicitly forbids (years-count format). "
        "Remove the [N]+ years template from the diff rules."
    )


def test_resume_diff_rules_has_bullet_policy() -> None:
    """Diff rules must mention bullet handling (prompt-led; not hard-coded replace-only)."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "bullet" in lower


def test_resume_diff_rules_limit_summary_without_bullet_length_cap() -> None:
    """Summary should stay render-fit, but bullets should not be forced thin."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "120-155 characters" in lower
    assert "105-145 characters" not in lower
    assert "hard max 165" not in lower
    assert "one clause plus one outcome" not in lower


def test_resume_diff_rules_do_not_allow_default_new_bullet_indexes() -> None:
    """Work experience should rewrite existing bullets unless the contract explicitly allows additions."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "rewrite existing indexes only" in lower
    assert "explicitly permits new trailing indexes" in lower


def test_resume_diff_rules_prefer_broader_profile_over_jd_copy() -> None:
    """Tailoring should translate the JD into a broader credible candidate profile."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "jd is a lens, not a script" in lower
    assert "broader impressive profile" in lower
    assert "translate responsibility phrases" in lower
    assert "not verbatim phrase borrowing" in lower
    assert "paraphrased jd responsibility" in lower


def test_resume_diff_rules_keep_bold_keywords_compact() -> None:
    """Bold keywords should be short technical ATS terms, not long phrases."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "8-12 short high-visibility technical ats terms" in lower
    assert "1-3 word terms only" in lower
    assert "avoid sentences, soft skills, and generic domain phrases" in lower


def test_resume_diff_rules_allows_plausible_new_claims() -> None:
    """Full generation can add plausible stronger claims the user can prove later."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "claim policy" in lower
    assert "strong plausible claims" in lower
    assert "do not require exact source wording" in lower


def test_resume_diff_rules_lock_project_count_and_limit_tool_promotion() -> None:
    """Project count and tool specificity should not drift from the source resume."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "project bullet count is locked" in lower
    assert "violation renders the output malformed" in lower
    assert "do not promote tools from tech_stacks into bullet text" in lower
    assert "source bullet already names that tool" in lower


def test_resume_diff_rules_apply_bans_globally_and_keep_skills_specific() -> None:
    """Jargon bans apply everywhere, and skills should not become prose phrases."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "apply jargon and phrases bans to summary, role titles, and bullets equally" in lower
    assert "skill values must be specific tool, product, method, or technology names" in lower
    assert "not descriptive phrases" in lower


def test_resume_diff_rules_forbid_markdown_fences() -> None:
    """LLM output must be raw JSON so local parsers do not receive markdown fences."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "no markdown fences" in lower
    assert "start with {" in lower and "end with }" in lower


def test_full_prompt_preserves_project_bullet_count_and_stacks() -> None:
    """Full tailoring should not collapse projects or omit stack lines from changed entries."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "do not compress project bullets" in lower
    assert "emit tech_stacks" in lower


def test_full_prompt_retains_closest_two_projects_and_superset_skills() -> None:
    """Temporary full-run needs: closest projects stay stable and skills stay broader than the JD."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "retain the closest two projects" in lower
    assert "preserve impressive superset skills" in lower
    assert "do not copy jd titles or secondary role labels" in lower
    assert "when in doubt, keep the existing qualifier or omit" in lower


def test_full_system_prompt_aligns_titles_to_target_domain() -> None:
    """Title qualifiers should move toward the JD domain instead of generic AI/backend labels."""
    system = assemble_tailoring_system_prompt("full")
    lower = system.lower()
    assert "target role domain" in lower
    assert "generic ai/backend" in lower


def test_full_system_prompt_uses_broader_competencies_and_plausible_claims() -> None:
    """System prompt should ask for translation beyond exact JD language."""
    system = assemble_tailoring_system_prompt("full")
    lower = system.lower()
    assert "broader competencies behind the jd" in lower
    assert "reasonable new claim the user can later prove" in lower
    assert "do not borrow jd vocabulary" in lower


def test_resume_diff_rules_has_locked_fields() -> None:
    """Diff rules must document which fields are locked."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    assert "LOCKED" in RESUME_DIFF_RULES or "locked" in RESUME_DIFF_RULES.lower(), (
        "resume_diff_output.txt must list locked (immutable) fields"
    )


def test_resume_diff_rules_has_index_mapping_note() -> None:
    """Diff rules must explain that string keys are 0-based indexes matching contract order."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    assert "0-based" in RESUME_DIFF_RULES or "response_contract" in RESUME_DIFF_RULES, (
        "resume_diff_output.txt must state that experience/projects keys are 0-based "
        "integer strings matching response_contract entry order"
    )


def test_contract_to_prompt_dict_includes_mode_rules() -> None:
    """to_prompt_dict() must include mode_rules so the LLM sees constraints."""
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    d = rc.to_prompt_dict()
    assert "rules" in d, (
        "TailoringResponseContract.to_prompt_dict() must include 'rules' key with mode_rules. "
        "Currently mode_rules is built but silently omitted from the LLM-visible dict."
    )
    assert len(d["rules"]) > 0


def test_contract_to_prompt_dict_includes_index_mapping() -> None:
    """to_prompt_dict() must document that keys are 0-based and match contract order."""
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    d = rc.to_prompt_dict()
    assert "index_note" in d or "index_mapping" in d or any(
        "0-based" in str(v) or "contract order" in str(v)
        for v in d.values()
    ), "to_prompt_dict() must include an index mapping note"
