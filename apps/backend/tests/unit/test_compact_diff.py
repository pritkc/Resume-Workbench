"""Unit tests for apply_compact_diff and related helpers in preservation.py."""

import pytest

from app.services.tailoring.preservation import (
    _all_skill_values,
    _strip_invented_skills,
    apply_compact_diff,
)


@pytest.fixture
def base_resume():
    return {
        "summary": "Backend engineer with 5 years experience.",
        "workExperience": [
            {
                "id": 1,
                "title": "Senior Engineer",
                "company": "Acme Corp",
                "location": "SF",
                "years": "2021 - Present",
                "description": [
                    "Built REST APIs in Python",
                    "Led migration to microservices",
                    "Mentored junior engineers",
                ],
            },
            {
                "id": 2,
                "title": "Engineer",
                "company": "Startup",
                "location": "NY",
                "years": "2019 - 2021",
                "description": [
                    "Developed payment systems",
                    "Wrote integration tests",
                ],
            },
        ],
        "personalProjects": [
            {
                "id": 1,
                "name": "LogLens",
                "summary": "Creator",
                "role": "Creator",
                "years": "2023 - Present",
                "description": [
                    "CLI for log analysis",
                    "280 GitHub stars",
                ],
            },
        ],
        "skills": {
            "groups": [
                {"label": "Languages", "values": ["Python", "SQL", "Bash"]},
                {"label": "Tools", "values": ["Docker", "GitHub Actions"]},
            ]
        },
        "customSections": {},
        "personalInfo": {"name": "Jane", "email": "jane@example.com", "location": "SF"},
    }


class TestApplyCompactDiff:
    def test_summary_rewritten(self, base_resume):
        diff = {"summary": "5+ years in Python backend, specialising in APIs."}
        result = apply_compact_diff(base_resume, diff)
        assert result["summary"] == "5+ years in Python backend, specialising in APIs."

    def test_empty_summary_not_applied(self, base_resume):
        diff = {"summary": ""}
        result = apply_compact_diff(base_resume, diff)
        assert result["summary"] == base_resume["summary"]

    def test_bullet_overwrite(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"0": "Designed high-throughput Python APIs"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][0] == "Designed high-throughput Python APIs"
        assert result["workExperience"][0]["description"][1] == "Led migration to microservices"
        assert result["workExperience"][0]["description"][2] == "Mentored junior engineers"

    def test_multiple_bullets_in_same_entry(self, base_resume):
        diff = {
            "experience": {
                "0": {"bullets": {"0": "Bullet A", "2": "Bullet C"}}
            }
        }
        result = apply_compact_diff(base_resume, diff)
        desc = result["workExperience"][0]["description"]
        assert desc[0] == "Bullet A"
        assert desc[1] == "Led migration to microservices"
        assert desc[2] == "Bullet C"

    def test_absent_entry_unchanged(self, base_resume):
        diff = {"experience": {"1": {"bullets": {"0": "New payment bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"] == base_resume["workExperience"][0]["description"]
        assert result["workExperience"][1]["description"][0] == "New payment bullet"
        assert result["workExperience"][1]["description"][1] == "Wrote integration tests"

    def test_out_of_range_entry_index_skipped(self, base_resume):
        diff = {"experience": {"9": {"bullets": {"0": "Should be skipped"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"] == base_resume["workExperience"]

    def test_out_of_range_bullet_index_skipped(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"5": "Appended bullet (forbidden)"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert len(result["workExperience"][0]["description"]) == 3

    def test_non_integer_entry_key_skipped(self, base_resume):
        diff = {"experience": {"Acme Corp": {"bullets": {"0": "should be skipped"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"] == base_resume["workExperience"]

    def test_non_integer_bullet_key_skipped(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"first": "should be skipped"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"] == base_resume["workExperience"][0]["description"]

    def test_empty_bullet_text_skipped(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"0": "", "1": "   "}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"] == base_resume["workExperience"][0]["description"]

    def test_project_tech_stacks_written(self, base_resume):
        diff = {"projects": {"0": {"tech_stacks": "Python, Click, observability"}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["personalProjects"][0]["summary"] == "Python, Click, observability"

    def test_project_tech_stacks_not_applied_to_experience(self, base_resume):
        diff = {"experience": {"0": {"tech_stacks": "should be ignored", "bullets": {"0": "Bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][0] == "Bullet"
        assert result["workExperience"][0].get("summary") is None

    def test_skills_regroup_applied(self, base_resume):
        new_skills = [
            {"label": "Backend", "values": ["Python", "SQL"]},
            {"label": "DevOps", "values": ["Docker", "GitHub Actions", "Bash"]},
        ]
        diff = {"skills": new_skills}
        result = apply_compact_diff(base_resume, diff)
        assert result["skills"]["groups"] == new_skills

    def test_skills_absent_key_unchanged(self, base_resume):
        diff = {"summary": "New summary."}
        result = apply_compact_diff(base_resume, diff)
        assert result["skills"] == base_resume["skills"]

    def test_invented_skills_stripped(self, base_resume):
        diff = {
            "skills": [
                {"label": "Languages", "values": ["Python", "SQL", "Kubernetes"]},
                {"label": "Tools", "values": ["Docker", "GitHub Actions"]},
            ]
        }
        result = apply_compact_diff(base_resume, diff)
        langs = next(g for g in result["skills"]["groups"] if g["label"] == "Languages")
        assert "Kubernetes" not in langs["values"]
        assert "Python" in langs["values"]

    def test_original_not_mutated(self, base_resume):
        import copy
        original_copy = copy.deepcopy(base_resume)
        diff = {"summary": "Changed.", "experience": {"0": {"bullets": {"0": "New"}}}}
        apply_compact_diff(base_resume, diff)
        assert base_resume["summary"] == original_copy["summary"]
        assert base_resume["workExperience"][0]["description"][0] == original_copy["workExperience"][0]["description"][0]

    def test_empty_diff_returns_original(self, base_resume):
        result = apply_compact_diff(base_resume, {})
        assert result["summary"] == base_resume["summary"]
        assert result["workExperience"] == base_resume["workExperience"]


class TestAllSkillValues:
    def test_extracts_all_values(self, base_resume):
        vals = _all_skill_values(base_resume)
        assert vals == {"Python", "SQL", "Bash", "Docker", "GitHub Actions"}

    def test_empty_skills(self):
        assert _all_skill_values({}) == set()

    def test_accepts_additional_key(self):
        resume = {"additional": {"groups": [{"label": "Tech", "values": ["Go", "Rust"]}]}}
        vals = _all_skill_values(resume)
        assert vals == {"Go", "Rust"}


class TestStripInventedSkills:
    def test_removes_invented_values(self):
        skills = [{"label": "Tech", "values": ["Python", "Kubernetes", "Docker"]}]
        allowed = {"Python", "Docker"}
        result = _strip_invented_skills(skills, allowed)
        assert result[0]["values"] == ["Python", "Docker"]

    def test_preserves_label(self):
        skills = [{"label": "My Label", "values": ["Python"]}]
        result = _strip_invented_skills(skills, {"Python"})
        assert result[0]["label"] == "My Label"

    def test_all_invented_gives_empty_values(self):
        skills = [{"label": "Tech", "values": ["Kubernetes"]}]
        result = _strip_invented_skills(skills, {"Python"})
        assert result[0]["values"] == []
