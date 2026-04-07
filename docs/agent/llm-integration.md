# LLM Integration Guide

> How the live LiteLLM layer, prompt selection, and trace persistence work today.

## Core Files

| File | Responsibility |
|------|----------------|
| `apps/backend/app/llm.py` | LiteLLM router, health checks, retries, JSON extraction, trace persistence |
| `apps/backend/app/config.py` | runtime settings, API-key fallback, trace/cost knobs |
| `apps/backend/app/prompts/templates.py` | core parse/tailor/cover-letter/outreach prompts plus job metadata extraction |
| `apps/backend/app/prompts/enrichment.py` | enrichment and regenerate prompts |
| `apps/backend/app/prompts/refinement.py` | older refinement prompt plus local cleanup constants; not part of the active tailoring runtime |

## Provider Configuration

The backend supports:

- `openai`
- `anthropic`
- `openrouter`
- `gemini`
- `deepseek`
- `ollama`

Configuration is resolved from:

1. env-backed settings defaults
2. `apps/backend/data/config.json`
3. provider-specific API-key storage in `config.json["api_keys"]`
4. request updates through `/api/v1/config/llm-api-key` and `/api/v1/config/api-keys`

## Router Model

`app/llm.py` builds and caches a single LiteLLM `Router` keyed by provider/model/api-key/api-base fingerprint.

Current retry policy:

- auth errors: no retry
- bad requests: no retry
- timeouts: retry
- rate limits: retry
- internal server errors: retry

`_normalize_api_base()` also strips duplicated `/v1` segments for providers where LiteLLM appends them internally.

## Completion APIs

`complete()`

- text output
- uses the cached Router
- suppresses `temperature` for GPT-5-family models
- injects `reasoning_effort="minimal"` for GPT-5-family models
- retries text responses that hit `finish_reason=length` or otherwise come back incomplete
- supports caller-specific `retry_hint` text and retry token budgets for bounded plain-text prompts
- raises instead of silently returning truncated partial text on final failure

`complete_json()`

- appends a JSON-only system instruction
- enables `response_format={"type": "json_object"}` when the target model supports it
- retries malformed or truncated content at the application layer
- supports prompt-specific `retry_hint` text so retries reinforce the exact JSON contract for that caller
- records every attempt in `llm_calls`

## JSON Handling

`complete_json()` currently does all of the following:

- strips code fences and `<think>` tags
- extracts the first balanced JSON object from mixed output
- rejects obviously truncated responses
- retries parse/extraction failures with a caller-provided hint when available
- uses adaptive timeouts based on provider and `max_tokens`

## Health Checks

`check_llm_health()`:

- uses direct LiteLLM completion, not the shared Router path
- caches successful and failed health results by provider/model/key/base fingerprint
- stores health-check attempts in `llm_calls`
- refreshes the cached snapshot used by `/api/v1/health` and `/api/v1/status`
- powers explicit connection tests through `/api/v1/config/llm-test`

## Observability

Every successful or failed LLM attempt can persist:

- `trace_id`
- `call_group_id`
- `request_scope`
- `operation`
- prompt and response previews
- token usage and fallback estimates
- estimated costs
- retry attempt number and finish reason

Top-level flows attach request context with `llm_trace_scope()`. See [llm-observability.md](llm-observability.md).

## Prompt Selection

Only the resume-tailoring strategy is currently runtime-configurable:

- `nudge`
- `keywords`
- `full`

Selection precedence:

1. request-level `prompt_id`
2. saved generation defaults
3. saved global default prompt
4. fallback constant `DEFAULT_IMPROVE_PROMPT_ID`

See [llm-prompt-inventory.md](llm-prompt-inventory.md) for the full prompt map.

## Tailoring Runtime Today

The active tailoring path is now:

1. `job_extract_keywords`
2. `resume_generate_full`
3. local cleanup and validation
4. local diff generation for preview UI
5. optional cover letter / outreach generation with compact candidate-profile prompt payloads

Notably, the active runtime no longer does:

- `resume_generate_diffs`
- diff-first fallback orchestration
- LLM keyword-injection refinement after tailoring

## Current Guidance For New LLM Work

- Put reusable prompt text in `app/prompts/`.
- Use `complete_json()` for structured outputs and `complete()` for plain text.
- Keep prompt payloads compact and typed. Do not pass full stored resume blobs to text-generation prompts unless there is a strong reason.
- Always set a stable `operation` name.
- Pass useful `metadata` so traces are debuggable.
- If the JSON contract is strict or caller-specific, pass a `retry_hint`.
- If the text output must be short and complete, also pass a caller-specific `retry_hint` and consider a bounded `retry_max_tokens`.
- If the call is part of a top-level request flow, make sure it runs inside an appropriate `llm_trace_scope()`.
