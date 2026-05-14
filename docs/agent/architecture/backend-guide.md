# Backend Guide

> Where to make changes, depending on the task.

## If You Are Changing...

### Prompt text or prompt selection

Touch:

- `apps/backend/app/prompts/text/` (shipped `.txt` prompts), `tailoring_blocks.py`, `tailor_resume_full.py`, `parse_resume.py`, `extract_jd_intel.py`, `cover_letter.py`, and related modules (see `app/prompts/__init__.py`)
- `apps/backend/app/prompts/enrichment.py`
- `apps/backend/app/prompts/refinement.py` if you are changing the older inactive refinement prompt or local cleanup constants
- `apps/backend/app/services/tailoring/*`
- `apps/backend/app/services/improver.py` only if the compatibility exports need to change
- `apps/backend/app/services/cover_letter.py` for auxiliary text prompts
- `apps/backend/app/routers/config.py`

Also update:

- `docs/agent/llm-prompt-inventory.md`
- any affected API docs if request or config behavior changed

### LLM call behavior

Touch:

- `apps/backend/app/llm.py`
- the caller in `services/*` or `routers/enrichment.py`

Rules:

- keep a stable `operation` string
- pass useful `metadata`
- use `llm_trace_scope()` in top-level request flows
- if the output is bounded plain text, prefer `complete()` with a caller-specific `retry_hint`

### SQL schema or persistence

Touch:

- `apps/backend/app/db/models.py`
- `apps/backend/app/db/repositories/*`
- `apps/backend/app/database.py`
- a new Alembic revision in `apps/backend/alembic/versions/`

Do not add new persistence only to `app/database.py` without updating the SQL model layer.

### Resume tailoring flow

Touch:

- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/services/tailoring/*`
- `apps/backend/app/services/improver.py` only as a compatibility facade
- `apps/backend/app/services/refiner.py`
- `apps/backend/app/services/cover_letter.py`
- `apps/backend/app/services/section_metadata.py`

Important current behavior:

- one primary `resume_generate_full` tailoring call returns a compact addressed diff
- compact typed tailoring payload plus a JSON response contract in the prompt
- `personalInfo` and `sectionMeta` are excluded from the tailoring LLM contract
- `education` is also locally preserved rather than edited by the tailoring LLM
- full-mode critique/rewrite is optional and controlled by `/api/v1/config/critique`
- compact-diff validation is observability-only and is attached to `llm_calls.request_context.compact_diff_validation`
- local cleanup and verification after tailoring
- local restoration of `personalInfo`, `sectionMeta`, dates, additional items, and custom sections
- local diff generation for preview UI
- change manifests, stage breakdowns, bold keywords, and skills observability are generated/persisted with preview/confirm runs
- preview/confirm hash validation for application packs

### Cover letter or outreach generation

Touch:

- `apps/backend/app/services/cover_letter.py`
- `apps/backend/app/services/message_profiles.py`
- `apps/backend/app/services/prompt_utils.py`
- `apps/backend/app/prompts/cover_letter.py` (system prompts for cover + outreach)

Important current behavior:

- cover letter/outreach are generated on demand after a tailored resume exists, not during the Tailor preview/confirm path
- `generate-auxiliary-package`, `generate-cover-letter`, and `generate-outreach` all use one merged LLM call and persist both generated fields
- cover letter and outreach use compact prompt payloads, not the full stored resume JSON
- plain-text generation is protected by truncation-aware retries in `complete()`
- title derivation is local from extracted job metadata, not a separate LLM prompt

### RenderCV output or theme behavior

Touch:

- `apps/backend/app/rendering/rendercv_adapter.py`
- `apps/backend/app/rendering/rendercv_engine.py`
- `apps/backend/app/rendering/theme_profiles.py`
- `apps/backend/app/services/artifact_service.py`

Coordinate with frontend:

- `apps/frontend/lib/types/render-theme.ts`
- `apps/frontend/components/rendercv/*`

### Draft normalization or raw YAML

Touch:

- `apps/backend/app/rendering/rendercv_adapter.py`
- `apps/backend/app/routers/resumes.py`
- `apps/frontend/components/builder/raw-yaml-editor.tsx`
- `apps/frontend/components/builder/resume-builder.tsx`

## Common Gotchas

- `app/database.py` is not the schema source of truth.
- resume PDFs come from RenderCV, not Playwright.
- cover-letter PDFs still come from Playwright.
- `additional.groups` is canonical even if older resumes still deserialize from legacy keys.
- `sectionMeta` is canonical for UI/rendering, but it is rehydrated locally and should not be added back into LLM prompt contracts.
- enrichment flows currently call LLMs directly from the router layer.

## Job Description Storage (Training Data)

Every JD pasted into the app is stored in the `jobs` table automatically — no UI action required. The table captures everything needed to build training pairs later:

| Field | Purpose |
|---|---|
| `content` | Raw JD text as pasted |
| `content_hash` | SHA-256 of whitespace-normalised text — use to deduplicate identical pastes in queries |
| `char_count` | Length of raw `content` — filter trivially short/invalid JDs without loading text |
| `job_keywords` | Extracted JD intelligence JSON (populated on first tailoring run) |
| `company`, `role`, `location` | Metadata extracted at upload time |

The full training triple `(jd_text, original_resume, tailored_resume)` is queryable by joining:

```sql
SELECT
  j.content          AS jd_text,
  j.job_keywords     AS jd_intel,
  r_src.processed_data AS original_resume,
  r_tail.processed_data AS tailored_resume
FROM generation_runs gr
JOIN jobs j         ON gr.job_id             = j.job_id
JOIN resumes r_src  ON gr.source_resume_id   = r_src.resume_id
JOIN resumes r_tail ON gr.tailored_resume_id = r_tail.resume_id
WHERE gr.status     = 'completed'
  AND j.char_count  > 200
ORDER BY gr.created_at DESC;
```

No UI is exposed for JD storage — it is silent and automatic. To query the raw DB: `apps/backend/data/` holds the SQLite file (default path from `settings.DATABASE_URL`).
