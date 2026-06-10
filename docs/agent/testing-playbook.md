# Testing Playbook

Reusable QA instructions for agents working in this repo. Use this to avoid rediscovering the same commands, test data, and browser flow every time.

## Core Rule

Run the smallest test set that proves the changed behavior, then add browser/manual QA only when the change touches user-visible flows.

Always finish with:

```bash
git diff --check
git status --short
```

Do not treat unrelated dirty files as part of the change.

## Test Selection

| Change type | Required checks |
| --- | --- |
| Frontend component or theme controls | Focused Vitest file(s), targeted eslint for touched files |
| Backend adapter, API payload, RenderCV, PDF, or Typst | Focused backend pytest file(s), ruff for touched backend files |
| Builder save/load/autosave/download behavior | Frontend focused tests plus browser QA |
| RenderCV preview/export behavior | Backend render tests plus browser QA and PDF download |
| Prompt text only | Prompt/unit tests if available, plus one representative generation or parser check when behavior changes |
| Database model or migration | Backend tests, migration upgrade, repository/API check |
| Pure docs | `git diff --check` only, unless docs include runnable commands that were changed |

## Known Fast Commands

Frontend focused example:

```bash
cd apps/frontend
npm test -- render-theme-controls.test.tsx render-theme-state.test.ts --run
npx eslint components/rendercv/render-theme-controls.tsx lib/types/render-theme.ts
```

Backend focused example:

```bash
apps/backend/.venv/bin/pytest \
  apps/backend/tests/unit/test_rendercv_adapter.py \
  apps/backend/tests/unit/test_theme_profiles.py \
  apps/backend/tests/unit/test_rendercv_engine.py \
  -q

apps/backend/.venv/bin/ruff check \
  apps/backend/app/rendering/rendercv_adapter.py \
  apps/backend/app/rendering/rendercv_engine.py \
  apps/backend/app/rendering/theme_profiles.py
```

Full checks only when the change is broad:

```bash
cd apps/frontend && npm run lint && npm run test
cd apps/backend && uv run pytest
npm run test:e2e
```

## Local Server Checks

Before browser QA, verify servers:

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:8000 -sTCP:LISTEN
```

Expected URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

If backend code changed and browser/API behavior looks stale, restart the backend dev server before blaming the new code.

## Reusable QA Resume

Use a temporary database resume for builder/render QA. Delete it after testing.

Create:

```bash
DATABASE_URL='postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher' \
PYTHONPATH=apps/backend \
apps/backend/.venv/bin/python - <<'PY'
from app.database import db

resume_data = {
    "personalInfo": {
        "name": "Style QA Resume",
        "headline": "Backend Engineer",
        "email": "style.qa@example.com",
        "phone": "555-0100",
        "location": "Chicago, IL",
        "linkedin": "linkedin.com/in/styleqa",
        "github": "github.com/styleqa",
    },
    "summary": "Backend engineer focused on dependable APIs and developer tooling.",
    "workExperience": [{
        "id": 1,
        "position": "Senior Engineer",
        "company": "Acme Systems",
        "location": "Remote",
        "date": "2022 - Present",
        "techStack": "Python, FastAPI, PostgreSQL",
        "description": ["Python, FastAPI, PostgreSQL", "Built production APIs."],
    }],
    "education": [],
    "personalProjects": [{
        "id": 1,
        "name": "Resume Workbench",
        "date": "2025",
        "techStack": "React, TypeScript, Tailwind",
        "description": ["React, TypeScript, Tailwind", "Built a live resume editor."],
    }],
    "skills": {
        "groups": [{"name": "Languages", "skills": ["Python", "TypeScript", "SQL"]}]
    },
}

theme_settings = {
    "theme_id": "classic",
    "settings": {"show_summary_heading": False},
}

record = db.create_resume(
    content="# Style QA Resume\n",
    content_type="md",
    filename="style-qa.md",
    processed_data=resume_data,
    processing_status="ready",
    title="QA Style Controls Temporary",
    theme_settings=theme_settings,
)
print(record["resume_id"])
PY
```

Delete:

```bash
DATABASE_URL='postgresql+psycopg://resume_matcher:resume_matcher@localhost:5432/resume_matcher' \
PYTHONPATH=apps/backend \
apps/backend/.venv/bin/python - <<'PY'
from app.database import db
print(db.delete_resume("PASTE_RESUME_ID_HERE"))
PY
```

## Browser QA Flow

Use this only when UI, preview, save/load, export, or editor behavior changed.

Prefer real user actions for the feature under test: click tabs/buttons, type text into focused fields, use select dropdowns, press Enter/Tab for commit-on-blur inputs, and click Download. Use direct JavaScript only for setup/inspection tasks like clearing local storage or reading saved state.

1. Clear stale builder local storage before loading a saved resume:

```js
localStorage.removeItem('resume_builder_draft')
localStorage.removeItem('resume_builder_settings')
localStorage.removeItem('resume_builder_raw_yaml')
localStorage.removeItem('active_resume_id')
```

2. Open:

```text
http://localhost:3000/builder?id=PASTE_RESUME_ID_HERE
```

3. Wait for hydration before judging the page. The first automation snapshot can capture the loading/default draft frame. Use a fresh snapshot after the preview image appears or after the header shows the saved resume title.

4. Check the actual flow:

- The saved resume title appears in the header.
- Preview image renders.
- Relevant controls show the expected values.
- Text fields accept click -> select all -> typing -> Enter/Tab.
- Save/autosave reaches "All changes saved."
- Reload preserves values.
- Download creates a PDF.
- Console has no new errors. A Next.js dev/HMR log or LCP warning is not a product failure.

5. For persisted RenderCV theme settings, verify the saved paths:

- RenderCV profile overrides: `theme_settings.theme_profiles.<theme_id>.design`
- App-only workbench settings: `theme_settings.settings.resume_workbench_style`

6. Remove browser scratch output if generated:

```bash
rm -rf .playwright-mcp
```

## PDF/RenderCV Calibration

For RenderCV changes, also call the PDF endpoint directly. This separates backend rendering from browser issues:

```bash
curl -sS -X POST "http://localhost:8000/api/v1/resumes/RESUME_ID/pdf" \
  -H "Content-Type: application/json" \
  --data '{"theme_settings":{"theme_id":"classic"}}' \
  -o /tmp/style-qa.pdf \
  -w '%{http_code} %{content_type} %{size_download}\n'
```

Expected:

```text
200 application/pdf <non-zero-size>
```

Cleanup:

```bash
rm -f /tmp/style-qa.pdf
```

## Common Pitfalls

- Do not create resumes with `original_filename`; `db.create_resume` expects `filename`.
- Do not trust the first builder preview if old local storage is present; clear storage or it may show a stale draft.
- If a dimension input looks changed but saved settings do not include it, press Enter or blur the field. These inputs commit on blur.
- If preview returns 503 after backend edits, confirm the backend reloader picked up the changed module.
- If browser navigation times out but `curl` returns 200, open a fresh browser tab.
- Always delete temporary QA resumes and `.playwright-mcp` artifacts.
