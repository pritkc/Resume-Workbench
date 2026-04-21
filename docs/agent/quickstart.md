# Quickstart Guide

> Fast path for getting the current workspace running.

## Prerequisites

- Node.js compatible with the frontend's Next.js 16.x setup (see `apps/frontend/package.json`)
- Python 3.13+
- [`uv`](https://docs.astral.sh/uv/)
- Docker, for the local Postgres setup

## Install

Frontend:

```bash
cd apps/frontend
npm install
```

Backend:

```bash
cd apps/backend
uv sync --extra dev
```

Root tooling for Playwright E2E:

```bash
npm install
```

## Environment Files

**Canonical backend template:** `apps/backend/.env.example` (copy to `apps/backend/.env`). A duplicate `.env.sample` is not maintained—avoid drift by using `.env.example` only.

```bash
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.sample apps/frontend/.env.local
```

## Database

Recommended local database:

```bash
docker compose up -d postgres
cd apps/backend
uv run alembic upgrade head
```

Notes:

- `DATABASE_URL` must point at Postgres. `apps/backend/.env.example` already uses the default local Docker connection string.
- Alembic migrations are still the canonical schema history for SQL-backed environments.

## Run The App

Backend:

```bash
cd apps/backend
uv run uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd apps/frontend
npm run dev
```

Useful URLs:

- Frontend: `http://localhost:3000`
- Backend API docs: `http://localhost:8000/docs`
- Settings: `http://localhost:3000/settings`
- LLM traces: `http://localhost:3000/llm-traces`

## Verify

Frontend:

```bash
cd apps/frontend
npm run lint
npm run test
```

Backend:

```bash
cd apps/backend
uv run pytest
```

Root E2E:

```bash
npm run test:e2e
```

## First-Time Product Setup

1. Open `/settings`.
2. Pick an LLM provider and save credentials.
3. Upload a master resume on `/dashboard`.
4. Use `/tailor` to generate an application-pack preview.
