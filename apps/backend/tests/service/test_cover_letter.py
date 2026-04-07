"""Service tests for cover letter metadata helpers."""

from app.services.cover_letter import build_job_target_title, extract_job_target_metadata


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
