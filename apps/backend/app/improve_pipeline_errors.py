"""Structured HTTP errors for resume improve / application-pack preview flows."""

from __future__ import annotations

import re
from typing import Any

from fastapi import HTTPException
from litellm.exceptions import (
    APIConnectionError as LitellmAPIConnectionError,
    AuthenticationError as LitellmAuthenticationError,
    BadRequestError as LitellmBadRequestError,
    ContentPolicyViolationError as LitellmContentPolicyViolationError,
    ContextWindowExceededError as LitellmContextWindowExceededError,
    NotFoundError as LitellmNotFoundError,
    RateLimitError as LitellmRateLimitError,
    ServiceUnavailableError as LitellmServiceUnavailableError,
    Timeout as LitellmTimeout,
    UnsupportedParamsError as LitellmUnsupportedParamsError,
)

_IMPROVE_STAGE_LABELS: dict[str, str] = {
    "load_job_keywords": "Analyzing the job description",
    "persist_job_keywords": "Saving job analysis",
    "generate_full_resume": "Tailoring your resume",
    "persist_preview_hash": "Saving preview metadata",
    "calculate_diff": "Calculating resume changes",
    "create_application_pack": "Creating application pack",
    "render_preview_artifacts": "Rendering preview files",
    "update_generation_run": "Recording generation run",
    "create_resume": "Saving tailored resume",
    "create_improvement": "Saving improvement notes",
    "serialize_improved_data": "Preparing resume data",
}


def _stage_context(stage: str) -> tuple[str, str | None]:
    label = _IMPROVE_STAGE_LABELS.get(stage, "Running the tailoring pipeline")
    step_key = "extract_jd_intel" if stage == "load_job_keywords" else None
    return label, step_key


def _truncate(text: str, max_len: int = 720) -> str:
    text = text.strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 1] + "…"


def _clean_upstream_excerpt(exc: Exception) -> str:
    raw = str(exc).strip()
    raw = re.sub(r"\s+", " ", raw)
    return _truncate(raw)


def _safe_model_attrs(exc: Exception) -> tuple[str | None, str | None]:
    prov = getattr(exc, "llm_provider", None)
    model = getattr(exc, "model", None)
    p = str(prov).strip() if prov is not None else None
    m = str(model).strip() if model is not None else None
    if p == "":
        p = None
    if m == "":
        m = None
    return p, m


def _bad_request_hints(exc: Exception, excerpt: str) -> list[str]:
    hints: list[str] = []
    lower = excerpt.casefold()
    prov, model = _safe_model_attrs(exc)

    if prov == "openai" and model and "gemini" in model.casefold():
        hints.append(
            "Your configuration uses the OpenAI-compatible provider (often CLIProxy) while the model id looks like Gemini. "
            "Use the exact model alias your proxy documents, or switch the base provider to one that matches the model."
        )

    if isinstance(exc, LitellmUnsupportedParamsError) or "response_format" in lower or "json_schema" in lower:
        hints.append(
            'Job-description analysis requests JSON-shaped output. If the model rejects that, pick another model for the '
            '"extract_jd_intel" step (Settings → model overrides / generation defaults).'
        )

    if "invalid argument" in lower or "invalid_request" in lower or "unsupported" in lower:
        hints.append(
            "The upstream API rejected a parameter or model name. Double-check provider, model id, and API base URL; "
            "with per-step overrides, use `provider/model` when the model belongs to a different vendor."
        )

    if not hints and isinstance(exc, LitellmBadRequestError):
        hints.append(
            "Open your LLM / CLIProxy settings and verify the model id, API route, and key. "
            "Retry with a conservative default model if you are unsure."
        )

    return hints


def http_exception_for_improve_pipeline_failure(
    *,
    action: str,
    stage: str,
    error: Exception,
    fallback_message: str,
) -> HTTPException:
    """Map an unexpected pipeline exception to an HTTP error with a useful client payload."""
    stage_label, step_key = _stage_context(stage)
    excerpt = _clean_upstream_excerpt(error)
    prov, model = _safe_model_attrs(error)

    def _payload(
        *,
        err_type: str,
        message: str,
        status_code: int,
        hints: list[str] | None = None,
        include_excerpt: bool = True,
    ) -> HTTPException:
        detail: dict[str, Any] = {
            "type": err_type,
            "action": action,
            "stage": stage,
            "stage_label": stage_label,
            "message": message,
        }
        if step_key:
            detail["step_key"] = step_key
        if hints:
            detail["hints"] = hints
        if include_excerpt and excerpt:
            detail["technical_detail"] = excerpt
        if prov:
            detail["llm_provider"] = prov
        if model:
            detail["llm_model"] = model
        return HTTPException(status_code=status_code, detail=detail)

    if isinstance(error, LitellmRateLimitError):
        return _payload(
            err_type="llm_rate_limit",
            message="The AI provider rate-limited this request. Wait a moment and try again, or switch to another model.",
            status_code=429,
            hints=[
                "Retry after a short pause; bursts of previews can trigger limits.",
                "If limits persist, rotate to another model or increase your API quota.",
            ],
        )

    if isinstance(error, LitellmAuthenticationError):
        return _payload(
            err_type="llm_authentication",
            message="The AI provider rejected authentication. Check your API key and provider settings, then try again.",
            status_code=502,
            hints=[
                "Confirm the key is for the selected provider and not expired.",
                "If you use CLIProxy, verify its client API key matches what the backend sends.",
            ],
        )

    if isinstance(error, LitellmContentPolicyViolationError):
        return _payload(
            err_type="llm_content_policy",
            message="The AI provider refused the request for content-policy reasons. Edit the job description or resume text and try again.",
            status_code=422,
            hints=["Remove sensitive or restricted content from the JD or resume, then retry."],
        )

    if isinstance(error, LitellmContextWindowExceededError):
        return _payload(
            err_type="llm_context_limit",
            message="The combined job description and instructions exceed what the selected model accepts. Shorten the job description or use a larger-context model.",
            status_code=502,
            hints=[
                "Trim long JD sections (boilerplate, legal text) and retry.",
                'If you use per-step overrides, choose a bigger-context model for "extract_jd_intel".',
            ],
        )

    if isinstance(error, LitellmNotFoundError):
        return _payload(
            err_type="llm_model_not_found",
            message="The AI provider reported that the model was not found. Update the model id in settings.",
            status_code=502,
            hints=[
                "Copy the exact model string from your provider’s model list.",
                "With OpenRouter or CLIProxy, include any required prefix or alias verbatim.",
            ],
        )

    if isinstance(error, LitellmUnsupportedParamsError):
        return _payload(
            err_type="llm_unsupported_params",
            message="The model does not accept a parameter used in this step (often JSON mode). Try another model for this pipeline step.",
            status_code=502,
            hints=_bad_request_hints(error, excerpt),
        )

    if isinstance(error, LitellmBadRequestError):
        hints = _bad_request_hints(error, excerpt)
        return _payload(
            err_type="llm_bad_request",
            message="The AI provider rejected the request. This is usually a model, routing, or JSON-mode mismatch — see the hints below.",
            status_code=502,
            hints=hints,
        )

    if isinstance(error, (LitellmTimeout, LitellmAPIConnectionError)):
        return _payload(
            err_type="llm_transport",
            message="Could not reach the AI provider in time. Check network, API base URL, and provider status, then retry.",
            status_code=502,
            hints=[
                "Verify VPN or firewall rules if you self-host CLIProxy.",
                "Transient outages clear with a retry; persistent errors need URL or key fixes.",
            ],
        )

    if isinstance(error, LitellmServiceUnavailableError):
        return _payload(
            err_type="llm_service_unavailable",
            message="The AI provider returned a service unavailable error. Retry shortly or switch models.",
            status_code=502,
        )

    return _payload(
        err_type="pipeline_error",
        message=fallback_message,
        status_code=500,
        hints=[f"Failed during: {stage_label}."],
        include_excerpt=True,
    )
