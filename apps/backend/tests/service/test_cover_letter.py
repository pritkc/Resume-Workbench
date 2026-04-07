"""Service tests for cover letter and outreach helpers."""

from unittest.mock import AsyncMock, patch

from app.services.cover_letter import (
    build_job_target_title,
    extract_job_target_metadata,
    generate_cover_letter,
    generate_outreach_message,
)
from app.services.message_profiles import CandidatePromptProfile


class TestJobTargetMetadata:
    def test_prefers_metadata_from_job_keywords(self):
        metadata = extract_job_target_metadata(
            "As an Agile Business Analyst at West Shore Home, you will work across teams.",
            job_keywords={
                "core_title": "Business Analyst",
                "company_name": "West Shore Home",
                "location": "Remote",
            },
        )

        assert metadata == {
            "role": "Business Analyst",
            "company": "West Shore Home",
            "location": "Remote",
        }

    def test_splits_company_from_malformed_core_title(self):
        metadata = extract_job_target_metadata(
            "Join our team.",
            job_keywords={
                "core_title": "Senior Backend Engineer @ TechCorp",
                "company_name": None,
                "location": None,
            },
        )

        assert metadata["role"] == "Senior Backend Engineer"
        assert metadata["company"] == "TechCorp"

    def test_strips_company_and_location_noise_from_core_title(self):
        metadata = extract_job_target_metadata(
            "Join our team.",
            job_keywords={
                "core_title": "Senior Backend Engineer - TechCorp - Remote",
                "company_name": "TechCorp",
                "location": "Remote",
            },
        )

        assert metadata["role"] == "Senior Backend Engineer"
        assert metadata["company"] == "TechCorp"
        assert metadata["location"] == "Remote"

    def test_strips_employment_suffix_from_core_title(self):
        metadata = extract_job_target_metadata(
            "Join our team.",
            job_keywords={
                "core_title": "Backend Engineer (Contract)",
                "company_name": None,
                "location": None,
            },
        )

        assert metadata["role"] == "Backend Engineer"
        assert metadata["company"] is None

    def test_falls_back_to_job_description_when_metadata_missing(self):
        metadata = extract_job_target_metadata(
            "As an Agile Business Analyst at West Shore Home, you will work across teams.",
            job_keywords={},
        )

        assert metadata["role"] == "Agile Business Analyst"
        assert metadata["company"] == "West Shore Home"


class TestBuildJobTargetTitle:
    def test_builds_title_from_keywords(self):
        title = build_job_target_title(
            "Senior Backend Engineer role",
            job_keywords={
                "core_title": "Backend Engineer",
                "company_name": "TechCorp",
            },
        )

        assert title == "Backend Engineer @ TechCorp"

    def test_falls_back_to_role_only_when_company_missing(self):
        title = build_job_target_title(
            "Senior Backend Engineer role",
            job_keywords={
                "core_title": "Backend Engineer",
                "company_name": None,
            },
        )

        assert title == "Backend Engineer"


class TestCandidatePromptProfile:
    def test_builds_compact_profile_without_personal_info_or_section_meta(self, sample_resume):
        profile = CandidatePromptProfile.from_resume_data(sample_resume)
        payload = profile.model_dump(exclude_none=True)

        assert "headline" in payload
        assert "skills" in payload
        assert "sectionMeta" not in payload
        assert "personalInfo" not in payload
        assert "email" not in profile.to_prompt_json()
        assert "linkedin.com/in/janedoe" not in profile.to_prompt_json()


class TestGeneratedMessages:
    @patch("app.services.cover_letter.complete", new_callable=AsyncMock)
    async def test_outreach_uses_compact_profile_and_retry_hint(
        self, mock_complete, sample_resume, sample_job_description
    ):
        mock_complete.return_value = "Worth a quick chat?"

        await generate_outreach_message(sample_resume, sample_job_description)

        kwargs = mock_complete.call_args.kwargs
        prompt = kwargs["prompt"]
        assert "CANDIDATE PROFILE (JSON):" in prompt
        assert '"experience"' in prompt
        assert '"sectionMeta"' not in prompt
        assert "jane@example.com" not in prompt
        assert "linkedin.com/in/janedoe" not in prompt
        assert kwargs["max_tokens"] == 256
        assert kwargs["retries"] == 1
        assert "Do not stop mid-sentence" in kwargs["retry_hint"]

    @patch("app.services.cover_letter.complete", new_callable=AsyncMock)
    async def test_cover_letter_uses_compact_profile_and_retry_hint(
        self, mock_complete, sample_resume, sample_job_description
    ):
        mock_complete.return_value = "Thanks for your time."

        await generate_cover_letter(sample_resume, sample_job_description)

        kwargs = mock_complete.call_args.kwargs
        prompt = kwargs["prompt"]
        assert "JOB TARGET (JSON):" in prompt
        assert "CANDIDATE PROFILE (JSON):" in prompt
        assert "Acme Corp" in prompt
        assert '"sectionMeta"' not in prompt
        assert "jane@example.com" not in prompt
        assert kwargs["max_tokens"] == 384
        assert kwargs["retries"] == 1
        assert "complete cover letter" in kwargs["retry_hint"]
