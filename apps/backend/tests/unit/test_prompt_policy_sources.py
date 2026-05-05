"""Tests that prompt-facing tailoring policy stays in existing prompt files."""

from pathlib import Path


def test_runtime_policy_is_derived_from_existing_prompt_files() -> None:
    from app.prompts.prompt_policy import (
        low_signal_bold_keywords,
        generic_project_labels,
        resume_basic_terms,
    )

    assert "excel" in resume_basic_terms()
    assert "miro" in resume_basic_terms()
    assert "workflow visualization" in low_signal_bold_keywords()
    assert "compliance workflow" in generic_project_labels()


def test_no_extra_tailoring_policy_prompt_fragment_directory() -> None:
    root = Path(__file__).resolve().parents[2]
    assert not (root / "app/prompts/text/tailoring_policy").exists()


def test_supporting_python_files_do_not_embed_prompt_policy_text() -> None:
    root = Path(__file__).resolve().parents[2]
    files = [
        root / "app/services/tailoring/contracts.py",
        root / "app/services/tailoring/prompting.py",
        root / "app/services/tailoring/jd_intel_blob.py",
        root / "app/services/tailoring/models.py",
        root / "app/services/tailoring/validation.py",
        root / "app/rendering/rendercv_adapter.py",
    ]
    forbidden_snippets = [
        "Return raw valid JSON only",
        "Keep summaries render-fit",
        "Keep the original resume as the superset",
        "experience and projects keys are stringified 0-based integers",
        '"excel"',
        '"workflow visualization"',
    ]

    for path in files:
        source = path.read_text(encoding="utf-8")
        for snippet in forbidden_snippets:
            assert snippet not in source, f"{snippet!r} should live in prompts/text, not {path}"
