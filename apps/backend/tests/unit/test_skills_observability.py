"""Tests for deterministic skills_observability projection."""

from app.services.tailoring.skills_observability import build_skills_observability_v1


def test_observability_tags_move_add_remove_round_trip() -> None:
    base = {"skills": {"groups": [{"id": "g1", "label": "Lang", "values": ["A", "B", "C"]}]}}
    tailor = {"skills": {"groups": [{"id": "g1", "label": "Lang", "values": ["B", "A", "D"]}]}}
    obs = build_skills_observability_v1(base, tailor, None, ordered_group_ids=["g1"])
    assert obs is not None
    assert obs["version"] == 1
    g0 = obs["groups"][0]
    assert g0["group_id"] == "g1"
    tags = [v["change_tag"] for v in g0["values"]]
    assert tags == ["moved", "moved", "added"]
    removed_texts = [r["text"] for r in g0.get("removed", [])]
    assert removed_texts == ["C"]
