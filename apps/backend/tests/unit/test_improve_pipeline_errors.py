"""Tests for structured improve / preview pipeline HTTP errors."""

from litellm.exceptions import BadRequestError as LitellmBadRequestError
from litellm.exceptions import RateLimitError as LitellmRateLimitError

from app.improve_pipeline_errors import http_exception_for_improve_pipeline_failure


def test_bad_request_returns_502_with_hints_and_stage() -> None:
    exc = LitellmBadRequestError(
        "OpenAIException - Request contains an invalid argument.",
        model="openai/gemini-3.1-pro-high",
        llm_provider="openai",
    )
    http_exc = http_exception_for_improve_pipeline_failure(
        action="preview",
        stage="load_job_keywords",
        error=exc,
        fallback_message="Failed.",
    )
    assert http_exc.status_code == 502
    assert isinstance(http_exc.detail, dict)
    detail = http_exc.detail
    assert detail["type"] == "llm_bad_request"
    assert detail["stage"] == "load_job_keywords"
    assert detail["step_key"] == "extract_jd_intel"
    assert "Analyzing the job description" in detail["stage_label"]
    assert isinstance(detail.get("hints"), list)
    assert detail["hints"]
    assert detail.get("llm_model") == "openai/gemini-3.1-pro-high"


def test_rate_limit_returns_429() -> None:
    exc = LitellmRateLimitError(
        "Too many requests",
        llm_provider="openai",
        model="gpt-4",
    )
    http_exc = http_exception_for_improve_pipeline_failure(
        action="preview",
        stage="generate_full_resume",
        error=exc,
        fallback_message="Failed.",
    )
    assert http_exc.status_code == 429
    assert http_exc.detail["type"] == "llm_rate_limit"


def test_unknown_error_falls_back_to_500() -> None:
    http_exc = http_exception_for_improve_pipeline_failure(
        action="improve",
        stage="calculate_diff",
        error=RuntimeError("unexpected"),
        fallback_message="Failed to improve resume. Please try again.",
    )
    assert http_exc.status_code == 500
    detail = http_exc.detail
    assert detail["type"] == "pipeline_error"
    assert detail["message"] == "Failed to improve resume. Please try again."
