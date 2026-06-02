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
    assert "Senior software hiring manager" in assembled


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
        output_template="=== PROJECT 0 ===\nSTACK: [RETAIN]",
    )
    assert "JD INTELLIGENCE:" in text
    assert "MODE:" not in text
    assert "$extract_jd_intel_output" not in text
    assert "OUTPUT TEMPLATE:" in text
    assert "Return plain section-header text only" in text
    assert "CONTENT RULES:" in text
    assert "CLAIM CALIBRATION:" in text


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
        "OPERATING ORDER"
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
    validate_prompt_canaries(ctx.user_prompt, ("HOOKS/THEMES",))
    assert "translation candidates, not resume copy or mandatory insertions" in ctx.user_prompt


def test_tailoring_resume_to_llm_prompt_education_and_skills_without_group_ids(
    sample_resume: dict,
) -> None:
    payload = TailoringResumePayload.from_resume_data(sample_resume)
    assert payload is not None
    d = payload.to_llm_prompt_dict()
    assert "education" in d
    assert d["education"][0].get("institution") == "MIT"
    assert d["education"][0].get("degree") == "B.S. Computer Science"
    assert d["education"][0].get("end_date") == "2018"
    assert d["education"][0].get("detail") == "Graduated with honors, Dean's List"
    assert "id" not in d["education"][0]
    assert "summary" not in d["education"][0]
    assert "description" not in d["education"][0]
    assert "start_date" not in d["education"][0]
    assert "groups" in d["skills"]
    assert all("id" not in g for g in d["skills"]["groups"])
    exp0 = d["workExperience"][0]
    assert exp0.get("company") == "Acme Corp"
    assert exp0.get("period") == "Jan 2021 - Present"
    assert "id" not in exp0
    assert "title" not in exp0
    assert "location" not in exp0
    assert "date" not in exp0 and "years" not in exp0
    assert "start_date" not in exp0 and "end_date" not in exp0
    proj0 = d["personalProjects"][0]
    assert "date" not in proj0 and "years" not in proj0
    assert "id" not in proj0
    assert "github" not in proj0 and "website" not in proj0
    assert "role" not in proj0
    assert "project_period" not in proj0


def test_tailoring_resume_prompt_compacts_duplicate_project_role_and_split_skills() -> None:
    payload = TailoringResumePayload.from_resume_data(
        {
            "summary": "Data platform engineer.",
            "workExperience": [
                {
                    "id": 1,
                    "position": "Software Engineer",
                    "title": "Software Engineer",
                    "company": "Humana",
                    "location": "Remote",
                    "start_date": "2025-05",
                    "end_date": "present",
                    "techStack": "Python, FastAPI",
                    "description": ["Built claims pipelines."],
                }
            ],
            "personalProjects": [
                {
                    "id": 1,
                    "name": "ClaimSight",
                    "techStack": "Python, FastAPI, OpenAI API",
                    "role": "Python, FastAPI, OpenAI API",
                    "github": "https://github.com/example/claimsight",
                    "website": "https://claimsight.example",
                    "description": ["Classified prior authorization documents."],
                }
            ],
            "education": [
                {
                    "institution": "San Diego State University",
                    "area": "Big Data Analytics",
                    "degree": "Master of Science",
                    "start_date": "2023-08",
                    "end_date": "2025-05",
                    "summary": "GPA: 3.78",
                    "description": "GPA: 3.78",
                }
            ],
            "skills": {
                "groups": [
                    {
                        "label": "Cloud & DevOps",
                        "values": ["AWS (Lambda", "S3", "RDS)", "Docker"],
                    }
                ]
            },
        }
    )
    assert payload is not None

    d = payload.to_llm_prompt_dict()

    assert d["workExperience"][0] == {
        "position": "Software Engineer",
        "company": "Humana",
        "period": "2025-05 - present",
        "tech_stacks": "Python, FastAPI",
        "description": ["Built claims pipelines."],
    }
    assert d["personalProjects"][0] == {
        "name": "ClaimSight",
        "tech_stacks": "Python, FastAPI, OpenAI API",
        "description": ["Classified prior authorization documents."],
    }
    assert d["education"][0] == {
        "institution": "San Diego State University",
        "degree": "Master of Science",
        "area": "Big Data Analytics",
        "end_date": "2025-05",
        "detail": "GPA: 3.78",
    }
    assert d["skills"]["groups"][0]["values"] == [
        "AWS (Lambda, S3, RDS)",
        "Docker",
    ]


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
    assert "Senior software hiring manager" in system


def test_section_output_template_in_user_prompt() -> None:
    """$output_template must be rendered into the user message."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
        output_template="=== SUMMARY ===\n[summary]",
    )
    assert "OUTPUT TEMPLATE:" in user
    assert "=== SUMMARY ===" in user
    assert "Do not return JSON" in user
    assert "$resume_diff_rules" not in user, "Template placeholder must be substituted"
    assert "$output_template" not in user, "Template placeholder must be substituted"


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
    """Section output should preserve existing indexes only."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "preserve listed indexes only" in user
    assert "skill positions" in user


def test_section_output_template_is_compact_and_omits_resume_facts() -> None:
    contract = TailoringResponseContract(
        prompt_mode="full",
        experience_entries=["Acme Corp", "StartupCo"],
        experience_positions=["Senior Backend Engineer", "Software Engineer"],
        experience_tech_stacks=["Python, FastAPI", "Java, Spring"],
        experience_bullet_counts=[3, 2],
        direct_jd_bullet_budget=[2, 1],
        preserve_story_min=[1, 1],
        project_entries=["OpenAPI Generator"],
        project_bullet_counts=[1],
        project_tech_stacks=["Python, Click"],
        skill_group_value_counts=[4, 6],
    )

    template = contract.to_section_template()

    assert "Required:" in template
    assert "=== SUMMARY ===" in template
    assert "WHY:" in template
    assert "=== BOLD KEYWORDS ===" in template
    assert "Editable addresses:" in template
    assert "EXPERIENCE: 0=B0-B2 budget 2/3 keep>=1; 1=B0-B1 budget 1/2 keep>=1" in template
    assert "PROJECT: 0=B0" in template
    assert "SKILLS: G0=4 values; G1=6 values" in template
    assert "Acme Corp" not in template
    assert "Senior Backend Engineer" not in template
    assert "Python, FastAPI" not in template
    assert "OpenAPI Generator" not in template
    assert "B0: [[RETAIN] or rewrite]" not in template
    assert "G0-WHY" not in template
    assert "max 12 words" not in template
    assert "Budget: max" not in template


def test_section_output_rules_forbid_mixed_retain_in_scalar_cells() -> None:
    for mode in ("full", "lite"):
        user = render_tailoring_user_prompt(
            mode_id=mode,
            jd_intel_blob={},
            original_resume_json="{}",
            response_contract_json="{}",
        )
        lower = user.lower()

        assert "for scalar cells (position, stack, name, b#)" in lower
        assert "[retain] must be the entire value or absent" in lower
        assert "never mix [retain] with added text" in lower
        assert "for comma-separated scalar cells like stack" in lower
        assert "for skills, output every g# group" in lower


def test_resume_diff_rules_prefer_broader_profile_over_jd_copy() -> None:
    """Tailoring should translate the JD into a broader credible candidate profile."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "jd as a lens, not a new identity" in lower
    assert "translation candidates, not resume copy or mandatory insertions" in lower
    assert "do not rebuild every section around the posting" in lower
    assert "follow each row's budget" in lower
    assert "preserve impressive superset skills" in lower


def test_resume_diff_rules_keep_bold_keywords_compact() -> None:
    """Bold keywords should be short technical ATS terms, not long phrases."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "6-10 comma-separated ats terms" in user
    assert "tools, languages, platforms, methods only" in user


def test_resume_diff_rules_allows_plausible_new_claims() -> None:
    """Full generation can add plausible stronger claims the user can prove later."""
    lower = assemble_tailoring_system_prompt("full").lower()
    assert "claim policy" in lower
    assert "interview-defensible" in lower
    assert "source evidence" in lower


def test_resume_diff_rules_lock_project_count_and_limit_tool_promotion() -> None:
    """Project count and tool specificity should not drift from the source resume."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "keep names, source bullet count, and project shape stable" in lower
    assert "keep names stable" in lower
    assert "preserve listed indexes only" in lower


def test_resume_diff_rules_apply_bans_globally_and_keep_skills_specific() -> None:
    """Jargon bans apply everywhere, and skills should not become prose phrases."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "avoid: demote generic or low-signal wording" in lower
    assert "preserve impressive superset skills" in lower
    assert "never keyword-stuff" in lower


def test_resume_diff_rules_forbid_markdown_fences() -> None:
    """LLM output must be raw section text so local parsers do not receive markdown fences."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "no markdown fences" in lower
    assert "no json" in lower


def test_section_tailoring_restores_original_content_rules_without_json_contract() -> None:
    """Primary tailoring should carry old writing policy while keeping section-header syntax."""
    full = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lite = render_tailoring_user_prompt(
        mode_id="lite",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    for rendered in (full, lite):
        lower = rendered.lower()
        assert "content rules:" in lower
        assert "the source resume is the candidate superset" in lower
        assert "never keyword-stuff" in lower
        assert "tech_stacks values contain only named tools" in lower
        assert "values must be specific tools" in lower
        assert "one idea per bullet" in lower
        assert "claim calibration:" in lower
        assert "do not claim org-wide architecture" in lower
        assert "inflated openers as primary verbs" in lower
        assert "impossible wins unsupported by source evidence" in lower
        assert "return valid json only" not in lower
        assert "tailored cell:" not in lower
        assert "full envelope:" not in lower
        assert "shapes:" not in lower


def test_full_prompt_preserves_project_bullet_count_and_stacks() -> None:
    """Full tailoring should not collapse projects or omit stack lines from changed entries."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
        output_template="=== PROJECT 0 ===\nSTACK: [RETAIN]",
    )
    lower = user.lower()
    assert "keep names, source bullet count, and project shape stable" in lower
    assert "stack:" in lower


def test_full_prompt_retains_closest_two_projects_and_superset_skills() -> None:
    """Temporary full-run needs: closest projects stay stable and skills stay broader than the JD."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "projects: edit at most the closest two" in lower
    assert "preserve impressive superset skills" in lower
    assert "do not copy jd titles or secondary role labels" in lower
    assert "when in doubt, keep the existing qualifier or omit" in lower
    assert "follow each row's budget" in lower
    assert "[retain]" in lower
    assert "translation candidates, not resume copy or mandatory insertions" in lower
    assert "career story" in lower
    assert "recognizable original story" in lower


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
    assert "hooks/themes" in lower
    assert "competency hooks and translation candidates" in lower
    assert "ats visibility only" in lower
    assert "do not rebuild every section around the posting" in lower


def test_full_prompt_splits_experience_sparse_diffs_from_project_shape() -> None:
    """Section output may omit retained sections while edited projects preserve bullet shape."""
    user = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    )
    lower = user.lower()
    assert "for roles with 2 or fewer bullets, touch at most one" in lower
    assert "omit a whole experience or project section" in lower
    assert "keep names, source bullet count, and project shape stable" in lower


def test_jd_extractor_prompts_use_neutral_hooks_not_mirror_language() -> None:
    """Extractor output should feed translation, not repeated JD phrasing."""
    from app.prompts.extract_jd_intel import INSTRUCTIONS, USER_TEMPLATE

    lower = USER_TEMPLATE.lower()
    assert "neutral competency hooks" in lower
    assert "coverage checklist, not prose to reuse" in lower
    assert "terms to mirror" not in lower
    assert "not mandatory mirror phrases" in lower
    assert "context:" in lower
    assert "targeting:" in lower
    assert "high-confidence company, product, customer, or industry context" in lower
    assert "use jd evidence only" not in lower
    assert "do not output null, [], markdown, or extra labels" in lower
    assert "do not infer unstated facts" not in INSTRUCTIONS.lower()


def test_resume_diff_rules_handles_pivot_roles_from_candidate_identity() -> None:
    """Pivot-role summaries should preserve the candidate's stronger original identity."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "preserving source identity" in lower
    assert "use the jd as a lens, not a new identity" in lower


def test_full_system_prompt_aligns_titles_to_target_domain() -> None:
    """Title qualifiers should move toward the JD domain instead of generic AI/backend labels."""
    system = assemble_tailoring_system_prompt("full")
    lower = system.lower()
    assert "scope/platform/domain qualifiers" in lower
    assert "generic labels" in lower


def test_full_system_prompt_uses_broader_competencies_and_plausible_claims() -> None:
    """System prompt should ask for translation beyond exact JD language."""
    system = assemble_tailoring_system_prompt("full")
    lower = system.lower()
    assert "candidate's original narrative" in lower
    assert "translate jd language" in lower
    assert "new named tools, vendors, platforms" in lower


def test_resume_diff_rules_remove_keyword_weave_and_vendor_substitution_paths() -> None:
    """Prompt rules should block global keyword stuffing and obvious tool swaps."""
    lower = render_tailoring_user_prompt(
        mode_id="full",
        jd_intel_blob={},
        original_resume_json="{}",
        response_contract_json="{}",
    ).lower()
    assert "never keyword-stuff" in lower
    assert "do not copy jd titles" in lower
    assert "keep names stable" in lower
    assert "do not rebuild every section around the posting" in lower


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
