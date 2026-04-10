from app.services.tailoring.change_manifest import (
    build_change_manifest,
    build_stage_breakdown,
    validate_declared_changes,
)
from app.schemas import ResumeChange


def test_build_change_manifest_captures_summary_bullets_and_skills() -> None:
    original = {
        "summary": "Backend engineer with Python experience.",
        "workExperience": [
            {
                "summary": "Backend engineer",
                "description": ["Built APIs", "Led migrations"],
            }
        ],
        "skills": {
            "groups": [
                {"id": "technicalSkills", "label": "Technical Skills", "values": ["Python", "FastAPI"]}
            ]
        },
    }
    updated = {
        "summary": "Backend engineer with Python and FastAPI experience.",
        "workExperience": [
            {
                "summary": "Senior backend engineer",
                "description": ["Built APIs", "Led service migrations", "Improved CI/CD pipelines"],
            }
        ],
        "skills": {
            "groups": [
                {"id": "backend", "label": "Backend", "values": ["Python", "FastAPI"]}
            ]
        },
    }

    changes = build_change_manifest(original, updated)

    assert any(change.path == "summary" and change.action == "replace" for change in changes)
    assert any(
        change.path == "workExperience[0].summary" and change.action == "replace"
        for change in changes
    )
    assert any(
        change.path == "workExperience[0].description[1]" and change.action == "replace"
        for change in changes
    )
    assert any(
        change.path == "workExperience[0].description" and change.action == "append"
        for change in changes
    )
    assert any(change.path == "skills.groups" and change.action == "regroup" for change in changes)


def test_validate_declared_changes_rejects_blocked_paths() -> None:
    original = {
        "summary": "Original summary",
        "workExperience": [{"description": ["Built APIs"]}],
    }
    declared = [
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="Built APIs",
            value="Built scalable APIs",
            reason="More aligned",
        ),
        ResumeChange(
            path="personalInfo.location",
            action="replace",
            original="San Francisco",
            value="Remote",
            reason="Blocked path",
        ),
    ]

    accepted, rejected = validate_declared_changes(original, declared)

    assert len(accepted) == 1
    assert accepted[0].path == "workExperience[0].description[0]"
    assert len(rejected) == 1
    assert rejected[0].path == "personalInfo.location"


def test_build_stage_breakdown_counts_numeric_and_location_metadata() -> None:
    computed_changes = [
        ResumeChange(
            path="workExperience[0].description[0]",
            action="replace",
            original="Built APIs",
            value="Built APIs serving 50K requests/day",
            reason="Added supported metric",
        )
    ]
    breakdown = build_stage_breakdown(
        declared_changes=computed_changes,
        computed_llm_changes=computed_changes,
        applied_changes=computed_changes,
        rejected_declared_changes=[],
        cleanup_only_changes=[],
        location_source="jd",
        location_value="Remote",
    )

    assert breakdown.llm_declared_changes == 1
    assert breakdown.numeric_claim_changes == 1
    assert breakdown.location_source == "jd"
    assert breakdown.location_value == "Remote"
