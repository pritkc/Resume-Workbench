"""Unit tests for apply_compact_diff and related helpers in preservation.py."""

import pytest

from app.services.tailoring.preservation import (
    _all_skill_values,
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

    def test_experience_bullet_indices_use_llm_prompt_slice_not_raw_storage(self):
        """Compact diff keys index the same list as tailor_resume_full / rewrite_resume (tech line dropped)."""
        resume = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Senior Engineer",
                    "company": "Acme",
                    "summary": "Python, AWS, Kubernetes",
                    "description": [
                        "Python, AWS, Kubernetes",
                        "First real bullet",
                        "Second real bullet",
                        "Third real bullet",
                        "Fourth real bullet",
                    ],
                }
            ],
            "personalProjects": [],
            "skills": {"groups": []},
            "customSections": {},
            "personalInfo": {},
        }
        diff = {"experience": {"0": {"bullets": {"3": "Fourth bullet rewritten"}}}}
        result = apply_compact_diff(resume, diff)
        desc = result["workExperience"][0]["description"]
        assert desc[0] == "Python, AWS, Kubernetes"
        assert desc[1] == "First real bullet"
        assert desc[2] == "Second real bullet"
        assert desc[3] == "Third real bullet"
        assert desc[4] == "Fourth bullet rewritten"

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

    def test_section_diff_as_list_is_supported(self, base_resume):
        diff = {"experience": [{"bullets": {"0": "List-form entry bullet"}}]}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][0] == "List-form entry bullet"

    def test_description_alias_is_supported_for_bullets(self, base_resume):
        diff = {"experience": {"0": {"description": {"1": "Description-alias bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][1] == "Description-alias bullet"

    def test_highlights_alias_list_is_supported_for_bullets(self, base_resume):
        diff = {"projects": {"0": {"highlights": ["Project bullet rewritten"]}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["personalProjects"][0]["description"][0] == "Project bullet rewritten"

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

    def test_experience_tech_stacks_applied_with_bullets(self, base_resume):
        diff = {"experience": {"0": {"tech_stacks": "Python, FastAPI", "bullets": {"0": "Bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][0] == "Bullet"
        assert result["workExperience"][0].get("summary") == "Python, FastAPI"

    def test_skills_regroup_applied(self, base_resume):
        new_skills = [
            {"label": "Backend", "values": ["Python", "SQL"]},
            {"label": "DevOps", "values": ["Docker", "GitHub Actions", "Bash"]},
        ]
        diff = {"skills": new_skills}
        result = apply_compact_diff(base_resume, diff)
        assert result["skills"]["groups"] == new_skills

    def test_skills_dict_shape_with_groups_is_supported(self, base_resume):
        diff = {
            "skills": {
                "groups": [
                    {"label": "Backend", "values": ["Python", "SQL"]},
                    {"label": "Platform", "values": ["Docker"]},
                ]
            }
        }
        result = apply_compact_diff(base_resume, diff)
        assert result["skills"]["groups"][0]["label"] == "Backend"
        assert result["skills"]["groups"][0]["values"] == ["Python", "SQL"]

    def test_skills_are_simplified_and_deduplicated(self, base_resume):
        diff = {
            "skills": [
                {"label": "Backend", "values": ["Python", "FastAPI", "SQL"]},
                {"label": "Cloud", "values": ["AWS", "Docker"]},
                {"label": "Data", "values": ["SQL", "Kafka"]},
                {"label": "Infra", "values": ["Terraform"]},
                {"label": "Lang", "values": ["Python", "Bash"]},
                {"label": "Certs", "values": ["AWS SAA"]},
                {"label": "Overflow", "values": ["ShouldNotAppear"]},
            ]
        }
        result = apply_compact_diff(base_resume, diff)
        groups = result["skills"]["groups"]
        assert len(groups) == 6
        flattened = [item for group in groups for item in group["values"]]
        assert flattened.count("Python") == 1
        assert flattened.count("SQL") == 1
        assert "ShouldNotAppear" not in flattened

    def test_skills_absent_key_unchanged(self, base_resume):
        diff = {"summary": "New summary."}
        result = apply_compact_diff(base_resume, diff)
        assert result["skills"] == base_resume["skills"]

    def test_new_skills_accepted(self, base_resume):
        diff = {
            "skills": [
                {"label": "Languages", "values": ["Python", "SQL", "Kubernetes"]},
                {"label": "Tools", "values": ["Docker", "GitHub Actions"]},
            ]
        }
        result = apply_compact_diff(base_resume, diff)
        langs = next(g for g in result["skills"]["groups"] if g["label"] == "Languages")
        assert "Kubernetes" in langs["values"]
        assert "Python" in langs["values"]

    def test_experience_position_applied(self, base_resume):
        diff = {
            "experience": {
                "0": {
                    "position": "Senior Engineer, Platform & Distributed Systems",
                    "bullets": {"0": "Built distributed APIs"},
                }
            }
        }
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["position"] == "Senior Engineer, Platform & Distributed Systems"
        assert result["workExperience"][0]["title"] == "Senior Engineer, Platform & Distributed Systems"
        assert result["workExperience"][0]["description"][0] == "Built distributed APIs"

    def test_project_name_applied(self, base_resume):
        diff = {
            "projects": {
                "0": {
                    "name": "LogLens | Observability Toolkit",
                    "tech_stacks": "Python, Click, observability",
                    "bullets": {"0": "Built a CLI for structured log analysis"},
                }
            }
        }
        result = apply_compact_diff(base_resume, diff)
        assert result["personalProjects"][0]["name"] == "LogLens | Observability Toolkit"
        assert result["personalProjects"][0]["summary"] == "Python, Click, observability"
        assert result["personalProjects"][0]["description"][0] == "Built a CLI for structured log analysis"

    def test_position_not_applied_to_projects(self, base_resume):
        diff = {"projects": {"0": {"position": "should be ignored", "bullets": {"0": "Bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert "position" not in result["personalProjects"][0]

    def test_name_not_applied_to_experience(self, base_resume):
        diff = {"experience": {"0": {"name": "should be ignored", "bullets": {"0": "Bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0].get("name") is None

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


class TestJDIntelligence:
    def test_to_prompt_dict_strips_empty_fields(self):
        from app.services.tailoring.models import JDIntelligence
        intel = JDIntelligence(
            role={"title": "Backend Engineer", "seniority": "senior"},
            company={"name": "TechCorp"},
            ats_keywords=["Python", "FastAPI"],
        )
        d = intel.to_prompt_dict()
        assert d["role"]["title"] == "Backend Engineer"
        assert "location" not in d
        assert "bold_keywords" not in d
        assert d["ats_keywords"] == ["Python", "FastAPI"]

    def test_to_legacy_keywords_backward_compat(self):
        from app.services.tailoring.models import JDIntelligence
        intel = JDIntelligence(
            role={"title": "Backend Engineer", "seniority": "senior"},
            company={"name": "TechCorp"},
            location="Remote",
            technical_requirements={"primary_stack": ["Python", "FastAPI"]},
            requirements={"years": 5, "education": "BS in CS"},
            ats_keywords=["microservices"],
            responsibility_themes=["API design"],
        )
        legacy = intel.to_legacy_keywords()
        assert legacy["core_title"] == "Backend Engineer"
        assert legacy["company_name"] == "TechCorp"
        assert legacy["location"] == "Remote"
        assert legacy["required_skills"] == ["Python", "FastAPI"]
        assert legacy["experience_years"] == 5
        assert legacy["seniority_level"] == "senior"
        assert legacy["keywords"] == ["microservices"]
        assert legacy["education_requirements"] == ["BS in CS"]
