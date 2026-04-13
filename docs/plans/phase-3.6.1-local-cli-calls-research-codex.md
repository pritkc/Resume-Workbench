# Phase 3.6.1 - Local CLI Calls Research (Codex + Claude Code)

**Date:** 2026-04-12 (America/Los_Angeles)  
**Scope:** local experiment only (not for shipping yet)

## Current State (Need-To-Know)

- JD pipeline calls `complete_json()` in [apps/backend/app/llm.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/llm.py).
- Key manual JD operations currently routed via LiteLLM:
  - `resume_parse_json` in [apps/backend/app/services/parser.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/parser.py)
  - `job_extract_keywords` in [apps/backend/app/services/tailoring/analysis.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/analysis.py)
  - `resume_generate_full` in [apps/backend/app/services/tailoring/orchestration.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/orchestration.py)
- Config + health currently assume API-key providers (except `ollama`) in:
  - [apps/backend/app/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/config.py)
  - [apps/backend/app/routers/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/config.py)
  - [apps/backend/app/routers/health.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/health.py)

## Recommended Experiment Design

Use a new provider mode: `provider = "local_cli"` and run CLI tools as subprocesses inside `complete()` / `complete_json()` (same call sites, minimal pipeline disruption).

### Backend changes (minimum)

1. Extend config model to support `local_cli`.
   - Add provider literal in [apps/backend/app/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/config.py).
   - Add optional fields in [apps/backend/app/schemas/models.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py):
     - `cli_backend`: `"codex"` or `"claude"`
     - `cli_command`: absolute path override
     - `cli_timeout_seconds`
2. Persist/load new fields in [apps/backend/app/routers/config.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/config.py).
3. Add CLI execution path in [apps/backend/app/llm.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/llm.py):
   - `asyncio.create_subprocess_exec(...)` only (`shell=False`).
   - Enforce timeout, capture stdout/stderr, map failures to `ValueError`.
   - Reuse existing JSON extraction (`_extract_json`) and trace recording (`_record_llm_attempt`).
4. Treat `local_cli` as "configured without API key" in:
   - [apps/backend/app/llm.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/llm.py)
   - [apps/backend/app/routers/health.py](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/health.py)

### Optional UI changes (if we want Settings support)

- Add provider in [apps/frontend/lib/api/config.ts](/Users/pritchakalasiya/Development/resume-workk/apps/frontend/lib/api/config.ts) and [apps/frontend/app/(default)/settings/page.tsx](/Users/pritchakalasiya/Development/resume-workk/apps/frontend/app/(default)/settings/page.tsx).
- Mark as no API key required (similar to `ollama` behavior).

## CLI Invocation Notes

- Available locally now:
  - `codex`: `/opt/homebrew/bin/codex` (`codex-cli 0.118.0`)
  - `claude`: `/opt/homebrew/bin/claude` (`2.1.7`)
- Suggested non-interactive forms:
  - Codex: `codex exec ...`
  - Claude: `claude -p ...`
- For JSON flows, pass strict JSON instruction and keep current parse/repair retries in backend.

## Terms/Conditions + Safety Guardrails

- Important: CLI tool does not automatically mean local model inference.
  - `codex` can be local only if explicitly configured for OSS/local provider.
  - `claude` CLI is typically cloud-backed.
- Keep this behind a local-only feature flag and do not enable in production.
- Keep human-in-the-loop invocation only (no unattended bulk automation).
- Keep existing prompt sanitization and JD trimming path intact.
- For sensitive data runs, consider disabling trace content storage (`llm_trace_store_content=false`) to avoid storing full resume/JD text.

## Validation Checklist

- `POST /api/v1/config/llm-test` passes in `local_cli` mode.
- `POST /api/v1/application-packs/preview` completes with local CLI provider.
- LLM traces still record `operation`, success/failure, and error context.
- Existing cloud providers continue to work unchanged.
