"""Tests for TailoringResponseContract prompt-facing output."""

import pytest

from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import TailoringResumePayload, TailoringExperience


def _make_payload_with_experience() -> TailoringResumePayload:
    """Return a payload with two work entries for contract testing."""
    return TailoringResumePayload(
        summary="Engineer.",
        workExperience=[
            TailoringExperience(
                position="Software Engineer",
                company="Acme",
                description=["Bullet one", "Bullet two", "Bullet three"],
            ),
            TailoringExperience(
                position="Intern",
                company="StartupCo",
                description=["Did X", "Did Y"],
            ),
        ],
    )


class TestResponseContractPromptDict:
    def test_mode_rules_visible_to_llm(self):
        """mode_rules must appear in to_prompt_dict() so the LLM sees constraints."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "rules" in d, "mode_rules must be exposed via 'rules' key"
        assert isinstance(d["rules"], list) and len(d["rules"]) > 0

    def test_full_mode_rule_forbids_bullet_add(self):
        """Full mode rule must say rewrite-only (not 'add at most one')."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        rules_text = " ".join(d.get("rules", [])).lower()
        assert "add" not in rules_text or "do not add" in rules_text, (
            "Full mode rule must forbid bullet addition. "
            "apply_compact_diff() already silently drops out-of-range indexes, "
            "so prompts and contract must agree: rewrite existing bullets only."
        )

    def test_lite_mode_rule_also_forbids_add(self):
        """Lite mode rule must also say rewrite-only."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="lite")
        d = rc.to_prompt_dict()
        rules_text = " ".join(d.get("rules", [])).lower()
        assert "rewrite existing" in rules_text or "do not add" in rules_text

    def test_bullet_counts_per_entry_visible(self):
        """bullet_counts must be present so LLM knows valid index ranges."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "experience" in d
        assert "bullet_counts" in d["experience"]
        assert d["experience"]["bullet_counts"] == [3, 2]

    def test_index_mapping_note_present(self):
        """to_prompt_dict must explain that output keys are 0-based integers."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        has_note = (
            "index_note" in d
            or "index_mapping" in d
            or any("0-based" in str(v) or "contract order" in str(v) for v in d.values())
        )
        assert has_note, (
            "to_prompt_dict() must document that experience/projects keys are "
            "0-based integer strings matching response_contract entry order"
        )

    def test_locked_fields_visible(self):
        """Locked (immutable) fields must be communicated in the diff rules."""
        from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
        locked_terms = ["locked", "LOCKED", "immutable", "do not emit"]
        assert any(term in RESUME_DIFF_RULES for term in locked_terms), (
            "resume_diff_output.txt must list fields the LLM must not emit "
            "(company, location, dates, id, github, website)"
        )

    def test_empty_payload_still_exposes_rules(self):
        """Rules must appear even when no experience/project entries are present."""
        payload = TailoringResumePayload()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "rules" in d and len(d["rules"]) > 0
