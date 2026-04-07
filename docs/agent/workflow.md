# Workflow

> Day-to-day expectations for code, tests, and doc updates.

## Local Change Checklist

1. Identify the active surface area first.
   - storage or migrations
   - prompts or LLM operations
   - RenderCV adapter or theme settings
   - application-pack flow
   - frontend builder, viewer, or settings
2. Update the corresponding docs under `docs/agent/` when behavior changes.
3. Run the narrowest relevant verification, then widen only if the change is risky.

## Recommended Verification

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

E2E:

```bash
npm run test:e2e
```

## Changes That Should Always Be Called Out

- Alembic or SQL model changes
- prompt changes or prompt-selection behavior
- API contract changes
- RenderCV output or artifact-shape changes
- new LLM `operation` names or request scopes

## PR Notes

Include:

- what changed for users
- which routes, prompts, or schemas changed
- what you verified locally
- screenshots for UI work when helpful

## Helpful Repo-Level Commands

See current delta over upstream:

```bash
git diff --name-status upstream/main...HEAD
```

Run migrations locally:

```bash
cd apps/backend
uv run alembic upgrade head
```
