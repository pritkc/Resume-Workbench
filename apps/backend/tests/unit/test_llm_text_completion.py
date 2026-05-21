"""Unit tests for truncation-safe plain-text LLM completions."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

from app.llm import LLMConfig, complete, complete_stream


class _AsyncChunks:
    def __init__(self, chunks):
        self._chunks = chunks

    def __aiter__(self):
        self._iter = iter(self._chunks)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration as exc:
            raise StopAsyncIteration from exc


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


def _chunk(content: str, finish_reason: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        choices=[
            SimpleNamespace(
                delta=SimpleNamespace(content=content),
                finish_reason=finish_reason,
            )
        ],
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
        operation="cover_letter_outreach_generate",
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
            operation="cover_letter_outreach_generate",
            retry_hint="Return one complete cover letter.",
            retry_max_tokens=384,
        )


@pytest.mark.asyncio
@patch("app.llm._record_llm_attempt")
@patch("app.llm._get_reasoning_effort", return_value=None)
@patch("app.llm._supports_temperature", return_value=False)
@patch("app.llm.get_router")
async def test_complete_stream_accumulates_chunks_and_emits_timing(
    mock_get_router,
    _mock_supports_temperature,
    _mock_reasoning_effort,
    mock_record_attempt,
):
    router = SimpleNamespace(
        acompletion=AsyncMock(
            return_value=_AsyncChunks(
                [
                    _chunk("Hello"),
                    _chunk(" world", "stop"),
                ]
            )
        )
    )
    config = LLMConfig(provider="openai", model="gpt-test", api_key="test-key")
    mock_get_router.return_value = (router, config)
    events: list[tuple[str, dict]] = []
    deltas: list[str] = []

    async def event_sink(event_type: str, data: dict) -> None:
        events.append((event_type, data))

    async def on_delta(delta: str, accumulated: str) -> None:
        deltas.append(accumulated)

    result = await complete_stream(
        prompt="Say hello.",
        max_tokens=64,
        retries=0,
        operation="resume_generate_full",
        event_sink=event_sink,
        on_delta=on_delta,
    )

    assert result == "Hello world"
    assert deltas == ["Hello", "Hello world"]
    assert [event[0] for event in events] == [
        "llm.started",
        "llm.delta",
        "llm.delta",
        "llm.completed",
    ]
    assert events[-1][1]["time_to_first_token_ms"] is not None
    mock_record_attempt.assert_called_once()
    assert mock_record_attempt.call_args.kwargs["request_kind"] == "text_stream"


@pytest.mark.asyncio
@patch("app.llm._record_llm_attempt")
@patch("app.llm._get_reasoning_effort", return_value=None)
@patch("app.llm._supports_temperature", return_value=False)
@patch("app.llm.get_router")
async def test_complete_stream_emits_safe_text_deltas_only_when_enabled(
    mock_get_router,
    _mock_supports_temperature,
    _mock_reasoning_effort,
    _mock_record_attempt,
):
    router = SimpleNamespace(
        acompletion=AsyncMock(
            return_value=_AsyncChunks(
                [
                    _chunk("JD intel "),
                    _chunk("line", "stop"),
                ]
            )
        )
    )
    config = LLMConfig(provider="openai", model="gpt-test", api_key="test-key")
    mock_get_router.return_value = (router, config)
    events: list[tuple[str, dict]] = []

    async def event_sink(event_type: str, data: dict) -> None:
        events.append((event_type, data))

    result = await complete_stream(
        prompt="Analyze JD.",
        max_tokens=64,
        retries=0,
        operation="extract_jd_intel_output",
        event_sink=event_sink,
        include_delta_text=True,
        stream_kind="jd_intel",
    )

    assert result == "JD intel line"
    text_delta_events = [data for event_type, data in events if event_type == "llm.delta"]
    assert "".join(str(event["text_delta"]) for event in text_delta_events) == result
    assert {event["stream_kind"] for event in text_delta_events} == {"jd_intel"}
    assert all("prompt" not in event for event in text_delta_events)
