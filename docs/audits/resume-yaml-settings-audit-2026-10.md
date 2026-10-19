# Resume YAML and Settings Audit

Date: 2026-10-19
Revision reviewed: `f466dee` (`Fix duplicate tech stack rendering (#6)`)
Scope: resume loading, YAML conversion, autosave, live preview, settings persistence, and CI feedback.

## Review method and limits

The code review used the clean `origin/main` worktree. I then ran the frontend and backend locally against a new `resume_workbench_audit` database and tested synthetic resumes in the browser. I also inspected the user's hosted resume and settings page without changing hosted data. Findings 1 and 12–16 include live local reproduction. The remaining findings are code findings or read-only observations; they still need focused regression coverage before fixes ship.

## Findings

### 1. Browser drafts can cross between resumes — High

`resume_builder_draft`, `resume_builder_settings`, and `resume_builder_raw_yaml` are global localStorage keys. They do not include a resume ID. If a resume fetch fails, the builder restores the global draft and marks it dirty. Autosave then sends the current builder state to the resume ID in the URL. The same cross-resume overwrite can occur after a successful fetch if YAML normalization fails and the editor shows stale YAML from the previous resume.

Live reproduction in the isolated database: save YAML in resume A, open resume B in the same browser, then switch to YAML while B's normalization fails. B displayed A's YAML. After leaving YAML mode, B's stored name and projects matched A, and B's original custom section was gone. The header still showed B's title. [Local screenshot](images/local-cross-resume-overwrite.jpg).

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

### 12. Hidden sections still appear in the exported resume — High

I marked Experience hidden in the local editor. The PDF preview still showed Experience. The adapter skips hidden entries while reading section order, then adds populated default sections back in a fallback loop. It only checks visibility for Summary. The same fallback also adds hidden custom sections back.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:831-855`, `:866-910`. [Local screenshot](images/local-yaml-roundtrip-project-loss.jpg) shows the hidden Experience label in the editor and Experience in the preview.

Suggested fix: apply `isVisible` to every section before building the RenderCV section map. The fallback must add only sections that are absent from metadata, not sections that metadata explicitly hides.

### 13. YAML editing deletes hidden projects and hides a visible project — High

The YAML serializer omits projects with `includeInResume=false`. On the return path, the parser creates projects only from the visible YAML entries and copies `includeInResume` from the old project at the same list index. In the local test, project A was hidden and project B was visible. I changed only the YAML summary. After autosave, A was deleted, B inherited A's hidden flag, and the preview showed no projects.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:700-718`, `:1351-1383`. The browser state and a direct read of the isolated database confirmed the result. [Local screenshot](images/local-yaml-roundtrip-project-loss.jpg).

Suggested fix: preserve hidden projects outside the renderable YAML slice. Match visible projects by a stable ID when applying YAML edits; never copy visibility by position.

### 14. Commas inside one skill split it into several skills — Medium

The hosted resume contains a single skill with a parenthesized comma list. Its YAML has one `details` string, but the visual editor shows separate tags for each comma segment. The isolated local test reproduced the same split after one YAML save. Both the backend CSV parser and the visual skill input split at every comma, with no quote or parenthesis handling.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:996-1006`, `:1245-1275`; `apps/frontend/components/builder/forms/additional-groups-form.tsx:32-37`. [Local screenshot](images/local-yaml-roundtrip-project-loss.jpg).

Suggested fix: use a lossless list form in YAML, or parse delimiters only at the top level. Let users add a single tag that contains commas.

### 15. Clearing all skills in YAML does not clear them in the resume — Medium

I changed the local YAML section to `skills: []` and waited for “All changes saved.” The visual editor and stored resume still contained the old skills. When the parsed skill list is empty, the adapter falls back to the old resume's skills rather than treating an explicit empty list as a deletion.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:1245-1276`, `:1447-1455`. The local browser and a direct database read both confirmed retained skills.

Suggested fix: distinguish an omitted `skills` section from an explicit empty section. Save an empty group list when the user clears the YAML section, and show that state in preview.

### 16. Custom item sections break preview and YAML normalization — High

A valid custom item has `description: list[str]` in the app model. The YAML adapter passes that list to a helper that calls `.strip()` on a string. A populated custom item section therefore raises `AttributeError`; the local browser showed HTTP 500 for preview, and YAML normalization also failed. The issue occurs with the model's default empty description list as well.

Evidence: `apps/backend/app/schemas/models.py:674-687`; `apps/backend/app/rendering/rendercv_adapter.py:126-130`, `:772-819`. [Local screenshot](images/local-custom-item-preview-500.jpg).

Suggested fix: serialize each description point as a distinct highlight or join it deliberately after validation. Preserve the structured item fields on YAML round-trip. Return a clear validation error if an entry cannot render.

### 17. YAML summaries with multiple entries lose all but the first — Medium

RenderCV YAML accepts a list in `cv.sections.summary`. The parser reads that list but assigns only item zero to the app's single `summary` string. A second paragraph or bullet is silently removed when YAML is saved and rebuilt. A direct local conversion with two entries kept only the first.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:1246`, `:1443`; canonical YAML regeneration at `apps/backend/app/routers/resumes.py:921-931`.

Suggested fix: support multiple summary entries in the app model, or reject a second entry with a clear YAML error before saving.

### 18. Malformed bold syntax reaches the exported preview — Medium

The hosted resume preview visibly shows literal `**` markers in the summary and several experience bullets. The stored text contains misplaced bold markers. The adapter passes plain text without HTML through unchanged, and the editor shows no formatting warning. This is an output-quality gap; the audit does not establish where the malformed input first arose.

Evidence: read-only inspection of the user's hosted CV YAML and preview; `apps/backend/app/rendering/rendercv_adapter.py:199-225`.

Suggested fix: validate Markdown emphasis before export and point to the affected field, or normalize it through the rich-text editor so the user can correct it in place.

## Existing duplicate-stack path reviewed

The current adapter emits one RenderCV `summary` value for an experience or project stack. It removes a matching first bullet before emitting `highlights`. Parsing puts that summary back into the app model's stack field and keeps highlights separate. This path is designed to avoid duplicate stack lines. The audit did not establish a new defect in that specific conversion on the current revision.

Evidence: `apps/backend/app/rendering/rendercv_adapter.py:645-678`, `:709-755`, `:1302-1324`, `:1351-1375`.

## Recommended order

1. Fix resume-ID isolation and stale loads. The local test confirmed a cross-resume database overwrite.
2. Fix YAML round-trip loss for hidden projects, skill lists, and custom item sections. Keep hidden sections out of preview.
3. Order autosaves and ignore stale responses.
4. Fix the CI port mismatch so future regressions are visible.
5. Prevent stale preview responses and control preview artifact growth.
6. Make settings load failures visible and make config writes atomic.
7. Decide reset semantics and the supported raw YAML field contract.
