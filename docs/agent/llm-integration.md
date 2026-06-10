# LLM Integration Guide

> How the live LiteLLM layer, prompt selection, and trace persistence work today.

## Core Files

| File | Responsibility |
|------|----------------|
| `apps/backend/app/llm.py` | LiteLLM router, health checks, retries, JSON extraction, trace persistence |
| `apps/backend/app/config.py` | runtime settings, API-key fallback, trace/cost knobs |
| `apps/backend/app/prompts/text/` | **Shipped** `.txt` prompt bodies (`{step}/system.txt` + `user.txt`, shared diff under `output_file_schema_rules/`) — see `text/README.md` |
| `apps/backend/app/prompts/*.py` | Step modules (`build_messages`, …) — see [llm-prompt-inventory.md](llm-prompt-inventory.md) |
| `apps/backend/app/prompts/__init__.py` | re-exports, valid steps, optional `prompt_overrides/` |
| `apps/backend/app/prompts/enrichment.py` | enrichment and regenerate prompts |
| `apps/backend/app/prompts/critique_resume.py`, `rewrite_resume.py` | optional full-mode critique/rewrite pass after the primary compact diff |
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

Per-step model overrides live in `config.json["model_overrides"]` and are exposed through
`/api/v1/config/model-overrides`. Values may be either `model` or `provider/model`.
The optional full-mode critique pass is controlled by `/api/v1/config/critique`
(`enable_critique`, default `true`).

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

The resume-tailoring strategy is runtime-configurable:

- `full`
- `lite`

(Defined in `IMPROVE_PROMPT_OPTIONS` in `app/prompts/_constants.py`.)

Selection precedence:

1. request-level `prompt_id`
2. saved generation defaults
3. saved global default prompt
4. fallback constant `DEFAULT_IMPROVE_PROMPT_ID`

See [llm-prompt-inventory.md](llm-prompt-inventory.md) for the full prompt map.

## Tailoring Runtime Today

The active tailoring path is now:

1. `extract_jd_intel_output` — returns arbitrary JSON cached as `job_keywords` (no typed `JDIntelligence` model); **`LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT`** in code
2. `resume_generate_full` — despite the operation name, both `full` and `lite` prompt modes return a compact addressed diff (`summary`, `experience`, `projects`, `skills`, `bold_keywords`)
3. non-fatal compact-diff validation; the latest matching `llm_calls.request_context` row gets `compact_diff_validation`
4. optional `critique_resume` then `rewrite_resume` when `prompt_id == "full"` and critique is enabled
5. apply the compact diff to the original resume locally, with a legacy full-body fallback for older/invalid outputs
6. local restoration, cleanup, low-signal filtering, description-count enforcement, and verification
7. local diff, change manifest, stage breakdown, skills observability, and RenderCV artifact generation for preview UI

Notably, the active runtime no longer does:

- `resume_generate_diffs`
- diff-first fallback orchestration
- LLM keyword-injection refinement after tailoring
- cover letter / outreach generation inside the Tailor preview or confirm path

Cover letter and outreach generation now happens on demand after a tailored resume exists:

- `POST /api/v1/resumes/{resume_id}/generate-auxiliary-package`
- `POST /api/v1/resumes/{resume_id}/generate-cover-letter`
- `POST /api/v1/resumes/{resume_id}/generate-outreach`

All three use the merged `cover_letter_outreach_generate` call and compact candidate-profile prompt payloads.

## Current Guidance For New LLM Work

- Put reusable shipped prompt text in `app/prompts/text/` (and shared fragments there); keep Python thin.
- Use `complete_json()` for structured outputs and `complete()` for plain text.
- Keep prompt payloads compact and typed. Do not pass full stored resume blobs to text-generation prompts unless there is a strong reason.
- Always set a stable `operation` name.
- Pass useful `metadata` so traces are debuggable.
- If the JSON contract is strict or caller-specific, pass a `retry_hint`.
- If the text output must be short and complete, also pass a caller-specific `retry_hint` and consider a bounded `retry_max_tokens`.
- If the call is part of a top-level request flow, make sure it runs inside an appropriate `llm_trace_scope()`.
