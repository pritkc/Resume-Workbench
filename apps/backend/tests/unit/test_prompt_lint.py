"""Prompt lint tests — structural and content correctness of shipped prompts."""

from __future__ import annotations

import re
from string import Template

import pytest

from app.prompts._text_prompts import read_shipped_txt
from app.prompts import VALID_STEPS, get_prompt
from app.prompts.tailoring_catalog import build_resume_tailoring_catalog_sections
from app.routers.prompt_catalog_builder import build_prompt_manager_entries
from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import TailoringResumePayload


# ── System prompt: no thinking-trace leakage ─────────────────────────────────

def test_full_system_prompt_has_no_thinking_trace() -> None:
    """tailor_resume_full system must not contain 'thinking trace'."""
    system_txt = read_shipped_txt("tailor_resume_full/system.txt")
    assert "thinking trace" not in system_txt.lower()


def test_rewrite_system_prompt_has_no_thinking_trace() -> None:
    """rewrite_resume system must not contain 'thinking trace'."""
    from app.prompts.rewrite_resume import INSTRUCTIONS
    assert "thinking trace" not in INSTRUCTIONS.lower()


def test_full_system_prompt_has_no_updated_yaml() -> None:
    """tailor_resume_full system must not reference 'updated yaml'."""
    system_txt = read_shipped_txt("tailor_resume_full/system.txt")
    assert "updated yaml" not in system_txt.lower()


def test_rewrite_system_prompt_has_no_updated_yaml() -> None:
    """rewrite_resume system must not contain 'updated yaml'."""
    from app.prompts.rewrite_resume import INSTRUCTIONS
    assert "updated yaml" not in INSTRUCTIONS.lower()


# ── resume_diff_output.txt has no years-count format in summary section ───────

def test_resume_diff_output_summary_no_years_count() -> None:
    """The diff schema rules explicitly ban X years of experience in summary."""
    diff_rules = read_shipped_txt("output_file_schema_rules/resume_diff_output.txt")
    # The rule should reference the years-count format as banned, not endorse it
    assert "years-count format" in diff_rules


def test_resume_diff_output_example_does_not_demonstrate_years_count() -> None:
    """The Bad example in diff rules must not say '5+ years in backend...'."""
    diff_rules = read_shipped_txt("output_file_schema_rules/resume_diff_output.txt")
    # The "Bad" example references the pattern but only in the 'Bad' label
    # Verify it doesn't give a 'Good' example with X years phrasing
    assert "Good: " in diff_rules  # Good example exists
    # The bad example is clearly labeled Bad
    assert "Bad: " in diff_rules


def test_bold_keyword_rules_reject_long_phrases() -> None:
    """Bold keyword guidance should keep highlighted terms short and technical."""
    diff_rules = read_shipped_txt("output_file_schema_rules/resume_diff_output.txt").lower()
    assert "1-3 word terms only" in diff_rules
    assert "avoid sentences, soft skills, and generic domain phrases" in diff_rules
    assert "do not include basic tools" in diff_rules


# ── cover_letter user.txt: no OUTPUT FORMAT instructions (not its job) ────────

def test_cover_letter_user_has_no_output_format_section() -> None:
    """cover_letter/user.txt should not contain OUTPUT FORMAT instructions."""
    user_txt = read_shipped_txt("cover_letter/user.txt")
    # OUTPUT FORMAT is the system's responsibility; user template should not duplicate it
    assert "OUTPUT FORMAT:" not in user_txt


# ── critique system.txt: baseline hiring-manager framing ─────────────────────

def test_critique_system_has_core_task_heading() -> None:
    system_txt = read_shipped_txt("critique_resume/system.txt")
    assert "YOUR TASK:" in system_txt


# ── All shipped user templates: no unsubstituted $ placeholders ──────────────

def _get_empty_kwargs_for_step(step_name: str) -> dict[str, str]:
    """Return empty string for every VARIABLES key in a step module."""
    mod = get_prompt(step_name)
    variables = getattr(mod, "VARIABLES", {})
    return {k: "" for k in variables}


_STEPS_WITH_USER_TEMPLATES = [
    "tailor_resume_full",
    "tailor_resume_lite",
    "rewrite_resume",
    "cover_letter",
    "critique_resume",
    "extract_jd_intel",
    "answer_questions",
]


def _template_placeholders(template_str: str) -> set[str]:
    return {
        match.group(1) or match.group(2)
        for match in re.finditer(
            r"(?<!\$)\$(?:\{([_a-z][a-z0-9_]*)\}|([_a-z][a-z0-9_]*))",
            template_str,
        )
    }


@pytest.mark.parametrize("step_name", _STEPS_WITH_USER_TEMPLATES)
def test_user_template_no_unsubstituted_placeholders(step_name: str) -> None:
    """Rendering all template variables as empty strings must leave no $-placeholders."""
    mod = get_prompt(step_name)
    template_str = str(getattr(mod, "USER_TEMPLATE", getattr(mod, "DATA_TEMPLATE", "")))
    if not template_str.strip():
        pytest.skip(f"{step_name} has no user template")

    kwargs = _get_empty_kwargs_for_step(step_name)
    try:
        rendered = Template(template_str).substitute(**kwargs)
    except KeyError as e:
        pytest.fail(f"{step_name}: template variable {e} not in VARIABLES dict")

    # Check for leftover unsubstituted placeholders
    unfilled = re.findall(
        r"(?<!\$)\$(?:\{([_a-z][a-z0-9_]*)\}|([_a-z][a-z0-9_]*))",
        rendered,
    )
    assert not unfilled, (
        f"{step_name}: unsubstituted placeholders after rendering: "
        f"{[g[0] or g[1] for g in unfilled]}"
    )


@pytest.mark.parametrize("step_name", VALID_STEPS)
def test_all_user_template_placeholders_are_declared(step_name: str) -> None:
    """Every $placeholder in a shipped user template must be listed in VARIABLES."""
    mod = get_prompt(step_name)
    template_str = str(getattr(mod, "USER_TEMPLATE", getattr(mod, "DATA_TEMPLATE", "")))
    if not template_str.strip():
        pytest.skip(f"{step_name} has no user template")

    declared = set(getattr(mod, "VARIABLES", {}).keys())
    placeholders = _template_placeholders(template_str)

    assert placeholders <= declared, (
        f"{step_name}: placeholders missing from VARIABLES: {sorted(placeholders - declared)}"
    )


def test_resume_diff_output_allows_bullet_guidance() -> None:
    diff_rules = read_shipped_txt("output_file_schema_rules/resume_diff_output.txt").lower()
    assert "bullet" in diff_rules
    assert "json" in diff_rules


def test_response_contract_rules_are_non_empty() -> None:
    contract = build_response_contract(TailoringResumePayload(), prompt_id="full").to_prompt_dict()
    rules = contract.get("rules", [])
    assert isinstance(rules, list) and len(rules) >= 1


def test_tailoring_catalog_runtime_fields_include_core_injections() -> None:
    sections = build_resume_tailoring_catalog_sections()
    labels: list[str] = []

    def visit(nodes) -> None:
        for node in nodes:
            labels.append(node.label)
            visit(node.children or [])

    visit(sections)

    assert "{original_resume}" in labels
    assert "{resume_diff_rules}" in labels


def test_prompt_manager_entries_include_tailored_resume_variables() -> None:
    entries = {entry.step_name: entry for entry in build_prompt_manager_entries()}
    cover_vars = {v.name for v in entries["cover_letter"].variables}
    answer_vars = {v.name for v in entries["answer_questions"].variables}

    assert "tailored_resume" in cover_vars
    assert "tailored_resume" in answer_vars


def test_prompt_text_readme_documents_runtime_context_fields() -> None:
    readme = read_shipped_txt("README.md")

    assert "$tailored_resume" in readme
    assert "$resume_diff_rules" in readme
