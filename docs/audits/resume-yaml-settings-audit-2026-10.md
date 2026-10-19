# Resume YAML and Settings Audit

Date: 2026-10-19
Revision reviewed: `f466dee` (`Fix duplicate tech stack rendering (#6)`)
Scope: resume loading, YAML conversion, autosave, live preview, settings persistence, and CI feedback.

## Review limits

The code review used the clean `origin/main` worktree. The local frontend and backend were not running, so I could not reproduce the findings in the browser. Docker had the Resume Workbench Postgres container only. The findings below are static code findings with the request and persistence paths traced. They need regression tests and browser checks when the app is running.

## Findings

### 1. Browser drafts can cross between resumes — High

`resume_builder_draft`, `resume_builder_settings`, and `resume_builder_raw_yaml` are global localStorage keys. They do not include a resume ID. If a resume fetch fails, the builder restores the global draft and marks it dirty. Autosave then sends the current builder state to the resume ID in the URL. A stale draft can therefore overwrite a different resume after a fetch error. Raw YAML and theme settings can also come from a different resume.

Evidence: `apps/frontend/components/builder/resume-builder.tsx:135-138`, `:1040-1064`, `:1271-1290`.

Suggested fix: key every resume draft value by resume ID. Restore only a draft with the matching ID. If loading an existing resume fails, show a load error and do not autosave fallback content to that ID.

### 2. Resume loads can finish out of order — High

The effect that loads resume data starts an async fetch but has no abort or stale-request check. If the URL changes from resume A to resume B while A is still loading, A's response can update builder state after B is selected. The save callback uses the current `resumeId`, so old data can be sent to B. The load also only sets cover letter and outreach state when the response value is truthy. Empty values do not clear values left by the prior resume.

Evidence: `apps/frontend/components/builder/resume-builder.tsx:929-1004`, `:1070-1080`, `:1202-1227`.

Suggested fix: cancel or invalidate each load when its ID changes. Reset all resume-scoped state at the start of a new load. Apply a response only when its ID still matches the active ID.

### 3. Concurrent autosaves can write older content last — High

Each autosave starts an independent request. A slow request can remain in flight while a later edit schedules another save. The server writes each request directly to the resume row, with no version check or ordered queue. The client checks the draft version only when applying some response state; it does not prevent the old request from writing to the database. The response handler also updates the saved baselines before checking the version.

Evidence: `apps/frontend/components/builder/resume-builder.tsx:632-655`, `:1202-1228`, `:1271-1290`; `apps/backend/app/routers/resumes.py:2826-2850`.

Suggested fix: serialize saves per resume, cancel superseded requests where possible, and add a server-side revision or compare-and-swap check. Apply response baselines only when the response is still current.

### 4. A late preview request can replace a newer preview — Medium

The preview panel starts a request after a 450 ms debounce. It does not cancel an in-flight request or check that the response matches the latest draft. If an older render takes longer, it can set the displayed artifacts after a newer render. Both requests can also persist artifacts to the same resume directory.

Evidence: `apps/frontend/components/rendercv/render-preview-panel.tsx:70-89`, `:102-112`; `apps/backend/app/routers/resumes.py:1694-1725`.

Suggested fix: assign each preview a request ID or draft hash, ignore stale responses, and avoid storing artifacts for previews that are only temporary editor output.

### 5. Every live preview adds artifact rows — Medium

The draft preview endpoint calls `store_rendercv_bundle`. That function creates new database artifact records for each file on every call. The preview runs after edits and theme changes. Files use the same destination names under a resume directory, but the artifact rows are appended; there is no artifact pruning path in the reviewed code. Repeated editing can grow the artifact table and leave old records pointing to files that have since been overwritten.

Evidence: `apps/backend/app/routers/resumes.py:1718-1725`; `apps/backend/app/services/artifact_service.py:26-75`; `apps/backend/app/db/repositories/artifacts.py:13-18`.

Suggested fix: keep live previews temporary, or replace the prior preview artifact set for that resume in one transaction. Add retention for artifacts created by actual exports.

### 6. Settings load failures are hidden — Medium

The settings page converts each failed config request to `null`, then sets the page status to `idle`. The user sees defaults or blank fields without an error. A user can then save from a screen that did not load the stored values. The outer `catch` does not handle these request failures because each error was already caught.

Evidence: `apps/frontend/app/(default)/settings/page.tsx:282-288`, `:332-347`.

Suggested fix: show a separate load error for each failed settings request. Disable saves for a config section until that section has loaded, or provide an explicit retry action.

### 7. Config file updates can lose unrelated settings or leave a partial file — Medium

Config endpoints read the full JSON file, change selected fields, and write the full file without a lock. With multiple backend workers or other concurrent writers, updates can read the same old content and overwrite each other's changes. The write also goes directly to the target file, so a process interruption during the write can leave invalid JSON; `_load_config` does not recover from invalid JSON.

Evidence: `apps/backend/app/routers/config.py:211-224`, `:390-441`.

Suggested fix: use atomic temp-file replacement and a lock around read/modify/write. Back up or report malformed config clearly instead of failing every settings read.

### 8. Reset leaves resume editor data in localStorage — Medium

The reset flow removes the main resume draft and theme settings, but it does not remove `resume_builder_raw_yaml`. A later builder session can load YAML from before the reset. It also leaves the saved UI layout key, though that value is not resume content.

Evidence: `apps/frontend/app/(default)/settings/page.tsx:718-731`; YAML storage load at `apps/frontend/components/builder/resume-builder.tsx:868-889`.

Suggested fix: centralize resume editor storage keys and clear all resume-scoped keys during reset. Resume-scoped keys should also include the resume ID.

### 9. Reset wording does not match which settings it clears — Medium

The UI says reset deletes all data. The backend resets database tables, uploaded files, and artifacts, but it does not remove `data/config.json`. That file stores LLM provider settings and API keys. This may be intentional, but the current wording does not tell the user that those settings remain.

Evidence: `apps/frontend/messages/en.json:735-736`, `:1094-1095`; `apps/backend/app/database.py:754-766`; config path at `apps/backend/app/config.py:259-262`.

Suggested fix: either clear the config file as part of reset, or state clearly that provider settings and API keys remain.

### 10. Playwright CI uses the wrong frontend port — High for feedback, low for runtime

The Playwright web server starts the frontend on port 3100. The E2E fixture defaults to port 3000. The root `test:e2e` script sets `E2E_FRONTEND_URL` to 3100, but the GitHub workflow runs `npx playwright test` directly and does not set that variable. Tests can therefore connect to port 3000 while the app listens on 3100. This makes CI feedback unreliable and can block detection of real resume bugs.

Evidence: `playwright.config.ts:72-78`; `tests/playwright-fixtures.ts:1-4`; `package.json:12`; `.github/workflows/playwright.yml:22-23`.

Suggested fix: have CI use the root `test:e2e` script or set `E2E_FRONTEND_URL=http://127.0.0.1:3100` in the workflow. Keep the browser project choice explicit.

### 11. Raw YAML round-trips only preserve fields mapped into the app model — Medium, needs product decision

Saving YAML parses the RenderCV sections into the app's `ResumeData` model, then serializes that model back into canonical YAML. The parser explicitly maps selected fields for personal information and each entry type. Fields that RenderCV accepts but that this app model does not represent can be dropped on save. This can surprise users who use the raw YAML editor for advanced RenderCV fields.

Evidence: `apps/backend/app/routers/resumes.py:811-932`; `apps/backend/app/rendering/rendercv_adapter.py:1215-1461`.

Suggested fix: define the supported YAML subset and validate against it with clear messages, or preserve unknown YAML keys through the parse/serialize cycle. Add round-trip coverage for every supported entry field.

## Existing duplicate-stack path reviewed

The current adapter emits one RenderCV `summary` value for an experience or project stack. It removes a matching first bullet before emitting `highlights`. Parsing puts that summary back into the app model's stack field and keeps highlights separate. This path is designed to avoid duplicate stack lines. The audit did not establish a new defect in that specific conversion on the current revision.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:645-678`, `:709-755`, `:1302-1324`, `:1351-1375`.

## Recommended order

1. Fix resume-ID isolation and stale loads. These can apply one person's or one resume's content to another resume.
2. Order autosaves and ignore stale responses.
3. Fix the CI port mismatch so future regressions are visible.
4. Prevent stale preview responses and control preview artifact growth.
5. Make settings load failures visible and make config writes atomic.
6. Decide reset semantics and the supported raw YAML field contract.
