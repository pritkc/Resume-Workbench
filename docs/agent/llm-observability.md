# LLM Observability

> How request traces, call records, and the `/llm-traces` page fit together.

## Storage

LLM attempts persist to the `llm_calls` table introduced by Alembic revision `0002_llm_observability`.

Core fields:

- `trace_id`: request-level grouping id
- `call_group_id`: groups retries for one logical completion call
- `request_scope`: coarse flow label such as `resumes.improve_preview`
- `operation`: task label such as `resume_generate_full`
- `success`, `attempt`, `finish_reason`, `latency_ms`
- token usage, estimated token counts, and estimated costs
- `prompt_preview` and `response_preview`
- `request_context`

## Trace Context

Top-level routes wrap nested LLM work with `llm_trace_scope(trace_id, request_scope, metadata)`.

Current request scopes in active resume flows:

- `resumes.upload`
- `resumes.retry_processing`
- `resumes.improve_preview`
- `resumes.improve`
- `application_packs.questions.answer`

Confirm currently does not run LLM work and does not set a route-level trace scope. Enrichment and on-demand cover-letter/outreach calls emit `operation` data, but they do not yet set a route-level `request_scope`.

## API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/llm/calls` | list call records with filters |
| `GET /api/v1/llm/calls/summary` | aggregate tokens, cost, and per-operation totals |
| `GET /api/v1/llm/runs/timing` | list generation-run timing summaries |
| `GET /api/v1/llm/runs/timing-detailed` | list generation-run timing with detailed entries |

Supported filters on `GET /llm/calls`:

- `trace_id`
- `call_group_id`
- `request_scope`
- `operation`
- `success`
- `limit`

## Frontend UI

`/llm-traces` is the internal viewer for:

- newest system-wide calls
- one request scope
- one end-to-end trace

The Tailor flow links into it from the application-pack panel with the preview request id.

## Preview Storage Rules

Prompt and response previews are controlled by config settings:

- `LLM_TRACE_ENABLED`
- `LLM_TRACE_STORE_CONTENT`
- `LLM_TRACE_PREVIEW_CHARS`
- `LLM_NEAR_LIMIT_RATIO`
- optional cost overrides:
  - `LLM_COST_INPUT_PER_MILLION_TOKENS`
  - `LLM_COST_OUTPUT_PER_MILLION_TOKENS`

If content storage is disabled, previews will be empty even though call metadata is still recorded.

## Debugging Recipes

### One broken tailor preview

1. capture the `request_id` returned by preview
2. open `/llm-traces?trace_id=<request_id>&request_scope=resumes.improve_preview`
3. inspect:
   - `extract_jd_intel_output` (stores arbitrary JD JSON on the job; shape follows `extract_jd_intel` prompts; same name as **`$extract_jd_intel_output`** in tailoring user templates — see `apps/backend/app/prompts/text/README.md`; legacy traces may show `job_extract_keywords`)
   - `resume_generate_full` (primary compact diff; `request_context.compact_diff_validation` may be attached to this row)
   - optional `critique_resume` and `rewrite_resume` when full-mode critique is enabled (`rewrite_resume` can also get `compact_diff_validation`)

The Tailor preview/confirm path does **not** generate cover letter or outreach today. Those traces appear only after the builder calls one of the explicit auxiliary-generation endpoints, and they normally have `operation=cover_letter_outreach_generate` without a route-level request scope.

Historical traces from older runs may still show:

- `resume_generate_diffs`
- `resume_refine_keyword_injection`
- older text-generation rows (legacy operation names) that were marked successful even with `finish_reason=length` before the truncation-safe `complete()` fix

### Prompt-specific regressions

Filter by:

- `operation=resume_generate_full`
- `request_scope=resumes.improve_preview` or `resumes.improve`

Then compare `request_context.prompt_id`.

### Empty or truncated model output

Check:

- `finish_reason`
- `max_tokens`
- `usage_output_tokens`
- warnings about near-limit output
- prompt/response previews for malformed JSON or truncated sections

Current behavior to remember:

- `complete_json()` retries malformed or truncated JSON at the app layer.
- `complete()` now retries bounded plain-text prompts that hit the output ceiling and raises if the final result is still truncated.
- For cover letter / outreach traces, `request_context` may include compact-payload hints such as trimmed JD chars and candidate-profile chars.
