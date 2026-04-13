# Phase 3.6.1 - Local CLI Calls Plan (Codex CLI + Claude Code + Gemini CLI)

**Date:** 2026-04-13 (America/Los_Angeles)  
**Status:** Design plan (implementation-ready)  
**Intent:** local/manual workflow, fast provider/model switching, isolated from main API path

## 1) Goals

- Use installed CLIs instead of direct LLM APIs for JD-heavy manual runs.
- Support all three CLIs:
  - Codex CLI (`codex`)
  - Claude Code CLI (`claude`)
  - Gemini CLI (`gemini`)
- Add a dropdown-based UX for mode/provider/model switching.
- Keep the existing API flow untouched by default.
- Keep compliance-first controls (no hidden account sharing tricks, no rate-limit bypass behavior).

## 2) Non-Goals

- No automatic multi-account rotation.
- No “unlimited”/relay behavior that could violate platform terms.
- No hard dependency on any third-party proxy for core operation.

## 3) Current Platform Leverage (avoid complexity)

Existing foundation already strong:
- Single LLM gateway: [apps/backend/app/llm.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/llm.py)
- Existing provider/model/settings UI: [apps/frontend/app/(default)/settings/page.tsx](/Users/pritchakalasiya/Development/resume-workk/apps/frontend/app/(default)/settings/page.tsx)
- Existing tracing + operation tags + metadata
- Existing JD call sites keep calling `complete_json()` (no router/service rewrites needed)

Design choice: keep current `provider` + `model` fields, add one execution-mode layer instead of exploding provider matrix.

## 4) Architecture (Recommended)

### 4.1 Add execution mode, not new provider sprawl

Add config field:
- `execution_mode`: `api` (default) | `cli_direct` | `proxy_api` (optional, experimental)

Keep existing provider choices:
- `openai`, `anthropic`, `gemini`, `openrouter`, `deepseek`, `ollama`

CLI mapping (when `execution_mode=cli_direct`):
- `provider=openai` -> `codex`
- `provider=anthropic` -> `claude`
- `provider=gemini` -> `gemini`
- other providers disabled in CLI mode (clear UI hint)

This preserves existing backend contracts and minimizes migration risk.

### 4.2 Isolated transport layer

Create transport abstraction in backend:
- `LiteLLMTransport` (existing path)
- `CLIDirectTransport` (new, isolated)
- optional `ProxyAPITransport` (later, behind flag)

`complete()` / `complete_json()` choose transport by `execution_mode`, but keep:
- same operation names
- same metadata/tracing
- same JSON extraction/retry contract

### 4.3 CLI runner module

Add dedicated module (example):
- `apps/backend/app/llm_cli_runner.py`

Responsibilities:
- Build argv safely (`shell=False` only)
- Timeout + cancellation
- stdout/stderr capture
- normalized result object for both text/json calls
- provider-specific command builders
- no dangerous flags (`--dangerously-bypass-approvals-and-sandbox`, `--yolo`, etc.)

## 5) CLI command strategy

Use non-interactive forms only:
- Codex: `codex exec ...` (supports `--output-last-message` and `--json`)
- Claude: `claude -p ...` (supports `--output-format json`, `--model`)
- Gemini: `gemini ...` one-shot prompt + `--output-format json`, `--model`

Current local binaries discovered:
- `codex-cli 0.118.0`
- `Claude Code 2.1.7`
- `gemini 0.11.3`

## 6) Model Selection Dropdown (no hardcoding-first)

### 6.1 UX

Add to Settings:
- `Execution Mode` dropdown: `API` / `CLI Direct` / `Proxy API (Experimental)`
- Existing `Provider` dropdown reused
- New `Model` dropdown with text fallback

### 6.2 Model source priority

1. Provider-scoped user model presets (stored config)
2. Last-used model history (MRU list)
3. Optional static starter defaults (only fallback)

Avoid hardcoding large lists in code. Keep user-editable model catalog in config.

## 7) Fast Switching Throughout Day

Add “Quick Profiles” (small but high-impact):
- Profile = `{execution_mode, provider, model, optional api_base, optional cli flags profile}`
- One-click apply in settings (and optionally on tailor screen)
- Keep last N profile recents

This is better than editing model text repeatedly for 20-30 runs/day.

## 8) Output Handling Vertical (isolated, safer for debugging)

Implement configurable capture mode:
- `stdout` (default)
- `json_stream` (for CLIs supporting stream json)
- `artifact_file` (runner writes raw output to local artifact file, parser reads from file)

Why:
- easier forensic debugging for malformed JSON
- easier replay of failed calls without re-running model
- keeps core pipeline unchanged (parser consumes normalized text/json)

## 9) ToS/Compliance-by-Design Controls

Important truth: “100% ToS compatible” requires legal review and provider policy changes over time.  
Engineering target: strongest practical compliance controls + explicit policy gates.

### 9.1 Required controls

- No account credential sharing in app logic.
- No automated multi-account load balancing/rotation.
- No rate-limit bypass logic.
- No “resell/lease access” behavior.
- Clear operator ownership: user authenticates each official CLI directly.
- Data controls:
  - keep prompt sanitization and JD trimming
  - optional disable trace content for sensitive runs (`llm_trace_store_content=false`)
  - redact secrets in stored command metadata

### 9.2 Policy gate in product

Add `compliance_ack` requirement when enabling CLI mode:
- “I confirm this workspace uses official accounts and follows provider terms.”

Block risky combinations:
- `cli_direct` + multi-account mode (if added later) -> reject
- `cli_direct` + dangerous CLI auto-approval flags -> reject

## 10) Concrete File-Level Plan

Backend:
- [apps/backend/app/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/config.py)
  - add `execution_mode` and CLI options (`cli_timeout_seconds`, `cli_workdir_policy`, optional command overrides)
- [apps/backend/app/schemas/models.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py)
  - extend config request/response for new settings + model preset/profile payloads
- [apps/backend/app/routers/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/config.py)
  - persist/read new fields
- [apps/backend/app/llm.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/llm.py)
  - transport selection, keep trace semantics
- `apps/backend/app/llm_cli_runner.py` (new)
  - subprocess execution + normalization
- [apps/backend/app/routers/health.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/health.py)
  - mark CLI mode configured when CLI health check passes

Frontend:
- [apps/frontend/lib/api/config.ts](/Users/pritchakalasiya/Development/resume-workk/apps/frontend/lib/api/config.ts)
  - add new settings types + quick profile types
- [apps/frontend/app/(default)/settings/page.tsx](/Users/pritchakalasiya/Development/resume-workk/apps/frontend/app/(default)/settings/page.tsx)
  - add execution mode dropdown, model dropdown, quick profiles UI, compliance toggle
- translations files for new labels/messages

Tests:
- config API tests for new fields
- llm transport unit tests (api vs cli_direct selection)
- JSON robustness tests for each CLI parser pathway
- end-to-end settings switch test + one preview generation per CLI provider

## 11) CLIProxyAPI Viability Check (vs Direct CLI Mode)

Reference: [CLIProxyAPI repo](https://github.com/router-for-me/CLIProxyAPI)

### 11.1 What is good

- Very fast integration path if treated as OpenAI-compatible endpoint.
- Could fit existing architecture with minimal code if using `api_base` + model aliases.
- Active project (large community footprint).

### 11.2 Risks / concerns

- Third-party relay in the middle of resume/JD data path (privacy + governance risk).
- Repo positioning strongly emphasizes multi-account pooling and unofficial “cost” channels; this is not a good default for strict compliance.
- Potential conflict with provider terms if used for credential sharing, resale, or quota circumvention patterns.
- Additional operational dependency (proxy uptime/version/security) for core generation path.

### 11.3 Recommendation

- **Primary path:** `cli_direct` using official CLIs and direct user auth.
- **Secondary path (optional):** `proxy_api` experimental toggle only, with explicit warning and separate compliance review.
- Do not make CLIProxyAPI the default for this app if ToS strictness is the priority.

## 12) Phased Rollout

1. Phase A (safe foundation)
   - add `execution_mode`, CLI runner, no UI yet (config file only)
   - verify JD preview flow for openai/anthropic/gemini mappings
2. Phase B (operator UX)
   - settings dropdowns + model presets + quick profiles
3. Phase C (vertical features)
   - artifact-file output mode
   - per-call replay/debug helper
4. Phase D (optional proxy)
   - `proxy_api` experimental mode and compatibility tests

## 13) Critical Feedback / Self-Critique

- If we add a brand-new provider enum (`codex_cli`, `claude_cli`, `gemini_cli`) we add avoidable complexity. Execution mode overlay is cleaner.
- Trying to auto-discover models from all CLIs at runtime is brittle. User-managed presets + last-used history is more reliable.
- “Local CLI” is not always “local model.” We should label this clearly in UI to avoid false privacy assumptions.
- CLIProxyAPI is attractive for speed, but compliance and data-boundary risk are materially higher than direct CLI.

## 14) Inputs Needed From You (only where required)

1. Do you want `proxy_api` included now or postponed to Phase D only?
2. Should we default CLI output capture to `stdout` or `artifact_file`?
3. Should quick profiles be global (all users) or local-per-machine config only?

## 15) Policy Anchors Reviewed

- OpenAI Services Agreement: account credentials, API key transfer, and rate-limit/usage-limit restrictions.
  - https://openai.com/policies/services-agreement/
- OpenAI Terms of Use (consumer): extraction and misuse restrictions.
  - https://openai.com/policies/terms-of-use/
- Anthropic Commercial Terms: restrictions on competing/resale/reverse-engineering; account responsibility.
  - https://www.anthropic.com/legal/commercial-terms
- Anthropic Consumer Terms: explicit prohibition on sharing account/API credentials.
  - https://www.anthropic.com/legal/consumer-terms
- Google APIs Terms: no circumvention of API limits; anti-abuse and reverse-engineering restrictions.
  - https://developers.google.com/terms
- Gemini API Additional Terms:
  - https://ai.google.dev/gemini-api/terms
- CLIProxyAPI repo reviewed:
  - https://github.com/router-for-me/CLIProxyAPI
