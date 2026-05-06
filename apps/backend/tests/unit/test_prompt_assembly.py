"""Tests for tailoring prompt block assembly and mode resolution."""

from app.services.tailoring.prompting import (
    assemble_tailoring_system_prompt,
    build_prompt_context,
    render_tailoring_user_prompt,
    validate_prompt_canaries,
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


def test_render_user_prompt_injects_custom_instructions_before_full_run_rules() -> None:
    text = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
        custom_prompt_instructions="Prioritize fintech platform experience.",
    )

    assert "CUSTOM HIGH-PRIORITY INSTRUCTIONS" in text
    assert "override all other tailoring instructions for this run" in text
    assert "Prioritize fintech platform experience." in text
    assert text.index("Prioritize fintech platform experience.") < text.index(
        "EDITORIAL SEQUENCE"
    )


def test_render_user_prompt_omits_custom_instruction_section_when_blank() -> None:
    text = render_tailoring_user_prompt(
        mode_id="lite",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
        custom_prompt_instructions="   ",
    )

    assert "CUSTOM HIGH-PRIORITY INSTRUCTIONS" not in text


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
    assert len(ctx.prompt_hash) == 12


def test_build_prompt_context_validates_current_prompt_canaries() -> None:
    ctx = build_prompt_context(
        prompt_id="full",
        jd_intel_blob={},
        response_contract=build_response_contract(TailoringResumePayload(), prompt_id="full"),
        resume_payload=TailoringResumePayload(),
        original_resume_markdown="",
    )
    validate_prompt_canaries(ctx.user_prompt, ("JD coverage themes",))
    assert "translation candidates, not mandatory insertions" in ctx.user_prompt


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
    assert "105-135 characters" in lower
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
    assert "jd is a lens, not the resume's center" in lower
    assert "broader capability first" in lower
    assert "translate responsibility phrases" in lower
    assert "not verbatim phrase borrowing" in lower
    assert "paraphrased jd responsibility" in lower
    assert "no more than 1-2 bullets per experience entry" in lower
    assert "original resume is the superset" in lower
    assert "do not make every section repeat the same jd nouns" in lower


def test_resume_diff_rules_keep_bold_keywords_compact() -> None:
    """Bold keywords should be short technical ATS terms, not long phrases."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "6-10 short high-visibility technical ats terms" in lower
    assert "1-3 word terms only" in lower
    assert "avoid sentences, soft skills, and generic domain phrases" in lower
    assert "do not include basic tools or generic role/domain labels" in lower


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
    assert "broad professional toolkit" in lower
    assert "do not emit basic office tools" in lower
    assert "target 4-5 dense groups" in lower
    assert "add at most 1-2 jd-specific values" in lower


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
    assert "projects: preserve source bullet count and shape" in lower
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
    assert "edit at most the closest two projects" in lower
    assert "preserve impressive superset skills" in lower
    assert "do not copy jd titles or secondary role labels" in lower
    assert "when in doubt, keep the existing qualifier or omit" in lower
    assert "at most 1-2 bullets per experience" in lower
    assert "omit unchanged bullet indexes" in lower
    assert "translation candidates, not mandatory insertions" in lower
    assert "career story" in lower
    assert "story retention" in lower


def test_full_prompt_uses_coverage_hooks_not_jd_insertion_commands() -> None:
    """JD intelligence labels should not tell the model to connect or weave every bullet."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "every bullet connects" not in lower
    assert "weave into summary and bullets" not in lower
    assert "jd coverage themes" in lower
    assert "competency hooks, not resume copy" in lower
    assert "coverage signals, not phrases to weave" in lower
    assert "do not force every bullet to connect" in lower


def test_full_prompt_splits_experience_sparse_diffs_from_project_shape() -> None:
    """Experience diffs should stay sparse while edited projects preserve bullet shape."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "for roles with 2 or fewer bullets, touch at most one bullet" in lower
    assert "experience: omit unchanged bullet indexes" in lower
    assert "projects: preserve source bullet count and shape" in lower
    assert "including lightly unchanged bullets when needed to prevent compression" in lower


def test_jd_extractor_prompts_use_neutral_hooks_not_mirror_language() -> None:
    """Extractor output should feed translation, not repeated JD phrasing."""
    from app.prompts.extract_jd_intel import USER_TEMPLATE

    lower = USER_TEMPLATE.lower()
    assert "neutral competency hooks" in lower
    assert "coverage checklist, not prose to reuse" in lower
    assert "terms to mirror" not in lower
    assert "not mandatory mirror phrases" in lower


def test_resume_diff_rules_handles_pivot_roles_from_candidate_identity() -> None:
    """Pivot-role summaries should preserve the candidate's stronger original identity."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
    lower = RESUME_DIFF_RULES.lower()
    assert "pivot role" in lower
    assert "candidate's engineering perspective" in lower
    assert "mention at most one jd-specific domain/tool" in lower


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
    assert "broader adjacent framing" in lower
    assert "do not add new named vendor products" in lower
    assert "do not borrow jd vocabulary" in lower


def test_resume_diff_rules_remove_keyword_weave_and_vendor_substitution_paths() -> None:
    """Prompt rules should block global keyword stuffing and obvious tool swaps."""
    from app.prompts._rules.resume_diff import RESUME_DIFF_RULES

    lower = RESUME_DIFF_RULES.lower()
    assert "weave keywords throughout" not in lower
    assert "a keyword appearing once in the right context" in lower
    assert "do not substitute one vendor/ui/bi surface for another" in lower
    assert "if the source says streamlit, keep streamlit" in lower
    assert "never rename or extend the base title" in lower
    assert "data intern\" -> \"data analyst intern" in lower
    assert "never add jd-flavored parentheticals" in lower
    assert "every bullet must be grammatically complete" in lower


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


def test_contract_to_prompt_dict_omits_duplicate_mode_rules() -> None:
    """Prompt prose lives in .txt files; contract JSON carries only machine shape."""
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    d = rc.to_prompt_dict()
    assert "rules" not in d


def test_contract_to_prompt_dict_omits_duplicate_index_mapping() -> None:
    """Index-mapping prose lives in resume_diff_output.txt."""
    payload = TailoringResumePayload()
    rc = build_response_contract(payload, prompt_id="full")
    d = rc.to_prompt_dict()
    assert "index_note" not in d
