# Resume Workbench Repository Guide

Start with `docs/agent/README.md` and trust current code over historical design notes.

## Stack

- Frontend: Next.js, React, TypeScript, Tailwind CSS
- Backend: FastAPI, Pydantic, SQLAlchemy, Alembic, PostgreSQL
- AI: LiteLLM with provider-specific configuration
- Resume rendering: RenderCV
- Browser tests: Playwright

## Architecture rules

- Keep database access behind `apps/backend/app/db/repositories`.
- Add an Alembic migration for schema changes.
- Keep prompt source text under `apps/backend/app/prompts/text`.
- Keep RenderCV as the source of truth for resume preview and PDF output.
- Preserve structured resume data instead of flattening it into document HTML.
- Do not add unverifiable candidate facts during AI generation.
- Preserve LLM operation, trace, and request-scope metadata.

## Public-data rules

- Use fictional people, companies, contact details, and jobs in tests and screenshots.
- Never commit `.env` files, credentials, local databases, generated resumes, or trace exports.
- Keep provider keys server-side and masked in API responses.

## Checks

```bash
cd apps/frontend && npm run verify
cd apps/backend && uv run ruff check app tests && uv run pytest
npm run test:e2e
```

Update README or docs when changing setup, features, architecture, privacy, prompts, storage, rendering, or deployment.
