"""Regression: skills group labels must preserve spaces (UI typing + API round-trip)."""

from app.schemas.models import SkillGroup, SkillsSection
from app.services.additional_groups import normalize_skill_groups


def test_skill_group_pydantic_preserves_leading_trailing_spaces() -> None:
    g = SkillGroup.model_validate(
        {"id": "g1", "label": "My Skills ", "values": ["a"]}
    )
    assert g.label == "My Skills "


def test_skill_group_pydantic_preserves_internal_double_spaces() -> None:
    g = SkillGroup.model_validate({"id": "g1", "label": "A  B", "values": []})
    assert g.label == "A  B"


def test_skills_section_round_trip_label_spaces() -> None:
    payload = {
        "groups": [
            {"id": "x", "label": "Backend ", "values": ["Go"]},
        ]
    }
    section = SkillsSection.model_validate(payload)
    assert section.groups[0].label == "Backend "


def test_normalize_skill_groups_preserves_label_spaces() -> None:
    out = normalize_skill_groups(
        {
            "groups": [
                {"id": "custom-1", "label": "Machine Learning ", "values": []},
            ]
        }
    )
    assert out["groups"][0]["label"] == "Machine Learning "
