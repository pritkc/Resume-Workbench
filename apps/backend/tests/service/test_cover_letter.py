"""Service tests for cover letter and outreach helpers."""

from unittest.mock import AsyncMock, patch

from app.services.cover_letter import (
    build_job_target_title,
    extract_job_target_metadata,
    parse_combined_message_response,
    generate_cover_letter,
    generate_cover_letter_and_outreach,
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
            "location": None,
        }

    def test_reads_nested_jd_intelligence_role_and_company_objects(self):
        """When job_keywords only has 2.0 nested shapes (no flat core_title/company_name)."""
        metadata = extract_job_target_metadata(
            "Details about the role.",
            job_keywords={
                "role": {
                    "title": "Back End Engineer",
                    "seniority": "senior",
                    "function": "backend",
                    "scope": "team-level delivery",
                },
                "company": {
                    "name": "Pylon",
                    "team": "Underwriting",
                    "domain": "fintech",
                    "product_context": "Mortgage platform.",
                },
            },
        )

        assert metadata["role"] == "Back End Engineer"
        assert metadata["company"] == "Pylon"

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
        assert metadata["location"] is None

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

    def test_drops_url_and_boilerplate_noise_from_keywords(self):
        metadata = extract_job_target_metadata(
            "Senior Backend Engineer\nApply now.",
            job_keywords={
                "core_title": "range of benefits. Learn more",
                "company_name": "https://www",
                "location": "This role is based out of our Seattle office and follows a hybrid schedule.",
            },
        )

        assert metadata["role"] == "Senior Backend Engineer"
        assert metadata["company"] is None
        assert metadata["location"] is None

    def test_extracts_role_from_headline_only_job_description(self):
        metadata = extract_job_target_metadata(
            "Senior Backend Engineer\n\nResponsibilities include building APIs and improving test coverage.",
            job_keywords={},
        )

        assert metadata["role"] == "Senior Backend Engineer"

    def test_extracts_role_and_company_from_headline_with_at_separator(self):
        metadata = extract_job_target_metadata(
            "Senior Engineer at TechCorp\n\nResponsibilities include building APIs.",
            job_keywords={},
        )

        assert metadata["role"] == "Senior Engineer"
        assert metadata["company"] == "TechCorp"

    def test_normalizes_location_to_city_state_abbreviation(self):
        metadata = extract_job_target_metadata(
            "Role details here.",
            job_keywords={
                "core_title": "Backend Engineer",
                "company_name": "TechCorp",
                "location": "on-site at san jose, ca",
            },
        )

        assert metadata["location"] == "San Jose, CA"

    def test_drops_location_without_state_abbreviation(self):
        metadata = extract_job_target_metadata(
            "Role details here.",
            job_keywords={
                "core_title": "Backend Engineer",
                "company_name": "TechCorp",
                "location": "on-site at san jose",
            },
        )

        assert metadata["location"] is None


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
        prompt_json = profile.to_prompt_json()

        assert "headline" in payload
        assert "skills" in payload
        assert "sectionMeta" not in payload
        assert "personalInfo" not in payload
        assert "email" not in prompt_json
        assert "linkedin.com/in/janedoe" not in prompt_json
        assert "\n" not in prompt_json
        assert len(prompt_json) < 900


class TestGeneratedMessages:
    @patch("app.services.cover_letter.complete", new_callable=AsyncMock)
    async def test_combined_generation_uses_single_json_call(
        self, mock_complete, sample_resume, sample_job_description
    ):
        mock_complete.return_value = """
<<COVER_LETTER>>
Thanks for considering my application.
<<END_COVER_LETTER>>
<<OUTREACH_MESSAGE>>
Open to a quick intro call this week?
<<END_OUTREACH_MESSAGE>>
""".strip()

        cover_letter, outreach = await generate_cover_letter_and_outreach(
            sample_resume,
            sample_job_description,
        )

        kwargs = mock_complete.call_args.kwargs
        prompt = kwargs["prompt"]
        assert "JOB TARGET (JSON):" in prompt
        assert "CANDIDATE PROFILE (JSON):" in prompt
        assert kwargs["operation"] == "cover_letter_outreach_generate"
        assert kwargs["max_tokens"] == 2600
        assert kwargs["retries"] == 2
        assert kwargs["retry_max_tokens"] == 3200
        assert kwargs["metadata"]["candidate_profile_chars"] < 900
        assert cover_letter == "Thanks for considering my application."
        assert outreach == "Open to a quick intro call this week?"

    @patch("app.services.cover_letter.generate_cover_letter_and_outreach", new_callable=AsyncMock)
    async def test_outreach_uses_shared_generator(
        self, mock_combined, sample_resume, sample_job_description
    ):
        mock_combined.return_value = ("Thanks for your time.", "Worth a quick chat?")

        outreach = await generate_outreach_message(sample_resume, sample_job_description)

        mock_combined.assert_awaited_once_with(sample_resume, sample_job_description)
        assert outreach == "Worth a quick chat?"

    @patch("app.services.cover_letter.generate_cover_letter_and_outreach", new_callable=AsyncMock)
    async def test_cover_letter_uses_shared_generator(
        self, mock_combined, sample_resume, sample_job_description
    ):
        mock_combined.return_value = ("Thanks for your time.", "Worth a quick chat?")

        cover_letter = await generate_cover_letter(sample_resume, sample_job_description)

        mock_combined.assert_awaited_once_with(sample_resume, sample_job_description)
        assert cover_letter == "Thanks for your time."

    def test_combined_parser_accepts_json_fallback(self):
        cover_letter, outreach = parse_combined_message_response(
            '{"cover_letter":"Thanks for your time.","outreach_message":"Worth a quick chat?"}'
        )

        assert cover_letter == "Thanks for your time."
        assert outreach == "Worth a quick chat?"
