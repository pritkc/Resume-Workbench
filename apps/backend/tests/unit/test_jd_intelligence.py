"""Tests for JDIntelligence field preservation and transition normalization."""

import pytest

from app.services.tailoring.models import JDIntelligence


class TestJDIntelligenceFieldPreservation:
    def test_culture_signals_preserved(self):
        """culture_signals must NOT be silently dropped by JDIntelligence model."""
        raw = {
            "role": {"title": "Backend Engineer", "seniority": "junior"},
            "culture_signals": ["fast-moving", "remote-first", "data-driven"],
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.culture_signals == ["fast-moving", "remote-first", "data-driven"], (
            "culture_signals is extracted by the JD prompt but dropped by JDIntelligence "
            "because the field is not defined on the model. Add it."
        )

    def test_experience_level_signal_preserved(self):
        """experience_level_signal must NOT be silently dropped."""
        raw = {
            "role": {"title": "SWE", "seniority": "junior"},
            "experience_level_signal": "2-3 years of Python in production, owned a service end-to-end",
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.experience_level_signal == "2-3 years of Python in production, owned a service end-to-end"

    def test_priority_keywords_accepted(self):
        """priority_keywords (renamed from JD bold_keywords) must be accepted."""
        raw = {
            "role": {"title": "SWE"},
            "priority_keywords": ["FastAPI", "AWS Lambda", "Kafka"],
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.priority_keywords == ["FastAPI", "AWS Lambda", "Kafka"]

    def test_old_bold_keywords_normalizes_to_priority_keywords(self):
        """Transition: old bold_keywords input must map to priority_keywords for backward compat."""
        raw = {
            "role": {"title": "SWE"},
            "bold_keywords": ["FastAPI", "Kubernetes"],  # old field name
        }
        intel = JDIntelligence.model_validate(raw)
        assert intel.priority_keywords == ["FastAPI", "Kubernetes"], (
            "JDIntelligence must accept old 'bold_keywords' and normalize to 'priority_keywords' "
            "during the transition period. Add a model_validator for this."
        )

    def test_new_grad_seniority_accepted(self):
        """role.seniority must accept 'new-grad' as a valid value."""
        raw = {"role": {"title": "SWE", "seniority": "new-grad"}}
        intel = JDIntelligence.model_validate(raw)
        assert intel.role.seniority == "new-grad"

    def test_new_grad_seniority_variants_normalized(self):
        """new_grad and entry-level variants must normalize to new-grad."""
        for variant in ["new_grad", "newgrad", "entry-level", "entry level"]:
            raw = {"role": {"title": "SWE", "seniority": variant}}
            intel = JDIntelligence.model_validate(raw)
            assert intel.role.seniority == "new-grad", f"Expected 'new-grad' for variant '{variant}'"

    def test_to_prompt_dict_includes_culture_signals(self):
        """culture_signals must appear in the prompt-facing dict."""
        intel = JDIntelligence(
            role={"title": "SWE", "seniority": "junior"},
            culture_signals=["remote-first", "agile"],
        )
        d = intel.to_prompt_dict()
        assert d.get("culture_signals") == ["remote-first", "agile"]

    def test_to_prompt_dict_includes_experience_level_signal(self):
        """experience_level_signal must appear in the prompt-facing dict."""
        intel = JDIntelligence(
            role={"title": "SWE"},
            experience_level_signal="2-3 years Python in production",
        )
        d = intel.to_prompt_dict()
        assert d.get("experience_level_signal") == "2-3 years Python in production"

    def test_to_prompt_dict_uses_priority_keywords_not_bold_keywords(self):
        """Prompt-facing dict must use 'priority_keywords', not 'bold_keywords'."""
        intel = JDIntelligence(
            role={"title": "SWE"},
            priority_keywords=["FastAPI", "Kafka"],
        )
        d = intel.to_prompt_dict()
        assert "priority_keywords" in d
        assert "bold_keywords" not in d, (
            "bold_keywords in JD context is confusing — it collides with the output "
            "bold_keywords rendering field. Use priority_keywords in the prompt dict."
        )

    def test_empty_culture_signals_stripped(self):
        """Empty culture_signals list must be stripped from prompt dict."""
        intel = JDIntelligence(role={"title": "SWE"}, culture_signals=[])
        d = intel.to_prompt_dict()
        assert "culture_signals" not in d

    def test_empty_priority_keywords_stripped(self):
        """Empty priority_keywords list must be stripped from prompt dict."""
        intel = JDIntelligence(role={"title": "SWE"}, priority_keywords=[])
        d = intel.to_prompt_dict()
        assert "priority_keywords" not in d


class TestJDIntelligenceExtractionPrompt:
    def test_extraction_prompt_uses_priority_keywords_not_bold_keywords(self):
        """JD extraction user prompt must use 'priority_keywords', not 'bold_keywords'."""
        from app.prompts.extract_jd_intel import USER_TEMPLATE
        assert "priority_keywords" in USER_TEMPLATE, (
            "extract_jd_intel/user.txt must use 'priority_keywords' not 'bold_keywords' "
            "to avoid collision with the resume output bold_keywords rendering field"
        )
        assert '"bold_keywords"' not in USER_TEMPLATE, (
            "Remove 'bold_keywords' from the extraction schema in extract_jd_intel/user.txt"
        )
