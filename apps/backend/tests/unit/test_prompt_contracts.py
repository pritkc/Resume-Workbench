"""Tests for TailoringResponseContract prompt-facing output."""

from app.schemas.models import SkillGroup, SkillsSection
from app.services.tailoring.contracts import build_response_contract
from app.services.tailoring.models import (
    TailoringExperience,
    TailoringProject,
    TailoringResumePayload,
)


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
        personalProjects=[
            TailoringProject(name="Dashboard", description=["Built UI"]),
        ],
    )


class TestResponseContractPromptDict:
    def test_prompt_dict_does_not_duplicate_prompt_rules(self):
        """Prompt instructions live in .txt prompt files, not response-contract metadata."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "rules" not in d
        assert "index_note" not in d

    def test_bullet_counts_per_entry_visible(self):
        """bullet_counts must be present so LLM knows valid index ranges."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "experience" in d
        assert "bullet_counts" in d["experience"]
        assert d["experience"]["bullet_counts"] == [3, 2]

    def test_full_mode_budget_fields_visible(self):
        """Full mode exposes edit budgets so validators and prompts share constraints."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert d["experience"]["direct_jd_bullet_budget"] == [2, 1]
        assert d["experience"]["preserve_story_min"] == [1, 1]
        assert d["projects"]["max_changed_entries"] == 2
        assert d["projects"]["rename_allowed"] is False

    def test_two_bullet_roles_have_one_direct_jd_bullet_budget(self):
        """Short roles must not become 100% JD rewrites."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        assert rc.direct_jd_bullet_budget == [2, 1]

    def test_index_mapping_note_lives_in_diff_rules(self):
        """The existing output_diff prompt owns index mapping prose."""
        from app.prompts._rules.resume_diff import RESUME_DIFF_RULES

        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "index_note" not in d
        assert "0-based" in RESUME_DIFF_RULES

    def test_locked_fields_visible(self):
        """Locked (immutable) fields must be communicated in the diff rules."""
        from app.prompts._rules.resume_diff import RESUME_DIFF_RULES
        locked_terms = ["locked", "LOCKED", "immutable", "do not emit"]
        assert any(term in RESUME_DIFF_RULES for term in locked_terms), (
            "resume_diff_output.txt must list fields the LLM must not emit "
            "(company, location, dates, id, github, website)"
        )

    def test_prompt_dict_omits_resume_duplicate_fields(self):
        """tech_stacks, titles, and company names belong on the resume only — omit from contract JSON."""
        payload = _make_payload_with_experience()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert "experience" in d
        assert "tech_stacks" not in d["experience"]
        assert "positions" not in d["experience"]
        assert "entries" not in d["experience"]
        assert "entries" not in d.get("projects", {})
        assert d["experience"]["bullet_counts"] == [3, 2]

    def test_empty_payload_still_exposes_shape_without_prompt_rules(self):
        """Empty contracts still provide machine shape, not duplicated prose."""
        payload = TailoringResumePayload()
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        assert d["output_keys"] == ["summary", "experience", "projects", "skills", "bold_keywords"]
        assert "rules" not in d

    def test_prompt_dict_skills_uses_counts_only_ordering_not_group_ids(self) -> None:
        payload = TailoringResumePayload(
            summary="Engineer.",
            skills=SkillsSection(
                groups=[
                    SkillGroup(id="languages", label="Languages", values=["Python"]),
                    SkillGroup(id="tools", label="Tools", values=["Docker", "Compose"]),
                ]
            ),
            workExperience=[
                TailoringExperience(
                    position="Engineer",
                    company="Acme",
                    description=["Shipped APIs"],
                ),
            ],
            personalProjects=[],
        )
        rc = build_response_contract(payload, prompt_id="full")
        d = rc.to_prompt_dict()
        expected_counts = [len(g.values) for g in payload.skills.groups]
        assert "skills" in d
        assert "group_ids" not in d["skills"]
        assert len(rc.skill_group_ids) == len(payload.skills.groups)
        assert d["skills"]["value_counts"] == expected_counts
