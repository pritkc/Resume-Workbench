# Agent Docs

This folder is the working map for agents operating in the current `resume-workk` codebase.

## Current truths

- The active repo root is this workspace, with product code under `apps/`.
- The backend is **FastAPI + LiteLLM + SQLAlchemy + Alembic + Postgres** (`DATABASE_URL`). `app/database.py` is a **compatibility façade** over SQLAlchemy repositories — not file-based JSON storage.
- Resume preview and resume PDF generation come from **RenderCV artifacts**, not a legacy frontend-only print path for resumes.
- **Cover-letter PDF** generation still uses **Playwright** via `apps/backend/app/pdf.py` and the frontend print route for that document type.
- The main JD flow is `application-packs/preview` → local diff review → `application-packs/confirm`.
- Resume tailoring centers on **`resume_generate_full`** (with **`full` / `lite`** prompt modes in config), which now returns a compact addressed diff that is applied locally.
- Full-mode tailoring can optionally run **`critique_resume`** + **`rewrite_resume`** when `/api/v1/config/critique` is enabled.
- `sectionMeta` stays local to rendering/storage flows and is rehydrated after tailoring instead of being sent to the LLM.
- Cover-letter and outreach prompts use **compact candidate-profile payloads**, not the full stored resume JSON, and are generated on demand from the builder after a tailored resume exists.
- LLM calls are persisted to the **`llm_calls`** table and surfaced at **`/llm-traces`**.
- **`additional.groups`** and raw RenderCV YAML editing are live features.
- **Prompts:** shipped copy under `apps/backend/app/prompts/text/` (`.txt`); loaders and `build_messages` in `apps/backend/app/prompts/*.py`. See [llm-prompt-inventory.md](llm-prompt-inventory.md) and `apps/backend/app/prompts/text/README.md`.
- **End-to-end backend flow:** [architecture/backend-orchestration-flow.md](architecture/backend-orchestration-flow.md) (repo root `orchastration.md` is a stub that points here).

## Start here

1. [quickstart.md](quickstart.md)
2. [scope-and-principles.md](scope-and-principles.md)
3. [testing-playbook.md](testing-playbook.md)
4. [architecture/backend-architecture.md](architecture/backend-architecture.md)
5. [architecture/frontend-architecture.md](architecture/frontend-architecture.md)
6. [apis/api-flow-maps.md](apis/api-flow-maps.md)
7. [llm-integration.md](llm-integration.md)
8. [llm-prompt-inventory.md](llm-prompt-inventory.md)
9. [llm-observability.md](llm-observability.md)

## Design reference (`docs/agent/design/`)

Swiss layout, typography, and PDF/visual specs for templates. **Not** the live RenderCV theme ID source of truth — when in doubt, match **`apps/frontend/lib/types/render-theme.ts`** and **`architecture/storage-and-rendering.md`**.

## Feature maps

- [features/application-packs.md](features/application-packs.md)
- [features/additional-groups-and-raw-yaml.md](features/additional-groups-and-raw-yaml.md)
- [features/enrichment.md](features/enrichment.md)
- [features/custom-sections.md](features/custom-sections.md)
- [features/jd-match.md](features/jd-match.md)
- [features/resume-templates.md](features/resume-templates.md)
- [features/i18n.md](features/i18n.md)

## Skills locations (keep in sync)

- **Cursor:** `.claude/skills/` in this repo (often symlinked from user-level Cursor skills).
- **GitHub Copilot agents:** `.github/skills/` — **mirror** backend/stack wording with `.claude/skills/` when you change one.

## Historical or partial docs

- Most files under `docs/agent/design/` — design reference; validate against code.
- [features/adding-resume-templates.md](features/adding-resume-templates.md) — archived notes.

When a doc conflicts with code, trust the code and update this folder.
