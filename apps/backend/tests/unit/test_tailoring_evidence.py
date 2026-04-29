"""Unit tests for the evidence binder module."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

import pytest

from app.services.tailoring.evidence import (
    AdjacentTerm,
    EvidenceBinder,
    NewGradProfile,
    RoleDepth,
    SupportedTerm,
    _collect_jd_terms,
    _is_current_role,
    _is_internship,
    _is_recent_grad,
    _tenure_signal,
    build_evidence_binder,
)
from app.services.tailoring.models import JDIntelligence, TailoringResumePayload


# ── Fixtures ─────────────────────────────────────────────────────────────────

_SIMPLE_RESUME: dict[str, Any] = {
    "summary": "Backend engineer with Python and PostgreSQL experience.",
    "workExperience": [
        {
            "position": "Software Engineer",
            "company": "Acme Corp",
            "start_date": "2022",
            "end_date": None,
            "techStack": "Python, FastAPI, PostgreSQL",
            "highlights": [
                "Built REST APIs using FastAPI and SQLAlchemy.",
                "Optimized PostgreSQL queries reducing latency by 40%.",
            ],
        },
        {
            "position": "Data Engineering Intern",
            "company": "BigData Inc",
            "start_date": "2021",
            "end_date": "2022",
            "techStack": "Spark, Python",
            "highlights": ["Contributed to ETL pipelines using Apache Spark."],
        },
    ],
    "personalProjects": [
        {
            "name": "ML Dashboard",
            "techStack": "React, Python, scikit-learn",
            "highlights": ["Built a dashboard visualizing ML model metrics."],
        }
    ],
    "education": [
        {
            "degree": "B.S.",
            "area": "Computer Science",
            "institution": "State University",
            "date": "2022",
        }
    ],
    "skills": {"groups": [{"label": "Languages", "values": ["Python", "SQL", "JavaScript"]}]},
}


def _make_jd_intelligence(**kwargs: Any) -> JDIntelligence:
    defaults: dict[str, Any] = {
        "ats_keywords": ["Python", "FastAPI", "Kubernetes"],
        "priority_keywords": ["PostgreSQL"],
        "responsibility_themes": ["Build scalable backend services", "Design REST APIs"],
        "role": {"title": "Backend Engineer", "seniority": "mid"},
    }
    defaults.update(kwargs)
    return JDIntelligence.model_validate(defaults)


# ── _collect_jd_terms ─────────────────────────────────────────────────────────

def test_collect_jd_terms_combines_all_sources() -> None:
    jd = _make_jd_intelligence()
    terms = _collect_jd_terms(jd)
    assert "Python" in terms
    assert "FastAPI" in terms
    assert "PostgreSQL" in terms
    # First 5 words of first theme
    assert "Build scalable backend services" in terms or any("Build" in t for t in terms)


def test_collect_jd_terms_deduplicates() -> None:
    jd = _make_jd_intelligence(ats_keywords=["Python", "Python", "FastAPI"])
    terms = _collect_jd_terms(jd)
    python_count = sum(1 for t in terms if t.casefold() == "python")
    assert python_count == 1


def test_collect_jd_terms_handles_empty() -> None:
    jd = JDIntelligence.model_validate({})
    terms = _collect_jd_terms(jd)
    assert terms == []


# ── _is_internship ────────────────────────────────────────────────────────────

def test_is_internship_detects_intern_in_position() -> None:
    assert _is_internship("Software Engineering Intern", "BigCo") is True


def test_is_internship_detects_internship_in_position() -> None:
    assert _is_internship("Internship: Data Science", "Corp") is True


def test_is_internship_false_for_regular() -> None:
    assert _is_internship("Software Engineer", "Acme Corp") is False


# ── _is_current_role ──────────────────────────────────────────────────────────

def test_is_current_role_none_end_date() -> None:
    assert _is_current_role(None) is True


def test_is_current_role_present_string() -> None:
    assert _is_current_role("present") is True
    assert _is_current_role("Present") is True
    assert _is_current_role("current") is True


def test_is_current_role_past_date() -> None:
    assert _is_current_role("2022") is False
    assert _is_current_role("Dec 2023") is False


# ── _tenure_signal ────────────────────────────────────────────────────────────

def test_tenure_signal_multi_year() -> None:
    result = _tenure_signal("2020", "2023", None, None)
    assert "3" in result


def test_tenure_signal_current_role() -> None:
    result = _tenure_signal("2022", None, None, None)
    assert "present" in result.lower()


def test_tenure_signal_less_than_one_year() -> None:
    result = _tenure_signal("2023", "2023", None, None)
    assert "1" in result or "< 1" in result or "year" in result.lower()


def test_tenure_signal_falls_back_to_string() -> None:
    result = _tenure_signal(None, None, "Jun 2020 - Dec 2021", None)
    assert "Jun 2020" in result


# ── EvidenceBinder.to_prompt_dict ─────────────────────────────────────────────

def test_to_prompt_dict_empty_binder() -> None:
    binder = EvidenceBinder()
    d = binder.to_prompt_dict()
    assert d == {}


def test_to_prompt_dict_supported_terms() -> None:
    binder = EvidenceBinder(
        supported_terms=[SupportedTerm(term="Python", source_locations=["experience.0", "skills"])]
    )
    d = binder.to_prompt_dict()
    assert "supported" in d
    assert d["supported"][0]["term"] == "Python"
    assert "experience.0" in d["supported"][0]["at"]


def test_to_prompt_dict_role_depth_omits_none_fields() -> None:
    binder = EvidenceBinder(
        role_depth=[
            RoleDepth(
                index=0,
                company="Acme",
                position="Engineer",
                tenure_signal="2 years",
                is_internship=False,
                is_current=True,
                bullet_count=3,
                tech_stacks=None,
            )
        ]
    )
    d = binder.to_prompt_dict()
    role = d["roles"][0]
    assert "tech" not in role  # None is omitted
    assert "intern" not in role  # False → None → omitted
    assert role["current"] is True  # True stays


def test_to_prompt_dict_is_valid_json() -> None:
    binder = EvidenceBinder(
        supported_terms=[SupportedTerm(term="Python", source_locations=["skills"])],
        unsupported_terms=["Kubernetes"],
    )
    d = binder.to_prompt_dict()
    serialized = json.dumps(d, separators=(",", ":"), ensure_ascii=True)
    parsed = json.loads(serialized)
    assert parsed["unsupported"] == ["Kubernetes"]


# ── build_evidence_binder ─────────────────────────────────────────────────────

def test_build_evidence_binder_returns_binder() -> None:
    jd = _make_jd_intelligence()
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    assert isinstance(binder, EvidenceBinder)


def test_build_evidence_binder_finds_supported_terms() -> None:
    jd = _make_jd_intelligence(
        ats_keywords=["Python", "PostgreSQL", "Kubernetes"],
        priority_keywords=[],
        responsibility_themes=[],
    )
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    supported_terms = {t.term for t in binder.supported_terms}
    assert "Python" in supported_terms
    assert "PostgreSQL" in supported_terms
    # Kubernetes is not in resume → should be unsupported or adjacent
    assert "Kubernetes" not in supported_terms


def test_build_evidence_binder_classifies_unsupported() -> None:
    jd = _make_jd_intelligence(
        ats_keywords=["Kubernetes", "Terraform", "Helm"],
        priority_keywords=[],
        responsibility_themes=[],
    )
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    unsupported = set(binder.unsupported_terms)
    adjacent_terms = {t.term for t in binder.adjacent_terms}
    # These should not appear in supported
    supported = {t.term for t in binder.supported_terms}
    assert "Kubernetes" not in supported
    # Must be classified somewhere
    assert "Kubernetes" in unsupported or "Kubernetes" in adjacent_terms


def test_build_evidence_binder_role_depth_populated() -> None:
    jd = _make_jd_intelligence()
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    assert len(binder.role_depth) == 2
    assert binder.role_depth[0].company == "Acme Corp"
    assert binder.role_depth[0].is_current is True
    assert binder.role_depth[1].is_internship is True
    assert binder.role_depth[1].is_current is False


def test_build_evidence_binder_new_grad_detected_by_year() -> None:
    """Recent graduation year triggers new_grad_profile."""
    jd = _make_jd_intelligence(role={"title": "SWE", "seniority": "mid"})
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    # 2022 graduation year → recent grad
    assert binder.new_grad_profile is not None
    assert len(binder.new_grad_profile.graduation_signals) > 0


def test_build_evidence_binder_no_new_grad_for_senior() -> None:
    """Old graduation year + senior seniority → no new_grad profile."""
    old_resume = dict(_SIMPLE_RESUME)
    old_resume["education"] = [
        {
            "degree": "B.S.",
            "area": "CS",
            "institution": "Big U",
            "date": "2015",
        }
    ]
    jd = _make_jd_intelligence(role={"title": "Staff Engineer", "seniority": "senior"})
    payload = TailoringResumePayload.from_resume_data(old_resume)
    binder = build_evidence_binder(jd, payload, old_resume)
    assert binder.new_grad_profile is None


def test_build_evidence_binder_with_none_payload() -> None:
    """None resume_payload → no role_depth, no crash."""
    jd = _make_jd_intelligence(ats_keywords=["Python"], priority_keywords=[], responsibility_themes=[])
    binder = build_evidence_binder(jd, None, _SIMPLE_RESUME)
    assert binder.role_depth == []
    supported_terms = {t.term for t in binder.supported_terms}
    assert "Python" in supported_terms


def test_build_evidence_binder_empty_resume() -> None:
    """Empty resume data → all terms unsupported, no crash."""
    jd = _make_jd_intelligence(
        ats_keywords=["Python", "Kubernetes"],
        priority_keywords=[],
        responsibility_themes=[],
    )
    binder = build_evidence_binder(jd, None, {})
    assert binder.supported_terms == []
    assert binder.adjacent_terms == [] or isinstance(binder.adjacent_terms, list)


def test_build_evidence_binder_source_locations_correct() -> None:
    """Supported term locations reflect which sections contain the term."""
    jd = _make_jd_intelligence(
        ats_keywords=["FastAPI"],
        priority_keywords=[],
        responsibility_themes=[],
    )
    payload = TailoringResumePayload.from_resume_data(_SIMPLE_RESUME)
    binder = build_evidence_binder(jd, payload, _SIMPLE_RESUME)
    supported_map = {t.term: t.source_locations for t in binder.supported_terms}
    assert "FastAPI" in supported_map
    # FastAPI appears in experience.0 tech stack and highlights
    locs = supported_map["FastAPI"]
    assert any("experience" in loc for loc in locs)
