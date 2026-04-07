# Scope and Principles

> Canonical operating rules for agents working in this workspace.

## What This Repo Is

Resume Workbench is a Resume-Matcher-derived product with major local additions:

- FastAPI backend with LiteLLM, SQLAlchemy/Alembic, RenderCV, and LLM trace persistence
- Next.js frontend with builder, RenderCV preview controls, application-pack flow, and observability UI
- SQL-backed storage through `app/db/*`, exposed to the rest of the app through the compatibility facade in `app/database.py`

## Non-Negotiable Current Truths

1. RenderCV is the source of truth for resume preview artifacts and resume PDFs.
2. The old frontend print route for resume PDFs is retired. Do not reintroduce it.
3. `app/database.py` is a compatibility wrapper over SQLAlchemy repositories, not a TinyDB implementation.
4. `additional.groups` is the canonical additional-info shape. Legacy flat keys are normalized in and out.
5. Tailoring uses one primary `resume_generate_full` call, followed by local cleanup, local verification, and local diff generation for preview.
6. `sectionMeta` is UI/render metadata and should stay out of LLM prompt/output contracts unless there is a very strong reason.
7. Auxiliary text prompts should use compact typed payloads, not full stored resume JSON, and plain-text calls should fail loudly rather than silently returning truncated content.
8. LLM tracing is part of the product now. New LLM-backed work should preserve useful `operation`, `metadata`, and request-scope context.
9. `application-packs/preview` and `application-packs/confirm` are the newest JD workflow surfaces. `POST /resumes/improve` still exists, but it is not the full pack workflow.

## Working Rules

### Backend

- Keep prompts in `apps/backend/app/prompts/` unless there is a very strong reason not to.
- Add or update Alembic migrations when changing SQL models.
- Prefer repository-layer changes in `app/db/repositories/*` over ad hoc SQL in routers.
- Keep client-facing errors concise and log full context server-side.

### Frontend

- Keep new UI aligned with the existing visual language unless the task explicitly changes design direction.
- Treat RenderCV preview state as authoritative for rendering work.
- Preserve builder autosave, raw-YAML validation, and application-pack review flows when making UI changes.

### Docs

- If a change touches prompts, routes, storage, rendering, or LLM observability, update `docs/agent/`.
- When docs and code drift, the code wins, and the docs should be corrected in the same line of work when practical.

## Historical Docs

Some older docs in `docs/agent/design/` still describe the pre-RenderCV CSS template system. They are reference material, not the current architecture.
