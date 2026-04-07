"""Unit tests for truncation-safe plain-text LLM completions."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.llm import LLMConfig, complete


def _response(*, content: str, finish_reason: str, output_tokens: int) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                message=SimpleNamespace(content=content),
                finish_reason=finish_reason,
            )
        ],
        usage={"completion_tokens": output_tokens},
    )


@pytest.mark.asyncio
@patch("app.llm._record_llm_attempt")
@patch("app.llm._get_reasoning_effort", return_value=None)
@patch("app.llm._supports_temperature", return_value=False)
@patch("app.llm.get_router")
async def test_complete_retries_when_text_response_hits_length_limit(
    mock_get_router,
    _mock_supports_temperature,
    _mock_reasoning_effort,
    _mock_record_attempt,
):
    router = SimpleNamespace(
        acompletion=AsyncMock(
            side_effect=[
                _response(
                    content="Partial outreach that stops abruptly",
                    finish_reason="length",
                    output_tokens=256,
                ),
                _response(
                    content="Finished outreach message with a complete ending.",
                    finish_reason="stop",
                    output_tokens=88,
                ),
            ]
        )
    )
    config = LLMConfig(provider="openai", model="gpt-test", api_key="test-key")
    mock_get_router.return_value = (router, config)

    result = await complete(
        prompt="Write an outreach message.",
        max_tokens=256,
        retries=1,
        operation="outreach_generate",
        retry_hint="Return one complete outreach message. Do not stop mid-sentence.",
    )

    assert result == "Finished outreach message with a complete ending."
    assert router.acompletion.await_count == 2
    first_call = router.acompletion.await_args_list[0].kwargs
    second_call = router.acompletion.await_args_list[1].kwargs
    assert first_call["max_tokens"] == 256
    assert second_call["max_tokens"] > 256
    assert "Do not stop mid-sentence" in second_call["messages"][-1]["content"]


@pytest.mark.asyncio
@patch("app.llm._record_llm_attempt")
@patch("app.llm._get_reasoning_effort", return_value=None)
@patch("app.llm._supports_temperature", return_value=False)
@patch("app.llm.get_router")
async def test_complete_raises_instead_of_returning_truncated_text(
    mock_get_router,
    _mock_supports_temperature,
    _mock_reasoning_effort,
    _mock_record_attempt,
):
    router = SimpleNamespace(
        acompletion=AsyncMock(
            side_effect=[
                _response(
                    content="Still truncated",
                    finish_reason="length",
                    output_tokens=256,
                ),
                _response(
                    content="Still truncated again",
                    finish_reason="length",
                    output_tokens=384,
                ),
            ]
        )
    )
    config = LLMConfig(provider="openai", model="gpt-test", api_key="test-key")
    mock_get_router.return_value = (router, config)

    with pytest.raises(ValueError, match="truncated"):
        await complete(
            prompt="Write a cover letter.",
            max_tokens=256,
            retries=1,
            operation="cover_letter_generate",
            retry_hint="Return one complete cover letter.",
            retry_max_tokens=384,
        )
