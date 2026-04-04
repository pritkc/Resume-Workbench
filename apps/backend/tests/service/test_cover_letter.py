"""Service tests for cover letter helpers."""

from unittest.mock import AsyncMock, patch

import pytest

from app.services.cover_letter import generate_resume_title


@pytest.mark.asyncio
class TestGenerateResumeTitle:
    @patch("app.services.cover_letter.complete", new_callable=AsyncMock)
    async def test_uses_llm_title_when_response_is_valid(self, mock_complete):
        mock_complete.return_value = "Agile Business Analyst @ West Shore Home"

        title = await generate_resume_title(
            "As an Agile Business Analyst at West Shore Home, you will work across teams."
        )

        assert title == "Agile Business Analyst @ West Shore Home"
        mock_complete.assert_awaited_once()

    @patch("app.services.cover_letter.complete", new_callable=AsyncMock)
    async def test_falls_back_to_job_description_when_llm_title_looks_truncated(self, mock_complete):
        mock_complete.return_value = "Ag"

        title = await generate_resume_title(
            "As an Agile Business Analyst at West Shore Home, you will work across teams."
        )

        assert title == "Agile Business Analyst @ West Shore Home"
        mock_complete.assert_awaited_once()
