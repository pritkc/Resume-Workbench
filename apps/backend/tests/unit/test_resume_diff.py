from app.services.improver import calculate_resume_diff


def _additional(*groups: tuple[str, str, list[str]]) -> dict:
    return {
        "additional": {
            "groups": [
                {"id": group_id, "label": label, "items": items}
                for group_id, label, items in groups
            ]
        }
    }


def test_additional_item_add_remove_case_insensitive() -> None:
    original = _additional(("technicalSkills", "Technical Skills", ["Python", "React"]))
    improved = _additional(("technicalSkills", "Technical Skills", ["python", "Go"]))

    summary, changes = calculate_resume_diff(original, improved)

    added = [
        c for c in changes if c.field_type == "additional_item" and c.change_type == "added"
    ]
    removed = [
        c for c in changes if c.field_type == "additional_item" and c.change_type == "removed"
    ]

    assert [c.new_value for c in added] == ["Go"]
    assert [c.original_value for c in removed] == ["React"]
    assert summary.additional_items_added == 1
    assert summary.additional_items_removed == 1
    assert summary.high_risk_changes == 1


def test_additional_group_relabel_counts_as_group_change() -> None:
    original = _additional(("technicalSkills", "Technical Skills", ["Python", "Go"]))
    improved = _additional(("technicalSkills", "Backend", ["Python", "Go"]))

    summary, changes = calculate_resume_diff(original, improved)

    group_changes = [
        c for c in changes if c.field_type == "additional_group" and c.change_type == "modified"
    ]
    assert len(group_changes) == 1
    assert summary.additional_items_added == 0
    assert summary.additional_items_removed == 0
    assert summary.additional_groups_modified == 1


def test_description_modified_count_is_strict() -> None:
    original = {"workExperience": [{"description": ["Built APIs", "Led team"]}]}
    improved = {"workExperience": [{"description": ["Built APIs", "Led squad"]}]}

    summary, changes = calculate_resume_diff(original, improved)

    description_changes = [
        c for c in changes if c.field_type == "description" and c.change_type == "modified"
    ]
    assert len(description_changes) == 1
    assert summary.descriptions_modified == 1


def test_handles_malformed_additional_lists_gracefully() -> None:
    original = {
        "additional": {
            "groups": [
                {
                    "id": "technicalSkills",
                    "label": "Technical Skills",
                    "items": ["Python", {"name": "Go"}, None, 123],
                }
            ]
        },
        "workExperience": [{"description": "Not a list"}],
    }
    improved = _additional(("technicalSkills", "Technical Skills", ["Python"]))

    summary, changes = calculate_resume_diff(original, improved)

    removed = [
        c for c in changes if c.field_type == "additional_item" and c.change_type == "removed"
    ]
    assert [c.original_value for c in removed] == ["Go", "123"]
    assert summary.additional_items_removed == 2


def test_high_risk_additional_item_addition() -> None:
    original = _additional(("technicalSkills", "Technical Skills", []))
    improved = _additional(("technicalSkills", "Technical Skills", ["Rust"]))

    summary, changes = calculate_resume_diff(original, improved)

    assert summary.high_risk_changes == 1
    assert any(
        c.change_type == "added"
        and c.field_type == "additional_item"
        and c.confidence == "high"
        for c in changes
    )


def test_summary_modified() -> None:
    original = {"summary": "Original summary text."}
    improved = {"summary": "Improved summary text."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "modified"


def test_summary_added() -> None:
    original = {"summary": ""}
    improved = {"summary": "New summary."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "added"


def test_summary_removed() -> None:
    original = {"summary": "Has summary."}
    improved = {"summary": ""}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 1
    assert summary_changes[0].change_type == "removed"


def test_summary_unchanged() -> None:
    original = {"summary": "Same text."}
    improved = {"summary": "Same text."}

    summary, changes = calculate_resume_diff(original, improved)

    summary_changes = [c for c in changes if c.field_type == "summary"]
    assert len(summary_changes) == 0


def test_experience_entry_added() -> None:
    original = {"workExperience": [{"title": "Dev", "company": "A", "years": "2020", "description": []}]}
    improved = {
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": []},
            {"title": "Senior", "company": "B", "years": "2022", "description": []},
        ]
    }

    summary, changes = calculate_resume_diff(original, improved)

    exp_added = [c for c in changes if c.field_type == "experience" and c.change_type == "added"]
    assert len(exp_added) == 1


def test_experience_entry_removed() -> None:
    original = {
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": []},
            {"title": "Senior", "company": "B", "years": "2022", "description": []},
        ]
    }
    improved = {"workExperience": [{"title": "Dev", "company": "A", "years": "2020", "description": []}]}

    summary, changes = calculate_resume_diff(original, improved)

    exp_removed = [
        c for c in changes if c.field_type == "experience" and c.change_type == "removed"
    ]
    assert len(exp_removed) == 1


def test_experience_entry_modified() -> None:
    original = {
        "workExperience": [
            {
                "title": "Dev",
                "company": "A",
                "location": "NY",
                "years": "2020",
                "description": [],
            }
        ]
    }
    improved = {
        "workExperience": [
            {
                "title": "Dev",
                "company": "A",
                "location": "Remote",
                "years": "2020",
                "description": [],
            }
        ]
    }

    summary, changes = calculate_resume_diff(original, improved)

    exp_modified = [
        c for c in changes if c.field_type == "experience" and c.change_type == "modified"
    ]
    assert len(exp_modified) == 1


def test_project_entry_added() -> None:
    original = {"personalProjects": []}
    improved = {
        "personalProjects": [
            {"name": "Tool", "role": "Creator", "years": "2021", "description": []}
        ]
    }

    summary, changes = calculate_resume_diff(original, improved)

    proj_added = [c for c in changes if c.field_type == "project" and c.change_type == "added"]
    assert len(proj_added) == 1


def test_education_entry_added() -> None:
    original = {"education": []}
    improved = {
        "education": [{"institution": "MIT", "degree": "BS", "years": "2020", "description": None}]
    }

    summary, changes = calculate_resume_diff(original, improved)

    edu_added = [c for c in changes if c.field_type == "education" and c.change_type == "added"]
    assert len(edu_added) == 1


def test_no_changes_returns_empty() -> None:
    original = {
        "summary": "Same.",
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": ["Built stuff"]}
        ],
        "additional": {
            "groups": [
                {"id": "technicalSkills", "label": "Technical Skills", "items": ["Python"]}
            ]
        },
    }
    improved = {
        "summary": "Same.",
        "workExperience": [
            {"title": "Dev", "company": "A", "years": "2020", "description": ["Built stuff"]}
        ],
        "additional": {
            "groups": [
                {"id": "technicalSkills", "label": "Technical Skills", "items": ["Python"]}
            ]
        },
    }

    summary, changes = calculate_resume_diff(original, improved)

    assert summary.total_changes == 0
    assert len(changes) == 0
