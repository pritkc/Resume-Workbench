"""LiteLLM wrapper for multi-provider AI support."""

import asyncio
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
import json
import logging
import math
import re
import threading
import time
from typing import Any
from uuid import uuid4

import litellm
from litellm import Router
from litellm.router import RetryPolicy
from pydantic import BaseModel

from app.config import settings

LITELLM_LOGGER_NAMES = ("LiteLLM", "LiteLLM Router", "LiteLLM Proxy")


def _configure_litellm_logging() -> None:
    """Align LiteLLM logger levels with application settings."""
    numeric_level = getattr(logging, settings.log_llm, logging.WARNING)
    for logger_name in LITELLM_LOGGER_NAMES:
        logging.getLogger(logger_name).setLevel(numeric_level)


_configure_litellm_logging()

# LLM timeout configuration (seconds) - base values
LLM_TIMEOUT_HEALTH_CHECK = 30
LLM_TIMEOUT_COMPLETION = 120
LLM_TIMEOUT_JSON = 180  # JSON completions may take longer
LLM_HEALTH_CHECK_MAX_TOKENS = 64
LLM_HEALTH_CHECK_PROMPT = "Reply with exactly OK."

# JSON-010: JSON extraction safety limits
MAX_JSON_EXTRACTION_RECURSION = 10
MAX_JSON_CONTENT_SIZE = 1024 * 1024  # 1MB

_LLM_TRACE_CONTEXT: ContextVar[dict[str, Any] | None] = ContextVar(
    "llm_trace_context", default=None
)

_BUILTIN_PRICING: tuple[dict[str, Any], ...] = (
    {
        "model_prefix": "gemini/gemini-2.5-flash",
        "input_per_1m": 0.30,
        "output_per_1m": 2.50,
        "source": "builtin:gemini-2.5-flash:2026-04-02",
    },
)

_LLM_HEALTH_CACHE_LOCK = asyncio.Lock()
_LLM_HEALTH_CACHE: dict[str, Any] | None = None


class LLMConfig(BaseModel):
    """LLM configuration model."""

    provider: str
    model: str
    api_key: str
    api_base: str | None = None


def _normalize_api_base(provider: str, api_base: str | None) -> str | None:
    """Normalize api_base for LiteLLM provider-specific expectations.

    When using proxies/aggregators, users often paste a base URL that already
    includes a version segment (e.g., `/v1`). Some LiteLLM provider handlers
    append those segments internally, which can lead to duplicated paths like
    `/v1/v1/...` and cause 404s.
    """
    if not api_base:
        return None

    base = api_base.strip()
    if not base:
        return None

    base = base.rstrip("/")

    # Anthropic handler appends '/v1/messages'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/messages'.
    if provider == "anthropic" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Gemini handler appends '/v1/models/...'. If base already ends with '/v1',
    # strip it to avoid '/v1/v1/models/...'.
    if provider == "gemini" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # OpenRouter base is https://openrouter.ai/api/v1. LiteLLM appends /v1
    # internally, so strip it to avoid /v1/v1.
    if provider == "openrouter" and base.endswith("/v1"):
        base = base[: -len("/v1")].rstrip("/")

    # Ollama doesn't use /v1 paths. Strip common suffixes users might paste:
    # /v1, /api/chat, /api/generate
    if provider == "ollama":
        for suffix in ("/v1", "/api/chat", "/api/generate", "/api"):
            if base.endswith(suffix):
                base = base[: -len(suffix)].rstrip("/")
                break

    return base or None


def _extract_text_parts(value: Any, depth: int = 0, max_depth: int = 10) -> list[str]:
    """Recursively extract text segments from nested response structures.

    Handles strings, lists, dicts with 'text'/'content'/'value' keys, and objects
    with text/content attributes. Limits recursion depth to avoid cycles.

    Args:
        value: Input value that may contain text in strings, lists, dicts, or objects.
        depth: Current recursion depth.
        max_depth: Maximum recursion depth before returning no content.

    Returns:
        A list of extracted text segments.
    """
    if depth >= max_depth:
        return []

    if value is None:
        return []

    if isinstance(value, str):
        return [value]

    if isinstance(value, list):
        parts: list[str] = []
        next_depth = depth + 1
        for item in value:
            parts.extend(_extract_text_parts(item, next_depth, max_depth))
        return parts

    if isinstance(value, dict):
        next_depth = depth + 1
        if "text" in value:
            return _extract_text_parts(value.get("text"), next_depth, max_depth)
        if "content" in value:
            return _extract_text_parts(value.get("content"), next_depth, max_depth)
        if "value" in value:
            return _extract_text_parts(value.get("value"), next_depth, max_depth)
        return []

    next_depth = depth + 1
    if hasattr(value, "text"):
        return _extract_text_parts(getattr(value, "text"), next_depth, max_depth)
    if hasattr(value, "content"):
        return _extract_text_parts(getattr(value, "content"), next_depth, max_depth)

    return []


def _join_text_parts(parts: list[str]) -> str | None:
    """Join text parts with newlines, filtering empty strings.

    Args:
        parts: Candidate text segments.

    Returns:
        Joined string or None if the result is empty.
    """
    joined = "\n".join(part for part in parts if part).strip()
    return joined or None


def _extract_message_text(message: Any) -> str | None:
    """Extract plain text from a LiteLLM message object across providers."""
    content: Any = None

    if hasattr(message, "content"):
        content = message.content
    elif isinstance(message, dict):
        content = message.get("content")

    return _join_text_parts(_extract_text_parts(content))


def _safe_get(obj: Any, key: str) -> Any:
    """Get attribute or dict key from an object."""
    if hasattr(obj, key):
        return getattr(obj, key)
    if isinstance(obj, dict):
        return obj.get(key)
    return None


def _extract_choice_text(choice: Any) -> str | None:
    """Extract plain text from a LiteLLM choice object.

    Tries message.content first, then choice.text, then choice.delta. Handles both
    object attributes and dict keys.
    """
    content = _extract_message_text(_safe_get(choice, "message"))
    if content:
        return content

    for field in ("text", "delta"):
        value = _safe_get(choice, field)
        if value is not None:
            extracted = _join_text_parts(_extract_text_parts(value))
            if extracted:
                return extracted

    return None


@contextmanager
def llm_trace_scope(
    trace_id: str,
    request_scope: str,
    metadata: dict[str, Any] | None = None,
):
    """Attach a high-level trace context to nested LLM calls."""
    previous = _LLM_TRACE_CONTEXT.get() or {}
    merged_metadata = dict(previous.get("metadata") or {})
    if metadata:
        merged_metadata.update(metadata)
    token = _LLM_TRACE_CONTEXT.set(
        {
            **previous,
            "trace_id": trace_id,
            "request_scope": request_scope,
            "metadata": merged_metadata,
        }
    )
    try:
        yield _LLM_TRACE_CONTEXT.get()
    finally:
        _LLM_TRACE_CONTEXT.reset(token)


def _estimate_tokens_from_text(text: str | None) -> int | None:
    if not text:
        return 0
    return max(1, math.ceil(len(text) / 4))


def _serialize_messages(messages: list[dict[str, Any]]) -> str:
    parts: list[str] = []
    for message in messages:
        role = str(_safe_get(message, "role") or "unknown")
        content = _join_text_parts(_extract_text_parts(_safe_get(message, "content"))) or ""
        parts.append(f"[{role}] {content}")
    return "\n\n".join(parts).strip()


def _preview_text(text: str | None) -> str | None:
    if text is None or not settings.llm_trace_store_content:
        return None
    limit = max(0, settings.llm_trace_preview_chars)
    if limit == 0:
        return None
    if len(text) <= limit:
        return text
    return f"{text[:limit]}\n...[truncated {len(text) - limit} chars]"


def _health_cache_key(config: "LLMConfig") -> str:
    return "|".join(
        [
            config.provider,
            config.model,
            config.api_base or "",
            config.api_key or "",
        ]
    )


def _clone_health_result(result: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(result))


def _cacheable_health_result(result: dict[str, Any]) -> dict[str, Any]:
    """Strip request-specific health-check details before caching."""
    allowed_keys = (
        "healthy",
        "provider",
        "model",
        "response_model",
        "error_code",
        "message",
        "warning",
        "warning_code",
    )
    return {key: result[key] for key in allowed_keys if key in result}


def _get_cached_health_result(config: "LLMConfig") -> dict[str, Any] | None:
    ttl_seconds = max(0, settings.llm_health_cache_ttl_seconds)
    if ttl_seconds == 0:
        return None

    cache = _LLM_HEALTH_CACHE
    if not cache:
        return None

    if cache.get("key") != _health_cache_key(config):
        return None

    age_seconds = time.time() - float(cache.get("stored_at_epoch", 0))
    if age_seconds > ttl_seconds:
        return None

    result = _clone_health_result(cache["result"])
    result["cached"] = True
    result["cache_age_seconds"] = int(max(0, age_seconds))
    result["checked_at"] = cache.get("checked_at")
    return result


def _store_cached_health_result(config: "LLMConfig", result: dict[str, Any]) -> None:
    global _LLM_HEALTH_CACHE
    _LLM_HEALTH_CACHE = {
        "key": _health_cache_key(config),
        "result": _cacheable_health_result(result),
        "stored_at_epoch": time.time(),
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }


def get_cached_llm_health(
    config: LLMConfig | None = None,
    *,
    source: str | None = None,
) -> dict[str, Any] | None:
    """Return the last cached LLM health result without probing the provider."""
    if config is None:
        config = get_llm_config()

    cached_result = _get_cached_health_result(config)
    if cached_result is not None and source:
        cached_result["health_source"] = source
    return cached_result


def get_llm_health_snapshot(
    config: LLMConfig | None = None,
    *,
    source: str | None = None,
) -> dict[str, Any]:
    """Return a cached-only view of LLM health for status endpoints."""
    if config is None:
        config = get_llm_config()

    llm_configured = bool(config.api_key) or config.provider == "ollama"
    cached_result = get_cached_llm_health(config, source=source)
    snapshot: dict[str, Any] = {
        "provider": config.provider,
        "model": config.model,
        "configured": llm_configured,
        "checked": False,
        "healthy": False,
        "status": "not_configured" if not llm_configured else "unchecked",
        "checked_at": None,
        "cached": False,
    }

    if not llm_configured:
        snapshot["error_code"] = "api_key_missing"

    if cached_result is None:
        return snapshot

    snapshot.update(
        {
            "checked": True,
            "healthy": bool(cached_result.get("healthy", False)),
            "status": (
                "healthy"
                if cached_result.get("healthy", False)
                else "unhealthy"
            ),
            "checked_at": cached_result.get("checked_at"),
            "cached": bool(cached_result.get("cached", False)),
        }
    )
    for key in (
        "response_model",
        "error_code",
        "message",
        "warning",
        "warning_code",
        "cache_age_seconds",
        "health_source",
    ):
        if key in cached_result:
            snapshot[key] = cached_result[key]

    return snapshot


def _extract_usage_metrics(response: Any) -> dict[str, int | None]:
    usage = _safe_get(response, "usage")
    if usage is None:
        return {
            "input_tokens": None,
            "output_tokens": None,
            "total_tokens": None,
        }

    return {
        "input_tokens": _safe_get(usage, "prompt_tokens") or _safe_get(usage, "input_tokens"),
        "output_tokens": _safe_get(usage, "completion_tokens") or _safe_get(usage, "output_tokens"),
        "total_tokens": _safe_get(usage, "total_tokens"),
    }


def _extract_finish_reason(choice: Any) -> str | None:
    finish_reason = _safe_get(choice, "finish_reason")
    return str(finish_reason) if finish_reason is not None else None


def _resolve_pricing(model_name: str) -> tuple[float | None, float | None, str | None]:
    if (
        settings.llm_cost_input_per_million_tokens is not None
        and settings.llm_cost_output_per_million_tokens is not None
    ):
        return (
            settings.llm_cost_input_per_million_tokens,
            settings.llm_cost_output_per_million_tokens,
            "settings_override",
        )

    for pricing in _BUILTIN_PRICING:
        if model_name.startswith(str(pricing["model_prefix"])):
            return (
                float(pricing["input_per_1m"]),
                float(pricing["output_per_1m"]),
                str(pricing["source"]),
            )

    return None, None, None


def _estimate_costs(
    *,
    model_name: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> tuple[float | None, float | None, float | None, str | None]:
    input_rate, output_rate, source = _resolve_pricing(model_name)
    if input_rate is None or output_rate is None:
        return None, None, None, source

    input_cost = None if input_tokens is None else (input_tokens / 1_000_000) * input_rate
    output_cost = None if output_tokens is None else (output_tokens / 1_000_000) * output_rate
    total_cost = None
    if input_cost is not None or output_cost is not None:
        total_cost = (input_cost or 0.0) + (output_cost or 0.0)
    return input_cost, output_cost, total_cost, source


def _persist_llm_attempt(record: dict[str, Any]) -> None:
    if not settings.llm_trace_enabled:
        return
    try:
        from app.database import db

        db.create_llm_call(**record)
    except Exception:
        logging.getLogger(__name__).warning(
            "Failed to persist LLM trace record",
            exc_info=True,
        )


def _record_llm_attempt(
    *,
    call_group_id: str,
    attempt: int,
    operation: str,
    request_kind: str,
    messages: list[dict[str, Any]],
    config: LLMConfig,
    model_name: str,
    max_tokens: int,
    temperature: float | None,
    reasoning_effort: str | None,
    json_mode: bool,
    started_at: float,
    success: bool,
    content: str | None = None,
    response: Any = None,
    finish_reason: str | None = None,
    error: Exception | None = None,
    extra_context: dict[str, Any] | None = None,
) -> None:
    prompt_text = _serialize_messages(messages)
    prompt_chars = len(prompt_text)
    prompt_tokens_est = _estimate_tokens_from_text(prompt_text)
    response_chars = len(content) if content is not None else None
    response_tokens_est = _estimate_tokens_from_text(content) if content is not None else None
    usage = _extract_usage_metrics(response)
    effective_input_tokens = usage["input_tokens"] or prompt_tokens_est
    effective_output_tokens = usage["output_tokens"] or response_tokens_est
    input_cost, output_cost, total_cost, pricing_source = _estimate_costs(
        model_name=model_name,
        input_tokens=effective_input_tokens,
        output_tokens=effective_output_tokens,
    )

    trace_context = _LLM_TRACE_CONTEXT.get() or {}
    trace_id = trace_context.get("trace_id") or call_group_id
    request_scope = trace_context.get("request_scope")
    request_context = dict(trace_context.get("metadata") or {})
    if extra_context:
        request_context.update(extra_context)
    if pricing_source:
        request_context["pricing_source"] = pricing_source

    latency_ms = max(0, int((time.perf_counter() - started_at) * 1000))
    record = {
        "llm_call_id": str(uuid4()),
        "call_group_id": call_group_id,
        "trace_id": trace_id,
        "request_scope": request_scope,
        "operation": operation,
        "provider": config.provider,
        "model": config.model,
        "model_name": model_name,
        "response_model": _safe_get(response, "model"),
        "request_kind": request_kind,
        "success": success,
        "attempt": attempt,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "reasoning_effort": reasoning_effort,
        "json_mode": json_mode,
        "latency_ms": latency_ms,
        "finish_reason": finish_reason,
        "prompt_chars": prompt_chars,
        "prompt_tokens_est": prompt_tokens_est,
        "response_chars": response_chars,
        "response_tokens_est": response_tokens_est,
        "usage_input_tokens": usage["input_tokens"],
        "usage_output_tokens": usage["output_tokens"],
        "usage_total_tokens": usage["total_tokens"],
        "estimated_input_cost_usd": round(input_cost, 6) if input_cost is not None else None,
        "estimated_output_cost_usd": round(output_cost, 6) if output_cost is not None else None,
        "estimated_total_cost_usd": round(total_cost, 6) if total_cost is not None else None,
        "error_type": type(error).__name__ if error else None,
        "error_message": str(error)[:2000] if error else None,
        "prompt_preview": _preview_text(prompt_text),
        "response_preview": _preview_text(content),
        "request_context": request_context or None,
        "completed_at": datetime.now(timezone.utc),
    }
    _persist_llm_attempt(record)

    log_level = logging.INFO if success else logging.WARNING
    logging.log(
        log_level,
        (
            "LLM call %s attempt=%d trace_id=%s scope=%s operation=%s provider=%s "
            "model=%s max_tokens=%s finish_reason=%s latency_ms=%s input_tokens=%s "
            "output_tokens=%s estimated_cost_usd=%s"
        ),
        "succeeded" if success else "failed",
        attempt,
        trace_id,
        request_scope,
        operation,
        config.provider,
        model_name,
        max_tokens,
        finish_reason,
        latency_ms,
        effective_input_tokens,
        effective_output_tokens,
        round(total_cost, 6) if total_cost is not None else None,
    )

    if (
        success
        and max_tokens > 0
        and effective_output_tokens is not None
        and effective_output_tokens >= int(max_tokens * settings.llm_near_limit_ratio)
    ):
        logging.warning(
            "LLM output approached max_tokens: trace_id=%s operation=%s output_tokens=%s max_tokens=%s finish_reason=%s",
            trace_id,
            operation,
            effective_output_tokens,
            max_tokens,
            finish_reason,
        )


def _to_code_block(content: str | None, language: str = "text") -> str:
    """Wrap content in a markdown code block for client display."""
    text = (content or "").strip()
    if not text:
        text = "<empty>"
    return f"```{language}\n{text}\n```"


def _load_stored_config() -> dict:
    """Load config from config.json file."""
    config_path = settings.config_path
    if config_path.exists():
        try:
            return json.loads(config_path.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


_PROVIDER_KEY_MAP: dict[str, str] = {
    "openai": "openai",
    "anthropic": "anthropic",
    "gemini": "google",
    "openrouter": "openrouter",
    "deepseek": "deepseek",
    "ollama": "ollama",
}


def resolve_api_key(stored: dict, provider: str) -> str:
    """Resolve the effective API key from stored config.

    Priority: top-level api_key > api_keys[provider] > env/settings default.

    This is the single source of truth for key resolution.  Every code path
    that needs an API key (runtime, config display, health check, test
    endpoint) must call this function instead of reading ``stored["api_key"]``
    directly.
    """
    api_key = stored.get("api_key", "")
    if not api_key:
        api_keys = stored.get("api_keys", {})
        if not isinstance(api_keys, dict):
            api_keys = {}
        config_provider = _PROVIDER_KEY_MAP.get(provider, provider)
        api_key = api_keys.get(config_provider, settings.llm_api_key)
    return api_key


def get_llm_config() -> LLMConfig:
    """Get current LLM configuration.

    Priority for api_key: top-level api_key > api_keys[provider] > env/settings
    """
    stored = _load_stored_config()
    provider = stored.get("provider", settings.llm_provider)
    api_key = resolve_api_key(stored, provider)

    return LLMConfig(
        provider=provider,
        model=stored.get("model", settings.llm_model),
        api_key=api_key,
        api_base=stored.get("api_base", settings.llm_api_base),
    )


def get_model_name(config: LLMConfig) -> str:
    """Convert provider/model to LiteLLM format.

    For most providers, adds the provider prefix if not already present.
    For OpenRouter, always adds 'openrouter/' prefix since OpenRouter models
    use nested prefixes like 'openrouter/anthropic/claude-3.5-sonnet'.
    """
    provider_prefixes = {
        "openai": "",  # OpenAI models don't need prefix
        "anthropic": "anthropic/",
        "openrouter": "openrouter/",
        "gemini": "gemini/",
        "deepseek": "deepseek/",
        "ollama": "ollama_chat/",  # ollama_chat/ routes to /api/chat (supports messages array)
    }

    prefix = provider_prefixes.get(config.provider, "")

    # OpenRouter is special: always add openrouter/ prefix unless already present
    # OpenRouter models use nested format: openrouter/anthropic/claude-3.5-sonnet
    if config.provider == "openrouter":
        if config.model.startswith("openrouter/"):
            return config.model
        return f"openrouter/{config.model}"

    # For other providers, don't add prefix if model already has a known prefix
    known_prefixes = ["openrouter/", "anthropic/",
                      "gemini/", "deepseek/", "ollama/", "ollama_chat/"]
    if any(config.model.startswith(p) for p in known_prefixes):
        return config.model

    # Add provider prefix for models that need it
    return f"{prefix}{config.model}" if prefix else config.model


# ---------------------------------------------------------------------------
# Router — centralises transport retries, cooldowns, and error-type policies
# ---------------------------------------------------------------------------

_router: Router | None = None
_router_config_key: str = ""
_router_lock = threading.Lock()


def _config_fingerprint(config: LLMConfig) -> str:
    """Generate a fingerprint to detect config changes.

    Uses Python's built-in ``hash()`` on the API key — stable within a
    single process (which is the cache lifetime), collision-resistant,
    and not a cryptographic function so it won't trigger CodeQL alerts.
    The raw key is never stored in the fingerprint string.
    """
    key_hash = hash(config.api_key) if config.api_key else 0
    return f"{config.provider}|{config.model}|{key_hash}|{config.api_base}"


def _build_router(config: LLMConfig) -> Router:
    """Build a LiteLLM Router with error-type retry policies."""
    model_name = get_model_name(config)

    litellm_params: dict[str, Any] = {"model": model_name}
    if config.api_key:
        litellm_params["api_key"] = config.api_key
    api_base = _normalize_api_base(config.provider, config.api_base)
    if api_base:
        litellm_params["api_base"] = api_base

    return Router(
        model_list=[
            {
                "model_name": "primary",
                "litellm_params": litellm_params,
            }
        ],
        num_retries=3,
        retry_policy=RetryPolicy(
            AuthenticationErrorRetries=0,
            BadRequestErrorRetries=0,
            TimeoutErrorRetries=2,
            RateLimitErrorRetries=3,
            ContentPolicyViolationErrorRetries=0,
            InternalServerErrorRetries=2,
        ),
        # Cooldowns disabled: with a single deployment and no fallback,
        # cooldowns would blackout the backend on transient failures.
        # Re-enable when a fallback deployment is added.
        disable_cooldowns=True,
    )


def get_router(config: LLMConfig | None = None) -> tuple[Router, LLMConfig]:
    """Get or rebuild the LiteLLM Router.

    The Router is cached and only rebuilt when the underlying config changes.
    Returns the Router and the config it was built from.
    """
    global _router, _router_config_key

    if config is None:
        config = get_llm_config()

    key = _config_fingerprint(config)
    with _router_lock:
        if _router is None or _router_config_key != key:
            _router = _build_router(config)
            _router_config_key = key
            logging.info("LiteLLM Router rebuilt for %s/%s", config.provider, config.model)
        router = _router

    return router, config


def _supports_temperature(provider: str, model: str) -> bool:
    """Return whether passing `temperature` is supported for this model/provider combo.

    Some models (e.g., OpenAI gpt-5 family) reject temperature values other than 1,
    and LiteLLM may error when temperature is passed.
    """
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return False
    return True


def _get_reasoning_effort(provider: str, model: str) -> str | None:
    """Return a default reasoning_effort for models that require it.

    Some OpenAI gpt-5 models may return empty message.content unless a supported
    `reasoning_effort` is explicitly set. This keeps downstream JSON parsing reliable.
    """
    _ = provider
    model_lower = model.lower()
    if "gpt-5" in model_lower:
        return "minimal"
    return None


async def check_llm_health(
    config: LLMConfig | None = None,
    *,
    include_details: bool = False,
    test_prompt: str | None = None,
    use_cache: bool | None = None,
    source: str | None = None,
) -> dict[str, Any]:
    """Check if the LLM provider is accessible and working."""
    if config is None:
        config = get_llm_config()

    # Check if API key is configured (except for Ollama)
    if config.provider != "ollama" and not config.api_key:
        return {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": "api_key_missing",
        }

    model_name = get_model_name(config)
    if use_cache is None:
        use_cache = not include_details and test_prompt is None

    prompt = test_prompt or LLM_HEALTH_CHECK_PROMPT
    reasoning_effort = _get_reasoning_effort(config.provider, model_name)

    if use_cache:
        cached_result = _get_cached_health_result(config)
        if cached_result is not None:
            if source:
                cached_result["health_source"] = source
            return cached_result

    async with _LLM_HEALTH_CACHE_LOCK:
        if use_cache:
            cached_result = _get_cached_health_result(config)
            if cached_result is not None:
                if source:
                    cached_result["health_source"] = source
                return cached_result

        call_group_id = str(uuid4())
        attempt_specs = [
            (prompt, LLM_HEALTH_CHECK_MAX_TOKENS),
            ("Answer with a single word: OK", 128),
        ]
        last_result: dict[str, Any] | None = None

        for attempt_number, (attempt_prompt, max_tokens) in enumerate(attempt_specs, start=1):
            messages = [{"role": "user", "content": attempt_prompt}]
            started_at = time.perf_counter()
            response = None
            content: str | None = None
            finish_reason: str | None = None

            try:
                kwargs: dict[str, Any] = {
                    "model": model_name,
                    "messages": messages,
                    "max_tokens": max_tokens,
                    "api_key": config.api_key,
                    "api_base": _normalize_api_base(config.provider, config.api_base),
                    "timeout": LLM_TIMEOUT_HEALTH_CHECK,
                }
                if reasoning_effort:
                    kwargs["reasoning_effort"] = reasoning_effort

                response = await litellm.acompletion(**kwargs)
                choice = response.choices[0]
                finish_reason = _extract_finish_reason(choice)
                content = _extract_choice_text(choice)

                if not content:
                    message = response.choices[0].message
                    has_reasoning = getattr(message, "reasoning_content", None) or getattr(
                        message, "thinking", None
                    )
                    if not has_reasoning:
                        error = ValueError("LLM returned empty response")
                        _record_llm_attempt(
                            call_group_id=call_group_id,
                            attempt=attempt_number,
                            operation="llm_health_check",
                            request_kind="text",
                            messages=messages,
                            config=config,
                            model_name=model_name,
                            max_tokens=max_tokens,
                            temperature=None,
                            reasoning_effort=reasoning_effort,
                            json_mode=False,
                            started_at=started_at,
                            success=False,
                            content=content,
                            response=response,
                            finish_reason=finish_reason,
                            error=error,
                            extra_context={
                                "include_details": include_details,
                                "health_source": source,
                            },
                        )

                        last_result = {
                            "healthy": False,
                            "provider": config.provider,
                            "model": config.model,
                            "response_model": response.model if response else None,
                            "error_code": "empty_content",
                            "message": "LLM returned empty response",
                        }
                        if include_details:
                            last_result["test_prompt"] = _to_code_block(attempt_prompt)
                            last_result["model_output"] = _to_code_block(None)

                        if attempt_number < len(attempt_specs) and finish_reason == "length":
                            logging.warning(
                                "LLM health check returned empty content with finish_reason=length; retrying with a larger token budget",
                                extra={"provider": config.provider, "model": config.model},
                            )
                            continue

                        if source:
                            last_result["health_source"] = source
                        _store_cached_health_result(config, last_result)
                        return last_result

                _record_llm_attempt(
                    call_group_id=call_group_id,
                    attempt=attempt_number,
                    operation="llm_health_check",
                    request_kind="text",
                    messages=messages,
                    config=config,
                    model_name=model_name,
                    max_tokens=max_tokens,
                    temperature=None,
                    reasoning_effort=reasoning_effort,
                    json_mode=False,
                    started_at=started_at,
                    success=True,
                    content=content,
                    response=response,
                    finish_reason=finish_reason,
                    extra_context={
                        "include_details": include_details,
                        "health_source": source,
                    },
                )
                result = {
                    "healthy": True,
                    "provider": config.provider,
                    "model": config.model,
                    "response_model": response.model if response else None,
                }
                if include_details:
                    result["test_prompt"] = _to_code_block(attempt_prompt)
                    result["model_output"] = _to_code_block(content)
                if source:
                    result["health_source"] = source
                _store_cached_health_result(config, result)
                return result
            except Exception as e:
                _record_llm_attempt(
                    call_group_id=call_group_id,
                    attempt=attempt_number,
                    operation="llm_health_check",
                    request_kind="text",
                    messages=messages,
                    config=config,
                    model_name=model_name,
                    max_tokens=max_tokens,
                    temperature=None,
                    reasoning_effort=reasoning_effort,
                    json_mode=False,
                    started_at=started_at,
                    success=False,
                    content=content,
                    response=response,
                    finish_reason=finish_reason,
                    error=e,
                    extra_context={
                        "include_details": include_details,
                        "health_source": source,
                    },
                )
                logging.exception(
                    "LLM health check failed",
                    extra={"provider": config.provider, "model": config.model},
                )

                error_code = "health_check_failed"
                message = str(e)
                if "404" in message and "/v1/v1/" in message:
                    error_code = "duplicate_v1_path"
                elif "404" in message:
                    error_code = "not_found_404"
                elif "<!doctype html" in message.lower() or "<html" in message.lower():
                    error_code = "html_response"

                last_result = {
                    "healthy": False,
                    "provider": config.provider,
                    "model": config.model,
                    "error_code": error_code,
                }
                if include_details:
                    last_result["test_prompt"] = _to_code_block(attempt_prompt)
                    last_result["model_output"] = _to_code_block(None)
                    last_result["error_detail"] = _to_code_block(message)
                if attempt_number >= len(attempt_specs):
                    if source:
                        last_result["health_source"] = source
                    _store_cached_health_result(config, last_result)
                    return last_result

        return last_result or {
            "healthy": False,
            "provider": config.provider,
            "model": config.model,
            "error_code": "health_check_failed",
        }


async def complete(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    temperature: float = 0.7,
    operation: str = "text_completion",
    metadata: dict[str, Any] | None = None,
) -> str:
    """Make a completion request to the LLM.

    Transport retries (429, 500, timeout) are handled by the Router.
    """
    router, config = get_router(config)
    model_name = get_model_name(config)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": prompt})
    call_group_id = str(uuid4())
    applied_temperature: float | None = None
    reasoning_effort: str | None = None
    started_at = time.perf_counter()
    response = None
    content: str | None = None
    finish_reason: str | None = None

    try:
        kwargs: dict[str, Any] = {
            "model": "primary",
            "messages": messages,
            "max_tokens": max_tokens,
            "timeout": LLM_TIMEOUT_COMPLETION,
        }
        if _supports_temperature(config.provider, model_name):
            kwargs["temperature"] = temperature
            applied_temperature = temperature
        reasoning_effort = _get_reasoning_effort(config.provider, model_name)
        if reasoning_effort:
            kwargs["reasoning_effort"] = reasoning_effort

        response = await router.acompletion(**kwargs)

        choice = response.choices[0]
        finish_reason = _extract_finish_reason(choice)
        content = _extract_choice_text(choice)
        if not content:
            raise ValueError("Empty response from LLM")
        # Strip thinking tags from reasoning models (deepseek-r1, qwq, etc.)
        if "<think>" in content:
            content = _strip_thinking_tags(content)
            if not content:
                raise ValueError("Response contained only thinking content, no output")
        _record_llm_attempt(
            call_group_id=call_group_id,
            attempt=1,
            operation=operation,
            request_kind="text",
            messages=messages,
            config=config,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=applied_temperature,
            reasoning_effort=reasoning_effort,
            json_mode=False,
            started_at=started_at,
            success=True,
            content=content,
            response=response,
            finish_reason=finish_reason,
            extra_context=metadata,
        )
        return content
    except Exception as e:
        _record_llm_attempt(
            call_group_id=call_group_id,
            attempt=1,
            operation=operation,
            request_kind="text",
            messages=messages,
            config=config,
            model_name=model_name,
            max_tokens=max_tokens,
            temperature=applied_temperature,
            reasoning_effort=reasoning_effort,
            json_mode=False,
            started_at=started_at,
            success=False,
            content=content,
            response=response,
            finish_reason=finish_reason,
            error=e,
            extra_context=metadata,
        )
        # Log the actual error server-side for debugging
        logging.error(f"LLM completion failed: {e}", extra={
                      "model": model_name})
        raise ValueError(
            "LLM completion failed. Please check your API configuration and try again."
        ) from e


def _supports_json_mode(model_name: str) -> bool:
    """Check if the model supports JSON mode via LiteLLM's model registry.

    Queries LiteLLM's model info for every provider (including openai,
    anthropic, etc.) so that capability is always determined from the
    registry rather than a hardcoded provider list.

    Ollama models support JSON mode natively (format="json") but are
    often not in LiteLLM's registry (custom/local models), so we
    always return True for ollama.

    Args:
        model_name: LiteLLM-formatted model name (from get_model_name).
    """
    # Ollama supports JSON mode natively via format="json" even when
    # models aren't in LiteLLM's registry (custom, quantized, etc.)
    if model_name.startswith(("ollama/", "ollama_chat/")):
        return True

    try:
        info = litellm.get_model_info(model=model_name)
        supported_params = info.get("supported_openai_params", [])
        return "response_format" in supported_params
    except Exception:
        # Model not in LiteLLM's registry — fall back to prompt-only JSON
        # mode (the system prompt already instructs "respond with valid JSON
        # only"). This avoids sending response_format to models that may
        # reject it.
        logging.debug("Model %s not in LiteLLM registry, skipping JSON mode", model_name)
        return False


def _appears_truncated(data: dict) -> bool:
    """LLM-001: Check if JSON data appears to be truncated.

    Detects suspicious patterns indicating incomplete responses.
    """
    if not isinstance(data, dict):
        return False

    # Check for empty arrays that should typically have content
    suspicious_empty_arrays = ["workExperience", "education", "skills"]
    for key in suspicious_empty_arrays:
        if key in data and data[key] == []:
            # Log warning - these are rarely empty in real resumes
            logging.warning(
                "Possible truncation detected: '%s' is empty",
                key,
            )
            return True

    # personalInfo is intentionally excluded: the improve prompts tell the LLM
    # to skip it, and _preserve_personal_info() restores it from the original.
    # Checking for it here caused 3 wasteful retry attempts on every request.

    return False


def _get_retry_temperature(attempt: int, base_temp: float = 0.1) -> float:
    """LLM-002: Get temperature for retry attempt - increases with each retry.

    Higher temperature on retries gives the model more variation to produce
    different (hopefully valid) output.
    """
    temperatures = [base_temp, 0.3, 0.5, 0.7]
    return temperatures[min(attempt, len(temperatures) - 1)]


def _calculate_timeout(
    operation: str,
    max_tokens: int = 4096,
    provider: str = "openai",
) -> int:
    """LLM-005: Calculate adaptive timeout based on operation and parameters."""
    base_timeouts = {
        "health_check": LLM_TIMEOUT_HEALTH_CHECK,
        "completion": LLM_TIMEOUT_COMPLETION,
        "json": LLM_TIMEOUT_JSON,
    }

    base = base_timeouts.get(operation, LLM_TIMEOUT_COMPLETION)

    # Scale by token count (relative to 4096 baseline)
    token_factor = max(1.0, max_tokens / 4096)

    # Provider-specific latency adjustments
    provider_factors = {
        "openai": 1.0,
        "anthropic": 1.2,
        "openrouter": 1.5,  # More variable latency
        "ollama": 2.0,  # Local models can be slower
    }
    provider_factor = provider_factors.get(provider, 1.0)

    return int(base * token_factor * provider_factor)


def _strip_thinking_tags(content: str) -> str:
    """Strip thinking/reasoning tags from model output.

    Ollama thinking models (deepseek-r1, qwq, etc.) wrap their reasoning
    in <think>...</think> tags. The actual answer follows after the closing
    tag. Strip these so JSON extraction finds the real output.
    """
    # Remove <think>...</think> blocks (including multiline)
    stripped = re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL)
    # Also handle unclosed <think> tag (model may still be "thinking" at end)
    stripped = re.sub(r"<think>.*", "", stripped, flags=re.DOTALL)
    return stripped.strip()


def _extract_json(content: str, _depth: int = 0) -> str:
    """Extract JSON from LLM response, handling various formats.

    LLM-001: Improved to detect and reject likely truncated JSON.
    LLM-007: Improved error messages for debugging.
    JSON-010: Added recursion depth and size limits.
    """
    # JSON-010: Safety limits
    if _depth > MAX_JSON_EXTRACTION_RECURSION:
        raise ValueError(
            f"JSON extraction exceeded max recursion depth: {_depth}")
    if len(content) > MAX_JSON_CONTENT_SIZE:
        raise ValueError(
            f"Content too large for JSON extraction: {len(content)} bytes")

    original = content

    # Strip thinking model tags (deepseek-r1, qwq, etc.)
    if "<think>" in content:
        content = _strip_thinking_tags(content)

    # Remove markdown code blocks
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        parts = content.split("```")
        if len(parts) >= 2:
            content = parts[1]
            # Remove language identifier if present (e.g., "json\n{...")
            if content.startswith(("json", "JSON")):
                content = content[4:]

    content = content.strip()

    # If content starts with {, find the matching }
    if content.startswith("{"):
        depth = 0
        end_idx = -1
        in_string = False
        escape_next = False

        for i, char in enumerate(content):
            if escape_next:
                escape_next = False
                continue
            if char == "\\":
                escape_next = True
                continue
            if char == '"' and not escape_next:
                in_string = not in_string
                continue
            if in_string:
                continue
            if char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end_idx = i
                    break

        # LLM-001: Check for unbalanced braces - loop ended without depth reaching 0
        if end_idx == -1 and depth != 0:
            logging.warning(
                "JSON extraction found unbalanced braces (depth=%d), possible truncation",
                depth,
            )

        if end_idx != -1:
            return content[: end_idx + 1]

    # Try to find JSON object in the content (only if not already at start)
    start_idx = content.find("{")
    if start_idx > 0:
        # Only recurse if { is found after position 0 to avoid infinite recursion
        return _extract_json(content[start_idx:], _depth + 1)

    # LLM-007: Log unrecognized format for debugging
    logging.error(
        "Could not extract JSON from response format. Content preview: %s",
        content[:200] if content else "<empty>",
    )
    raise ValueError(f"No JSON found in response: {original[:200]}")


async def complete_json(
    prompt: str,
    system_prompt: str | None = None,
    config: LLMConfig | None = None,
    max_tokens: int = 4096,
    retries: int = 2,
    operation: str = "json_completion",
    metadata: dict[str, Any] | None = None,
    retry_hint: str | None = None,
) -> dict[str, Any]:
    """Make a completion request expecting JSON response.

    Uses JSON mode when available, with app-level retries for content-quality
    issues (malformed JSON, truncation).  Transport retries (429, 500, timeout)
    are handled by the Router and are NOT retried again here.
    """
    router, config = get_router(config)
    model_name = get_model_name(config)

    # Build messages
    json_system = (
        system_prompt or ""
    ) + "\n\nYou must respond with valid JSON only. No explanations, no markdown."
    messages = [
        {"role": "system", "content": json_system},
        {"role": "user", "content": prompt},
    ]

    # Check if we can use JSON mode
    use_json_mode = _supports_json_mode(model_name)
    call_group_id = str(uuid4())
    generic_retry_hint = (
        retry_hint
        or "Output the COMPLETE JSON object with all required sections. "
        "Start with { and end with }. Do not truncate."
    )

    for attempt in range(retries + 1):
        started_at = time.perf_counter()
        response = None
        content: str | None = None
        finish_reason: str | None = None
        applied_temperature: float | None = None
        reasoning_effort: str | None = None
        try:
            kwargs: dict[str, Any] = {
                "model": "primary",
                "messages": messages,
                "max_tokens": max_tokens,
                "timeout": _calculate_timeout("json", max_tokens, config.provider),
            }
            if _supports_temperature(config.provider, model_name):
                # LLM-002: Increase temperature on retry for variation
                applied_temperature = _get_retry_temperature(attempt)
                kwargs["temperature"] = applied_temperature
            reasoning_effort = _get_reasoning_effort(
                config.provider, model_name)
            if reasoning_effort:
                kwargs["reasoning_effort"] = reasoning_effort

            # Add JSON mode if supported
            if use_json_mode:
                kwargs["response_format"] = {"type": "json_object"}

            response = await router.acompletion(**kwargs)
            choice = response.choices[0]
            finish_reason = _extract_finish_reason(choice)
            content = _extract_choice_text(choice)

            if not content:
                raise ValueError("Empty response from LLM")

            logging.debug(
                f"LLM response (attempt {attempt + 1}): {content[:300]}")

            # Extract and parse JSON
            json_str = _extract_json(content)
            result = json.loads(json_str)

            # LLM-001: Check if parsed result appears truncated
            if isinstance(result, dict) and _appears_truncated(result):
                if attempt < retries:
                    error = ValueError("Parsed JSON appears truncated")
                    _record_llm_attempt(
                        call_group_id=call_group_id,
                        attempt=attempt + 1,
                        operation=operation,
                        request_kind="json",
                        messages=messages,
                        config=config,
                        model_name=model_name,
                        max_tokens=max_tokens,
                        temperature=applied_temperature,
                        reasoning_effort=reasoning_effort,
                        json_mode=use_json_mode,
                        started_at=started_at,
                        success=False,
                        content=content,
                        response=response,
                        finish_reason=finish_reason,
                        error=error,
                        extra_context=metadata,
                    )
                    logging.warning(
                        "Parsed JSON appears truncated (attempt %d/%d), retrying",
                        attempt + 1,
                        retries + 1,
                    )
                    messages[-1]["content"] = (
                        prompt
                        + "\n\nIMPORTANT: "
                        + generic_retry_hint
                    )
                    continue
                logging.warning(
                    "Parsed JSON appears truncated on final attempt, proceeding with result"
                )

            _record_llm_attempt(
                call_group_id=call_group_id,
                attempt=attempt + 1,
                operation=operation,
                request_kind="json",
                messages=messages,
                config=config,
                model_name=model_name,
                max_tokens=max_tokens,
                temperature=applied_temperature,
                reasoning_effort=reasoning_effort,
                json_mode=use_json_mode,
                started_at=started_at,
                success=True,
                content=content,
                response=response,
                finish_reason=finish_reason,
                extra_context=metadata,
            )
            return result

        except json.JSONDecodeError as e:
            _record_llm_attempt(
                call_group_id=call_group_id,
                attempt=attempt + 1,
                operation=operation,
                request_kind="json",
                messages=messages,
                config=config,
                model_name=model_name,
                max_tokens=max_tokens,
                temperature=applied_temperature,
                reasoning_effort=reasoning_effort,
                json_mode=use_json_mode,
                started_at=started_at,
                success=False,
                content=content,
                response=response,
                finish_reason=finish_reason,
                error=e,
                extra_context=metadata,
            )
            # Content quality — malformed JSON, retry with prompt hint
            logging.warning(f"JSON parse failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                messages[-1]["content"] = (
                    prompt
                    + "\n\nIMPORTANT: "
                    + generic_retry_hint
                )
                continue
            raise ValueError(
                f"Failed to parse JSON after {retries + 1} attempts: {e}")

        except ValueError as e:
            _record_llm_attempt(
                call_group_id=call_group_id,
                attempt=attempt + 1,
                operation=operation,
                request_kind="json",
                messages=messages,
                config=config,
                model_name=model_name,
                max_tokens=max_tokens,
                temperature=applied_temperature,
                reasoning_effort=reasoning_effort,
                json_mode=use_json_mode,
                started_at=started_at,
                success=False,
                content=content,
                response=response,
                finish_reason=finish_reason,
                error=e,
                extra_context=metadata,
            )
            # Content quality — empty response, JSON extraction failure
            logging.warning(f"Content extraction failed (attempt {attempt + 1}): {e}")
            if attempt < retries:
                messages[-1]["content"] = (
                    prompt
                    + "\n\nIMPORTANT: "
                    + generic_retry_hint
                )
                continue
            raise

        except Exception as e:
            _record_llm_attempt(
                call_group_id=call_group_id,
                attempt=attempt + 1,
                operation=operation,
                request_kind="json",
                messages=messages,
                config=config,
                model_name=model_name,
                max_tokens=max_tokens,
                temperature=applied_temperature,
                reasoning_effort=reasoning_effort,
                json_mode=use_json_mode,
                started_at=started_at,
                success=False,
                content=content,
                response=response,
                finish_reason=finish_reason,
                error=e,
                extra_context=metadata,
            )
            # Transport errors — Router already retried with backoff.
            # Cooldowns are disabled (see _build_router); no additional
            # retry is attempted here.
            raise

    raise ValueError(f"Failed after {retries + 1} attempts")
