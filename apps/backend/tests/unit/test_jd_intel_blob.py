"""Tests for dynamic JD intel blob helpers and template dot-path injection."""

import json

from app.prompts._prompt_loader import render_user_template
from app.services.tailoring.jd_intel_blob import (
    collect_keyword_strings_from_blob,
    deep_get,
    filter_resume_keyword_sources,
    jd_intel_to_prompt_json,
    substitute_jd_intel_placeholders,
)


def test_deep_get() -> None:
    blob = {"requirements": {"years_min": 3}}
    assert deep_get(blob, "requirements.years_min") == 3
    assert deep_get(blob, "requirements.missing") is None


def test_collect_keyword_strings_from_lists() -> None:
    blob = {
        "a": [{"x": [["nested_list_skipped"]]}],
        "skills": ["Python", "python", "Go"],
    }
    out = collect_keyword_strings_from_blob(blob)
    assert set(out) == {"nested_list_skipped", "Python", "Go"}


def test_jd_intel_to_prompt_json_strips_empty() -> None:
    blob = {"role": {"title": "SWE"}, "empty": {}, "nil": None}
    s = jd_intel_to_prompt_json(blob)
    assert json.loads(s) == {"role": {"title": "SWE"}}


def test_substitute_whole_blob_and_paths() -> None:
    blob = {"requirements": {"years_min": 2}, "role": {"title": "Eng"}}
    t = "FULL:$extract_jd_intel_output PATH:$extract_jd_intel_output.requirements.years_min TITLE:$extract_jd_intel_output.role.title"
    out = substitute_jd_intel_placeholders(t, blob)
    assert "FULL:" in out and "PATH:" in out and "TITLE:" in out
    assert "Eng" in out
    assert out.count("2") >= 1


def test_render_user_template_with_jd_blob() -> None:
    text = render_user_template(
        'JD=$extract_jd_intel_output.role.title END',
        jd_intel_blob={"role": {"title": "Backend"}},
    )
    assert text == 'JD="Backend" END'


def test_render_user_template_jd_blob_currency_survives_template_substitute() -> None:
    """JD JSON must not break render_user_template when values contain $ (e.g. salary ranges)."""
    text = render_user_template(
        'JD=$extract_jd_intel_output.compensation MORE=$original_resume',
        jd_intel_blob={"compensation": {"note": "$50k-$80k OTE"}},
        original_resume="{}",
    )
    assert "$50k-$80k" in text
    assert " MORE=" in text


def test_render_user_template_parses_extract_kwarg_as_blob() -> None:
    text = render_user_template(
        'X=$extract_jd_intel_output.requirements.years_min',
        extract_jd_intel_output='{"requirements":{"years_min":5}}',
    )
    assert "5" in text


def test_extract_jd_intel_user_template_still_has_schema_marker() -> None:
    from app.prompts.extract_jd_intel import USER_TEMPLATE

    assert '"role"' in USER_TEMPLATE
    assert "$job_description" in USER_TEMPLATE


def test_extract_jd_intel_refines_resume_technical_keywords_for_bolding() -> None:
    from app.prompts.extract_jd_intel import USER_TEMPLATE

    lower = USER_TEMPLATE.lower()
    assert "1-3 word" in lower
    assert "bold_keywords" in lower
    assert "tools, languages, platforms" in lower
    assert "exclude responsibility phrases" in lower


def test_filter_resume_keyword_sources_removes_basic_tools() -> None:
    blob = {
        "resume_technical_keywords": ["SAP", "Excel", "Power BI", "Jira", "Teams"],
        "resume_bold_keyword_sources": [
            "Excel",
            "SAP",
            "Power BI",
            "Microsoft Office",
            "Confluence",
            "Notion",
        ],
    }

    filter_resume_keyword_sources(blob)

    assert blob["resume_technical_keywords"] == ["SAP", "Power BI"]
    assert blob["resume_bold_keyword_sources"] == ["SAP", "Power BI"]
