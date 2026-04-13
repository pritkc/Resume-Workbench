from unittest.mock import AsyncMock, patch

from app.routers import resumes as resumes_router


async def test_generate_auxiliary_messages_prefers_combined_request() -> None:
    with (
        patch(
            "app.routers.resumes.generate_cover_letter_and_outreach",
            new=AsyncMock(return_value=("Cover letter", "Outreach")),
        ) as combined,
    ):
        cover_letter, outreach_message, title, warnings = (
            await resumes_router._generate_auxiliary_messages(
                improved_data={"personalInfo": {"name": "Jane Doe"}},
                job_content="Senior Backend Engineer at Acme",
                job_keywords=None,
                language="en",
            )
        )

    combined.assert_awaited_once()
    assert cover_letter == "Cover letter"
    assert outreach_message == "Outreach"
    assert title == "Senior Backend Engineer @ Acme"
    assert warnings == []


async def test_generate_auxiliary_messages_falls_back_when_combined_fails() -> None:
    with (
        patch(
            "app.routers.resumes.generate_cover_letter_and_outreach",
            new=AsyncMock(side_effect=RuntimeError("boom")),
        ) as combined,
    ):
        cover_letter, outreach_message, _title, warnings = (
            await resumes_router._generate_auxiliary_messages(
                improved_data={"personalInfo": {"name": "Jane Doe"}},
                job_content="Senior Backend Engineer at Acme",
                job_keywords=None,
                language="en",
            )
        )

    combined.assert_awaited_once()
    assert cover_letter is None
    assert outreach_message is None
    assert "Combined message generation failed" in warnings
