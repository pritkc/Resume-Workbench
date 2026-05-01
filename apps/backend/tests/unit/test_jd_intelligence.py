"""Tests for JDIntelligence normalization and prompt-facing JSON."""

import pytest

from app.services.tailoring.models import JDIntelligence


class TestJDIntelligence:
    def test_optional_top_level_keys_ignored_by_model(self) -> None:
        """culture_signals / experience_level_signal may appear in raw extract output but are not typed fields."""
        raw = {
            "role": {"title": "Backend Engineer", "seniority": "junior"},
            "culture_signals": ["fast-moving"],
            "experience_level_signal": "2-3 years Python",
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.role.title == "Backend Engineer"
        assert "culture_signals" not in intel.model_dump()

    def test_bold_keywords_accepted(self) -> None:
        raw = {
            "role": {"title": "SWE"},
            "bold_keywords": ["FastAPI", "AWS Lambda", "Kafka"],
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.bold_keywords == ["FastAPI", "AWS Lambda", "Kafka"]

    def test_priority_keywords_alias_maps_to_bold_keywords(self) -> None:
        raw = {
            "role": {"title": "SWE"},
            "priority_keywords": ["FastAPI", "Kubernetes"],
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.bold_keywords == ["FastAPI", "Kubernetes"]

    def test_seniority_passed_through_without_normalization(self) -> None:
        raw = {"role": {"title": "SWE", "seniority": "entry level"}}
        intel = JDIntelligence.model_validate(raw)
        assert intel.role.seniority == "entry level"

    def test_to_prompt_dict_uses_bold_keywords(self) -> None:
        intel = JDIntelligence(role={"title": "SWE"}, bold_keywords=["FastAPI", "Kafka"])
        d = intel.to_prompt_dict()
        assert d.get("bold_keywords") == ["FastAPI", "Kafka"]

    def test_empty_bold_keywords_stripped(self) -> None:
        intel = JDIntelligence(role={"title": "SWE"}, bold_keywords=[])
        d = intel.to_prompt_dict()
        assert "bold_keywords" not in d


class TestJDIntelligenceExtractionPrompt:
    def test_extraction_prompt_uses_bold_keywords(self) -> None:
        from app.prompts.extract_jd_intel import USER_TEMPLATE

        assert '"bold_keywords"' in USER_TEMPLATE
        assert "culture_signals" in USER_TEMPLATE.lower() or "experience_level_signal" in USER_TEMPLATE.lower()
