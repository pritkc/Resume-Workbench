"""Unit tests for apply_compact_diff and related helpers in preservation.py."""

import copy
import json

import pytest

from app.services.tailoring.preservation import (
    _all_skill_values,
    apply_compact_diff,
    finalize_tailored_resume,
    normalize_metric_units,
)
from app.services.tailoring.models import TailoringResumePayload


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
                "techStack": "Creator",
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
    def test_tailored_cell_null_retains_bullet(self, base_resume):
        diff = {
            "experience": {
                "0": {
                    "bullets": {
                        "0": {"value": None, "why": "Original bullet already optimal."},
                    }
                }
            }
        }
        result = apply_compact_diff(base_resume, diff)
        assert (
            result["workExperience"][0]["description"][0]
            == base_resume["workExperience"][0]["description"][0]
        )

    def test_tailored_values_apply_and_rationale_not_in_resume_json(self, base_resume):
        diff = {
            "summary": {"value": "New summary text.", "why": "Aligned to JD."},
            "experience": {
                "0": {"bullets": {"0": {"value": "Rewritten bullet.", "why": "Stronger hook."}}}
            },
        }
        result = apply_compact_diff(base_resume, diff)
        dumped = json.dumps(result)
        assert "why" not in dumped
        assert result["summary"] == "New summary text."
        assert result["workExperience"][0]["description"][0] == "Rewritten bullet."

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

    def test_out_of_range_experience_bullet_index_is_skipped(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"3": "Fourth net-new bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"] == base_resume["workExperience"][0]["description"]

    def test_experience_bullet_indices_use_llm_prompt_slice_not_raw_storage(self):
        """Compact diff keys index the same list as tailor_resume_full / rewrite_resume (tech line dropped)."""
        resume = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Senior Engineer",
                    "company": "Acme",
                    "techStack": "Python, AWS, Kubernetes",
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

    def test_tech_stack_change_does_not_leave_old_tail_bullet(self):
        """Changing tech_stacks must not make the old stack line count as a real bullet."""
        resume = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Engineer",
                    "company": "Acme",
                    "techStack": "Python, SQL",
                    "description": [
                        "Python, SQL",
                        "Old bullet 0",
                        "Old bullet 1",
                        "Old bullet 2",
                    ],
                }
            ],
            "personalProjects": [],
            "skills": {"groups": []},
            "customSections": {},
            "personalInfo": {},
        }
        diff = {
            "experience": {
                "0": {
                    "tech_stacks": "Python, PostgreSQL",
                    "bullets": {
                        "0": "New bullet 0",
                        "1": "New bullet 1",
                        "2": "New bullet 2",
                    },
                }
            }
        }
        result = apply_compact_diff(resume, diff)
        entry = result["workExperience"][0]
        assert entry["techStack"] == "Python, PostgreSQL"
        assert entry["description"] == [
            "Python, PostgreSQL",
            "New bullet 0",
            "New bullet 1",
            "New bullet 2",
        ]

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

    def test_trailing_bullet_index_does_not_extend_description(self, base_resume):
        diff = {"experience": {"0": {"bullets": {"5": "Appended bullet at new index"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"] == base_resume["workExperience"][0]["description"]

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
        assert result["personalProjects"][0]["techStack"] == "Python, Click, observability"

    def test_experience_tech_stacks_applied_with_bullets(self, base_resume):
        diff = {"experience": {"0": {"tech_stacks": "Python, FastAPI", "bullets": {"0": "Bullet"}}}}
        result = apply_compact_diff(base_resume, diff)
        assert result["workExperience"][0]["description"][0] == "Bullet"
        assert result["workExperience"][0].get("techStack") == "Python, FastAPI"

    def test_experience_tech_stack_only_update_replaces_stored_stack_prefix(self):
        resume = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Engineer",
                    "company": "Acme",
                    "techStack": "Python, SQL",
                    "description": ["Python, SQL", "Built APIs"],
                }
            ],
            "personalProjects": [],
            "skills": {"groups": []},
            "customSections": {},
            "personalInfo": {},
        }
        diff = {"experience": {"0": {"tech_stacks": "Python, PostgreSQL"}}}
        result = apply_compact_diff(resume, diff)
        assert result["workExperience"][0]["techStack"] == "Python, PostgreSQL"
        assert result["workExperience"][0]["description"] == ["Python, PostgreSQL", "Built APIs"]

    def test_basic_tools_are_stripped_from_compact_output(self, base_resume):
        diff = {
            "summary": "Excel analyst.",
            "experience": {
                "0": {
                    "tech_stacks": "Python, Excel, SAP, Teams, Miro",
                    "bullets": {"0": "Built Excel reports for stakeholders in Miro"},
                }
            },
            "skills": [
                {
                    "label": "Tools",
                    "values": [
                        "Python",
                        "Excel",
                        "JIRA",
                        "SAP",
                        "Confluence",
                        "Notion",
                        "Miro",
                    ],
                },
            ],
        }
        result = apply_compact_diff(base_resume, diff)
        assert result["summary"] == base_resume["summary"]
        assert result["workExperience"][0]["techStack"] == "Python, SAP"
        assert result["workExperience"][0]["description"][0] == base_resume["workExperience"][0]["description"][0]
        assert result["skills"]["groups"] == [{"label": "Tools", "values": ["Python", "SAP"]}]

    def test_metric_units_are_normalized_in_compact_output(self, base_resume):
        diff = {
            "experience": {
                "0": {
                    "bullets": {
                        "0": "Cut prep time from ~6 hours/week to ~45 minutes",
                        "1": "Reduced batch runtime from 45+ minutes to ~12 minutes",
                    }
                }
            }
        }
        result = apply_compact_diff(base_resume, diff)
        desc = result["workExperience"][0]["description"]
        assert desc[0] == "Cut prep time from ~6h/wk to ~45 min"
        assert desc[1] == "Reduced batch runtime from 45+ min to ~12 min"

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
        assert len(groups) == 5
        flattened = [item for group in groups for item in group["values"]]
        assert flattened.count("Python") == 1
        assert flattened.count("SQL") == 1
        assert "ShouldNotAppear" not in flattened
        assert "AWS SAA" not in flattened

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
        assert result["personalProjects"][0]["techStack"] == "Python, Click, observability"
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
        original_copy = copy.deepcopy(base_resume)
        diff = {"summary": "Changed.", "experience": {"0": {"bullets": {"0": "New"}}}}
        apply_compact_diff(base_resume, diff)
        assert base_resume["summary"] == original_copy["summary"]
        assert base_resume["workExperience"][0]["description"][0] == original_copy["workExperience"][0]["description"][0]

    def test_empty_diff_returns_original(self, base_resume):
        result = apply_compact_diff(base_resume, {})
        assert result["summary"] == base_resume["summary"]
        assert result["workExperience"] == base_resume["workExperience"]

    def test_finalize_enforces_original_description_counts(self):
        original = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Engineer",
                    "company": "Acme",
                    "techStack": "Python, SQL",
                    "description": ["Python, SQL", "Old 0", "Old 1"],
                }
            ],
            "personalProjects": [
                {
                    "name": "Project",
                    "techStack": "Python",
                    "description": ["Old project"],
                }
            ],
            "skills": {"groups": [{"label": "Data", "values": ["Python"]}]},
            "customSections": {},
            "personalInfo": {},
        }
        improved = {
            **original,
            "workExperience": [
                {
                    **original["workExperience"][0],
                    "description": ["Python, SQL", "New 0", "New 1", "Leaked old tail"],
                }
            ],
            "personalProjects": [
                {
                    **original["personalProjects"][0],
                    "description": ["New project", "Leaked project tail"],
                }
            ],
        }
        payload = TailoringResumePayload.from_resume_data(improved)
        assert payload is not None

        result, warnings, _location_source, _location_value = finalize_tailored_resume(
            payload=payload,
            original_resume_data=original,
            original_resume_markdown="",
            cleanup_source_data=None,
            job_content="",
            job_keywords={},
            prompt_id="full",
        )

        work_highlights = result["workExperience"][0]["highlights"]
        project_desc = result["personalProjects"][0]["description"]
        assert work_highlights == ["New 0", "New 1"]
        assert project_desc == ["New project"]
        assert any("description count" in warning for warning in warnings)

    def test_finalize_removes_basic_tool_leakage_from_full_payload(self):
        original = {
            "summary": "Engineer.",
            "workExperience": [
                {
                    "title": "Engineer",
                    "company": "Acme",
                    "techStack": "Python, SQL",
                    "description": ["Python, SQL", "Built APIs", "Shipped data models"],
                }
            ],
            "personalProjects": [
                {
                    "name": "Project",
                    "techStack": "Python",
                    "description": ["Built project"],
                }
            ],
            "skills": {"groups": [{"label": "Data", "values": ["Python", "SQL"]}]},
            "customSections": {},
            "personalInfo": {},
        }
        improved = {
            **original,
            "summary": "Engineer using Excel and Miro.",
            "workExperience": [
                {
                    **original["workExperience"][0],
                    "techStack": "Python, SQL, Excel, Miro",
                    "description": [
                        "Python, SQL, Excel, Miro",
                        "Built Excel workflows in Miro",
                        "Reduced batch time from 45 minutes to 12 minutes",
                    ],
                }
            ],
            "skills": {
                "groups": [
                    {"label": "Tools", "values": ["Python", "Excel", "Miro", "SQL"]}
                ]
            },
        }
        payload = TailoringResumePayload.from_resume_data(improved)
        assert payload is not None

        result, warnings, _location_source, _location_value = finalize_tailored_resume(
            payload=payload,
            original_resume_data=original,
            original_resume_markdown="",
            cleanup_source_data=None,
            job_content="",
            job_keywords={},
            prompt_id="full",
        )

        entry = result["workExperience"][0]
        assert entry["techStack"] == "Python, SQL"
        assert "Excel" not in result["summary"]
        assert entry["highlights"] == [
            "Built APIs",
            "Reduced batch time from 45 min to 12 min",
        ]
        assert result["skills"]["groups"][0]["label"] == "Tools"
        assert result["skills"]["groups"][0]["values"] == ["Python", "SQL"]
        assert any("blocked low-signal" in warning.lower() for warning in warnings)


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


def test_normalize_metric_units_compacts_time_phrases() -> None:
    assert (
        normalize_metric_units("from ~6 hours/week to 45 minutes and 200 milliseconds")
        == "from ~6h/wk to 45 min and 200 ms"
    )
