# Agent Docs

This folder is the working map for agents operating in the current `resume-workk` codebase.

## Current Truths

- The active repo root is this workspace, with product code under `apps/`.
- The backend is FastAPI + LiteLLM + SQLAlchemy/Alembic, and local development is expected to run against Postgres via `DATABASE_URL`.
- Resume preview and resume PDF generation now come from RenderCV artifacts, not the old frontend print route.
- Cover-letter PDF generation still uses Playwright through `apps/backend/app/pdf.py`.
- The main JD flow is `application-packs/preview` -> diff review -> `application-packs/confirm`.
- LLM calls are persisted to `llm_calls` and surfaced in the `/llm-traces` UI.
- `additional.groups` and raw RenderCV YAML editing are live features.

## Start Here

1. [quickstart.md](quickstart.md)
2. [scope-and-principles.md](scope-and-principles.md)
3. [architecture/backend-architecture.md](architecture/backend-architecture.md)
4. [architecture/frontend-architecture.md](architecture/frontend-architecture.md)
5. [apis/api-flow-maps.md](apis/api-flow-maps.md)
6. [llm-integration.md](llm-integration.md)
7. [llm-prompt-inventory.md](llm-prompt-inventory.md)
8. [llm-observability.md](llm-observability.md)

## Feature Maps

- [features/application-packs.md](features/application-packs.md)
- [features/additional-groups-and-raw-yaml.md](features/additional-groups-and-raw-yaml.md)
- [features/enrichment.md](features/enrichment.md)
- [features/custom-sections.md](features/custom-sections.md)
- [features/jd-match.md](features/jd-match.md)
- [features/resume-templates.md](features/resume-templates.md)

## Historical Or Partial Docs

These files are still useful reference material, but they are not the current source of truth for the live rendering stack:

- most files under `docs/agent/design/`
- `docs/agent/features/adding-resume-templates.md`
- older references to TinyDB or the frontend resume print route

When a doc conflicts with code, trust the code and update this folder.
