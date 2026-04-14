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
                include_cover_letter=True,
                include_outreach_message=True,
            )
        )

    combined.assert_awaited_once()
    assert cover_letter == "Cover letter"
    assert outreach_message == "Outreach"
    assert title == "Senior Backend Engineer @ Acme"
    assert warnings == []


async def test_generate_auxiliary_messages_returns_warning_when_package_fails() -> None:
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
                include_cover_letter=True,
                include_outreach_message=True,
            )
        )

    combined.assert_awaited_once()
    assert cover_letter is None
    assert outreach_message is None
    assert "Cover letter + outreach package generation failed" in warnings


async def test_generate_auxiliary_messages_respects_include_flags() -> None:
    with (
        patch(
            "app.routers.resumes.generate_cover_letter_and_outreach",
            new=AsyncMock(return_value=("Combined cover letter", "Combined outreach")),
        ) as combined,
    ):
        cover_letter_result, outreach_result, _title, warnings = (
            await resumes_router._generate_auxiliary_messages(
                improved_data={"personalInfo": {"name": "Jane Doe"}},
                job_content="Senior Backend Engineer at Acme",
                job_keywords=None,
                language="en",
                include_cover_letter=True,
                include_outreach_message=False,
            )
        )

    combined.assert_awaited_once()
    assert cover_letter_result == "Combined cover letter"
    assert outreach_result is None
    assert warnings == []


async def test_resolve_confirm_auxiliary_messages_drops_disabled_preview_outputs() -> None:
    with (
        patch(
            "app.routers.resumes._read_preview_auxiliary_payload",
            return_value={
                "title": "Senior Backend Engineer @ Acme",
                "cover_letter": "Existing cover letter",
                "outreach_message": "Existing outreach",
            },
        ),
        patch(
            "app.routers.resumes._generate_auxiliary_messages",
            new=AsyncMock(return_value=(None, None, "Senior Backend Engineer @ Acme", [])),
        ) as generator,
    ):
        cover_letter, outreach_message, title, warnings = (
            await resumes_router._resolve_confirm_auxiliary_messages(
                generation_run_id="run-123",
                improved_data={"personalInfo": {"name": "Jane Doe"}},
                job_content="Senior Backend Engineer at Acme",
                job_keywords=None,
                language="en",
                include_cover_letter=False,
                include_outreach_message=False,
            )
        )

    generator.assert_not_awaited()
    assert cover_letter is None
    assert outreach_message is None
    assert title == "Senior Backend Engineer @ Acme"
    assert warnings == []
