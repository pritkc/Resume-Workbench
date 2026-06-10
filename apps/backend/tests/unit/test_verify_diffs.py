"""Unit tests for verify_generated_resume_result() local quality checks."""

import copy

from app.services.improver import verify_generated_resume_result
from app.services.tailoring.verification import verify_rendered_resume_text


class TestVerifyGeneratedResumeResult:
    def test_no_warning_for_normal_summary_update(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Updated summary with stronger backend focus."

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert warnings == []

    def test_warns_when_resume_is_unchanged(self, sample_resume, sample_job_keywords):
        warnings = verify_generated_resume_result(
            sample_resume,
            copy.deepcopy(sample_resume),
            sample_job_keywords,
            prompt_id="full",
        )

        assert len(warnings) == 1
        assert "no material changes" in warnings[0].lower()

    def test_warns_on_section_count_change(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"] = result["workExperience"][:1]

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("section count changed" in warning.lower() for warning in warnings)

    def test_warns_on_identity_field_change(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["company"] = "Different Corp"
        result["summary"] = "Updated summary."

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("identity field changed" in warning.lower() for warning in warnings)

    def test_warns_on_invented_metric(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"][0] = (
            "Built REST APIs improving throughput by 40%"
        )

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("metric" in warning.lower() or "40%" in warning for warning in warnings)

    def test_warns_on_word_count_explosion(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        long_text = "word " * 200
        result["workExperience"][0]["description"] = [long_text] * 5
        result["workExperience"][1]["description"] = [long_text] * 5

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("word count" in warning.lower() for warning in warnings)

    def test_warns_when_full_mode_adds_bullets(self, sample_resume, sample_job_keywords):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"].append("Added extra keyword-focused bullet")

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("full mode" in warning.lower() for warning in warnings)

    def test_warns_when_supported_keywords_are_still_missing(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Backend engineer building scalable APIs."
        result["workExperience"][0]["description"] = [
            "Built APIs and mentored engineers"
        ]
        result["workExperience"][1]["description"] = [
            "Developed payment systems"
        ]
        technical_group = result["additional"]["technicalSkills"]
        result["additional"]["technicalSkills"] = [
            item for item in technical_group if item not in {"Python", "FastAPI", "Docker", "AWS"}
        ]

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("supported job keywords still missing" in warning.lower() for warning in warnings)

    def test_warns_when_basic_tools_leak_into_final_resume(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Backend engineer building Excel and Miro reporting automations."

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("critical" in warning.lower() for warning in warnings)

    def test_warns_when_experience_overuses_new_jd_terms(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"] = [
            "Built Kubernetes services for platform deployments.",
            "Automated Terraform workflows for cloud infrastructure.",
            "Created GraphQL APIs for backend integrations.",
        ]

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("jd saturation" in warning.lower() for warning in warnings)

    def test_warns_on_jd_ngram_copy_across_resume(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["summary"] = (
            "Engineer supporting global trade operations and process mapping."
        )
        result["workExperience"][0]["description"][0] = (
            "Collaborated with cross-functional stakeholders to support global trade operations."
        )

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
            job_description=(
                "Collaborate with cross-functional stakeholders to support global trade "
                "operations and create process mapping workflows."
            ),
        )

        assert any("jd phrase copy" in warning.lower() for warning in warnings)

    def test_warns_on_repeated_jd_noun_families(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["summary"] = "Workflow analyst optimizing workflow reporting."
        result["workExperience"][0]["description"] = [
            "Mapped workflow intake for operations.",
            "Shipped workflow reports for analysts.",
            "Automated workflow QA for managers.",
        ]

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            {
                **sample_job_keywords,
                "resume_technical_keywords": ["Workflow Visualization"],
                "resume_domain_keywords": ["Workflow"],
            },
            prompt_id="full",
        )

        assert any("repeated jd noun" in warning.lower() for warning in warnings)

    def test_warns_on_missing_clause_punctuation(
        self, sample_resume, sample_job_keywords
    ):
        result = copy.deepcopy(sample_resume)
        result["workExperience"][0]["description"][0] = (
            "Automated the audit package in Python and SQL a multi-day compile became one run"
        )

        warnings = verify_generated_resume_result(
            sample_resume,
            result,
            sample_job_keywords,
            prompt_id="full",
        )

        assert any("punctuation" in warning.lower() for warning in warnings)


def test_verify_rendered_resume_text_flags_pdf_leakage() -> None:
    warnings = verify_rendered_resume_text(
        "Summary\nExcel Miro create workflow visualization and process mapping\nExperience\n",
        job_description="Create workflow visualization and process mapping in Miro.",
    )
    assert any("pdf text" in warning.lower() for warning in warnings)
    assert any("jd phrase copy" in warning.lower() for warning in warnings)
