"""Validate shipped user templates: $ placeholders for pipeline steps; str.format for enrichment."""

from __future__ import annotations

from string import Template

import pytest

from app.prompts import VALID_STEPS, get_prompt
from app.prompts.enrichment import (
    ANALYZE_RESUME_PROMPT,
    ENHANCE_DESCRIPTION_PROMPT,
    REGENERATE_ADDITIONAL_GROUP_PROMPT,
    REGENERATE_ITEM_PROMPT,
)


@pytest.mark.parametrize("step_name", sorted(VALID_STEPS))
def test_step_user_template_placeholders_match_variables(step_name: str) -> None:
    mod = get_prompt(step_name)
    template = str(getattr(mod, "USER_TEMPLATE", getattr(mod, "DATA_TEMPLATE", "")))
    if not template.strip():
        return
    keys = frozenset(Template(template).get_identifiers())
    raw_vars = getattr(mod, "VARIABLES", None)
    assert isinstance(raw_vars, dict), f"{step_name}: VARIABLES must be a dict"
    allowed = frozenset(raw_vars.keys())
    assert keys <= allowed, f"{step_name}: unknown $ placeholders {sorted(keys - allowed)}"


def test_enrichment_analyze_format_roundtrip() -> None:
    out = ANALYZE_RESUME_PROMPT.format(resume_json="{}")
    assert "English" in out
    assert "{resume_json}" not in out
    assert '"items_to_enrich"' in out or "items_to_enrich" in out


def test_enrichment_enhance_format_roundtrip() -> None:
    out = ENHANCE_DESCRIPTION_PROMPT.format(
        item_type="experience",
        title="Eng",
        subtitle="Co",
        current_description="[]",
        answers="{}",
    )
    assert "English" in out
    assert "{answers}" not in out


def test_enrichment_regenerate_item_format_roundtrip() -> None:
    out = REGENERATE_ITEM_PROMPT.format(
        item_type="experience",
        title="Eng",
        subtitle="Co",
        current_description="[]",
        user_instruction="more metrics",
    )
    assert "more metrics" in out


def test_enrichment_regenerate_group_format_roundtrip() -> None:
    out = REGENERATE_ADDITIONAL_GROUP_PROMPT.format(
        group_label="Skills",
        current_values="[]",
        user_instruction="reorder",
    )
    assert "Skills" in out
    assert "reorder" in out
