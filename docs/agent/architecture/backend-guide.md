# Backend Guide

> Where to make changes, depending on the task.

## If You Are Changing...

### Prompt text or prompt selection

Touch:

- `apps/backend/app/prompts/templates.py`
- `apps/backend/app/prompts/enrichment.py`
- `apps/backend/app/prompts/refinement.py`
- `apps/backend/app/services/improver.py`
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
- `apps/backend/app/services/improver.py`
- `apps/backend/app/services/refiner.py`
- `apps/backend/app/services/cover_letter.py`

Important current behavior:

- diff-first generation
- full-generation fallback
- local refinement after tailoring
- preview/confirm hash validation for application packs

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
- enrichment flows currently call LLMs directly from the router layer.
