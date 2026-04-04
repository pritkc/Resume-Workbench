# Resume Workbench

This repository is the active project root for the resume builder work.

## Layout

- `apps/`
  - active application code copied into the root repo
- `tests/`
  - project test coverage
- `docs/plans/`
  - phase-by-phase architecture and execution plans
- `docs/research/`
  - comparison notes and supporting research
- `reference/`
  - local upstream/source repos kept for analysis and benchmarking
  - intentionally not tracked by this root git repo

## Planning Docs

- `docs/plans/resume-plan.md`
- `docs/plans/resume-plan-phase2.md`
- `docs/plans/resume-plan-phase3.md`
- `docs/plans/resume-plan-phase4.md`
- `docs/plans/phase-5.md`
- `docs/plans/phase-6.md`
- `docs/plans/phase-6-checklist.md`
- `docs/plans/phase-6-global-test-cases.md`

## Working Approach

- Run `git status`, `git add`, `git commit`, and future implementation work from this root repo.
- Treat `reference/` as local source material only, not as part of this repo's history.
- Build on the Resume-Matcher foundation in the root codebase, with RenderCV integrated as the renderer and the planning docs as the source of truth.

## Running The App

### Frontend

Development mode from [apps/frontend](/Users/pritchakalasiya/Development/resume-workk/apps/frontend):

```bash
cd /Users/pritchakalasiya/Development/resume-workk/apps/frontend
npm run dev
```

- Serves the Next.js app on `http://localhost:3000`
- Use this during active UI work because source edits are picked up automatically

Production-style run from [apps/frontend](/Users/pritchakalasiya/Development/resume-workk/apps/frontend):

```bash
cd /Users/pritchakalasiya/Development/resume-workk/apps/frontend
npm run build
npm run start
```

- Use this when you want to verify the production bundle
- `npm run start` serves the last built `.next` output, so source changes will not appear until you run `npm run build` again

### Backend

Development mode from [apps/backend](/Users/pritchakalasiya/Development/resume-workk/apps/backend):

```bash
cd /Users/pritchakalasiya/Development/resume-workk/apps/backend
uv run uvicorn app.main:app --reload --port 8000
```

- Serves the FastAPI app on `http://127.0.0.1:8000`
- Frontend rewrites `/api/*` to this backend by default

## Recommended Workflow After Major Changes

For most day-to-day work:

1. Run the backend in reload mode:
   ```bash
   cd /Users/pritchakalasiya/Development/resume-workk/apps/backend
   uv run uvicorn app.main:app --reload --port 8000
   ```
2. Run the frontend in dev mode:
   ```bash
   cd /Users/pritchakalasiya/Development/resume-workk/apps/frontend
   npm run dev
   ```
3. Hard refresh the browser after major frontend UI changes:
   - Chrome on macOS: `Cmd + Shift + R`

For a full production-style verification after major frontend work:

1. Stop any existing frontend server
2. Rebuild from [apps/frontend](/Users/pritchakalasiya/Development/resume-workk/apps/frontend):
   ```bash
   cd /Users/pritchakalasiya/Development/resume-workk/apps/frontend
   npm run build
   ```
3. Start the built app:
   ```bash
   npm run start
   ```

Important:

- If you use `npm run start`, a plain restart is not enough after code changes. You must run `npm run build` first.
- If the UI still looks old after a restart, the first thing to check is whether you are running `dev` or `start`.

## Checking And Killing Existing Processes

Check whether something is already listening on the frontend or backend ports:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

If a stale process is still using one of those ports, stop it cleanly:

```bash
pkill -f "next dev|next start"
pkill -f "uvicorn app.main:app"
```

If you want to target the exact process using a port:

```bash
lsof -ti tcp:3000 | xargs kill
lsof -ti tcp:8000 | xargs kill
```

Use `kill -9` only if a process refuses to stop normally.

## Quick Troubleshooting

- Frontend changes not visible:
  - Make sure the frontend is running from [apps/frontend](/Users/pritchakalasiya/Development/resume-workk/apps/frontend)
  - If using `npm run start`, rebuild with `npm run build`
  - Hard refresh the page
- API calls failing from the frontend:
  - Confirm the backend is running on `127.0.0.1:8000`
  - Confirm the frontend is running on `localhost:3000`
- Ports already in use:
  - Run the `lsof` commands above
  - Kill the old process, then restart the app
