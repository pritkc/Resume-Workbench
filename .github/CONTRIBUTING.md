# Contributing to Resume Workbench

Thank you for helping improve the project.

## Before opening a change

1. Search existing issues and pull requests.
2. Keep one problem or feature per change.
3. Do not include real resumes, contact details, provider keys, trace exports, or generated application files.
4. Use fictional data in tests, screenshots, and bug reports.

## Local setup

Follow [SETUP.md](../SETUP.md). The maintained stack is:

- `apps/frontend`: Next.js and React
- `apps/backend`: FastAPI, PostgreSQL, RenderCV, and LiteLLM
- `tests`: Playwright end-to-end tests

## Checks

Frontend:

```bash
cd apps/frontend
npm run verify
```

Backend:

```bash
cd apps/backend
uv run pytest
uv run ruff check app tests
```

End-to-end:

```bash
npm ci
npx playwright install chromium
npm run test:e2e
```

## Pull requests

Describe:

- the user problem
- the chosen solution
- important behavior changes
- how the change was tested
- screenshots for visible UI work

Update public docs when a change affects setup, features, architecture, privacy, APIs, prompts, storage, or rendering.

## Code style

- Follow the existing module patterns.
- Keep frontend components focused and typed.
- Keep database work behind repository classes and Alembic migrations.
- Keep prompt text in `apps/backend/app/prompts/text`.
- Preserve RenderCV as the resume rendering source of truth.

By contributing, you agree that your contribution is licensed under the repository's Apache-2.0 license.
