# Backend Guide

> Where to make changes, depending on the task.

## If You Are Changing...

### Prompt text or prompt selection

Touch:

- `apps/backend/app/prompts/templates.py`
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

- one primary `resume_generate_full` tailoring call
- compact typed tailoring payload plus a JSON response contract in the prompt
- `personalInfo` and `sectionMeta` are excluded from the tailoring LLM contract
- local cleanup and verification after tailoring
- local restoration of `personalInfo`, `sectionMeta`, dates, additional items, and custom sections
- local diff generation for preview UI
- preview/confirm hash validation for application packs

### Cover letter or outreach generation

Touch:

- `apps/backend/app/services/cover_letter.py`
- `apps/backend/app/services/message_profiles.py`
- `apps/backend/app/services/prompt_utils.py`
- `apps/backend/app/prompts/templates.py`

Important current behavior:

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
