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

## Implementation and verification guide

Use this section as a handoff checklist. The line numbers above refer to revision `f466dee`; locate the functions by name if the code has moved. Treat each numbered item as complete only after its manual check and a regression test pass. Check the saved database state or reload the page after each edit: a correct-looking preview alone does not prove that data survived.

### Safe test setup

1. Use a development checkout and a separate Postgres database, such as `resume_workbench_audit`. Point `DATABASE_URL` at that database before running Alembic or the API. Set `DATA_DIR`, `ARTIFACT_DIR`, and `RENDERCV_WORK_DIR` to an audit-only directory. Keep these paths separate from the user's normal database and files. The repository's [quick start](../../README.md#quick-start) gives the standard backend and frontend commands. Check the selected database name in the API environment before any migration or reset.
2. Create two disposable resumes, A and B, in the local UI. Give them visibly different names, summary text, projects, and custom sections. Use one browser profile for cross-resume tests; use a clean profile when testing behavior that must not depend on old localStorage.
3. For race tests, use browser network throttling or a local request delay. Do not infer ordering from normal network speed. Record the request order, response order, final UI, and persisted row.
4. After each fix, verify both Visual → YAML → Visual and YAML → Visual → YAML paths, refresh the page, and download the PDF when the finding affects rendering. Use a copy of the hosted resume for final acceptance; do not run reset or destructive tests against the hosted account.

### 1. Isolate drafts by resume ID

**Change:** In `resume-builder.tsx`, put resume ID in every editor storage key, including structured draft, raw YAML, and theme settings. Keep a separate key for a genuinely new resume. Clear the old resume's in-memory YAML when the ID changes. Treat an existing-resume load or YAML normalization error as a blocked editor state: show the error, preserve the user's unsaved data for that same ID, and prevent autosave to a different ID. If legacy global keys must be migrated, accept them only when ownership can be proved; otherwise leave them unused.

**Manual check:** Edit A's YAML, open B in the same browser, and switch B between Visual and YAML. B must show only B's content. Simulate a failed fetch or malformed custom-section conversion while opening B; B must show an error and must never save A's data. Reload both resumes and compare their stored names, projects, and custom sections. Add a UI regression test that changes IDs with localStorage populated.

### 2. Reject stale resume loads

**Change:** Give each load in the `resumeId` effect an `AbortController` or monotonically increasing request token. Reset all resume-scoped state, including cover letter and outreach fields, when the ID changes. Apply a response only if its token and resume ID still match the active editor. Keep save callbacks bound to the loaded resume identity.

**Manual check:** Delay A's GET, navigate to B, then let A's GET finish. B must retain B's name, theme, YAML, cover letter, and outreach text. Repeat with an empty cover letter in B. Inspect network traffic to confirm no PATCH writes A's content to B. Add an automated deferred-response test for both response orders.

### 3. Make autosave ordering enforceable

**Change:** Serialize client saves for one resume and keep the newest pending draft. Add a server revision/version to the draft PATCH path so an older write receives a conflict instead of replacing a newer row. Increment and check the revision atomically in the database. Apply saved baselines and “All changes saved” only for the acknowledged current revision. Cancellation alone is insufficient because the server may already be writing.

**Manual check:** In the browser, delay save 1 and make a second edit; the client must queue the newer draft and finish with the second edit saved. At the API level, send two revisions concurrently and make the older one finish last; it must receive a conflict and leave the newer database row intact. Refresh and verify the second edit remains. Repeat with an intentional client conflict and confirm the editor keeps unsaved content and offers retry. Add API and UI tests for both response orders.

### 4. Ignore stale preview responses

**Change:** In `render-preview-panel.tsx`, abort or invalidate the previous request when `draftRequest` or theme changes. Keep a request sequence or draft hash and update the displayed artifact only for the latest request. Ensure an old error cannot replace a newer successful preview.

**Manual check:** Make draft A slow and draft B fast. Confirm B stays visible after A finishes. Repeat when A fails and B succeeds, and when the user changes theme during rendering. Add a component test with deferred responses.

### 5. Stop live-preview artifact growth

**Change:** Separate temporary draft previews from durable exports in the preview endpoint and `store_rendercv_bundle`. Use request-scoped files with expiry, or replace one preview artifact set transactionally. Do not append permanent artifact rows for every keystroke. Keep actual downloaded exports available under a defined retention rule. Check that concurrent previews cannot make a returned artifact URL point at overwritten bytes.

**Manual check:** Count artifact rows for one disposable resume, make 20 edits/theme changes, and count again. The count must stay bounded by the chosen retention rule. Open an older preview URL during a newer render and confirm it serves the correct version or expires cleanly. Download a PDF and confirm the durable artifact still works. Add a repository/API test for repeated previews.

### 6. Show settings load failures

**Change:** Keep load status and error per config section in `settings/page.tsx`. Do not convert a failed request into an apparently loaded default. Disable that section's Save action until it loads, and provide Retry. Preserve successful sections if one endpoint fails.

**Manual check:** In local browser tools, make one config GET return 500 while other GETs succeed. The failed section must show an error and block Save; successful sections must remain usable. Restore the endpoint, select Retry, and confirm the stored value appears before saving. Add a UI test with one rejected request.

### 7. Make config writes atomic and coordinated

**Change:** In `config.py`, put the full read/modify/write operation under a lock that works across backend workers, or move settings into transactional database storage. For file storage, write a temporary file in the same directory and atomically replace the target; define backup and invalid-JSON recovery behavior. Apply this to every endpoint that writes the same config file, not only LLM settings.

**Manual check:** From two local clients, save different settings at the same time many times. Both final values must survive, and every intermediate read must parse valid JSON. Interrupt a writer before replacement in an isolated config directory; the previous file must remain valid. Add a concurrency test and a malformed-file recovery test.

### 8. Clear all editor storage on reset

**Change:** Define resume-scoped storage keys in one shared module. After a successful reset, remove structured drafts, raw YAML, theme drafts, and any per-resume variants. Do not clear them before the server confirms success. Include legacy global keys in cleanup.

**Manual check:** In the isolated environment, edit YAML and theme, reset through Settings, then create a new resume. No old YAML, theme, or content may reappear. Simulate a failed reset and verify the current draft remains. Add a UI storage test. Never run this check on the hosted account.

### 9. Make reset semantics explicit

**Change:** Decide whether `data/config.json`, provider keys, prompts, and language settings are part of “all data.” If they are, clear them in the backend reset operation and update the UI. If they are intentionally retained, name exactly what remains in the confirmation dialog and success message. Keep the backend response consistent with that decision.

**Manual check:** In an isolated config directory, set a recognizable non-secret provider value, run reset, and inspect both Settings and the config file. Verify the result matches the dialog. Check the English text and every maintained translation. Do not use a real API key in this test.

### 10. Align the Playwright CI port

**Change:** Make `playwright.config.ts`, `tests/playwright-fixtures.ts`, the root `test:e2e` script, and `.github/workflows/playwright.yml` use one frontend URL. Prefer one shared default or make CI invoke the root script. Do not depend on another process listening on port 3000.

**Manual check:** Stop every local frontend, then run the exact CI Playwright command in a clean environment. Confirm the fixture reaches the server started by Playwright on port 3100 and a simple builder test passes. Add a workflow check that fails if the configured URL and server port diverge.

### 11. Define the raw YAML contract

**Change:** Choose one product contract: preserve supported RenderCV fields outside `ResumeData`, or reject unsupported fields before saving with an exact YAML path. Build a field-by-field mapping for personal details, every section entry type, design, locale, and settings. Do not silently drop a field after the save status says success. Keep unknown app metadata separate from RenderCV data.

**Manual check:** On a disposable resume, add one advanced field at a time in YAML, save, switch to Visual, return to YAML, reload, and compare values. A supported field must survive unchanged; an unsupported field must produce a clear error before any write. Add a table-driven round-trip test for every declared supported field.

### 12. Respect visibility for every section

**Change:** In `resume_to_rendercv_payload`, compute a visibility map from `sectionMeta` before building default or custom sections. The fallback may add a populated section only when metadata is absent, not when metadata says `isVisible=false`. Apply the same rule to Experience, Education, Projects, Skills, and custom sections. Keep hidden data in the editor and database.

**Manual check:** Hide each section type in turn on a local resume, then inspect YAML, live preview, and downloaded PDF. The hidden section must not render, while its editor data remains after reload and after changing YAML in another section. Show it again and confirm its original content returns. Add an adapter test for default and custom hidden sections.

### 13. Preserve hidden projects through YAML edits

**Change:** Treat renderable YAML as a view of the full project list. Keep hidden projects in the underlying model when YAML changes. Match visible projects by stable ID or another explicit identity; never copy `includeInResume` by array index. Define behavior for a visible project that the user deletes in YAML, and for newly added projects. Use the same identity rule for other filtered entry types if they have per-item visibility.

**Manual check:** Create hidden project A and visible project B. Change only the summary in YAML, save, and reload. A must still exist and remain hidden; B must remain visible with its original content. Reorder B, add C, delete B, then toggle A visible and inspect preview/PDF. Add a round-trip test that begins with hidden items before visible items.

### 14. Keep commas inside one skill value

**Change:** Make the YAML skill representation lossless. Prefer a list of distinct values; if comma-delimited text remains supported, parse only unquoted top-level delimiters. Align the backend parser and visual skill input so a tag such as `AWS (Lambda, S3, RDS)` stays one value. Preserve existing simple comma lists during migration.

**Manual check:** Enter `AWS (Lambda, S3, RDS)` as one skill in Visual, switch to YAML, save, reload, and confirm one tag remains. Repeat with a simple two-skill list, quoted commas, and an empty skill. Check preview and PDF. Add unit tests for the shared parsing contract.

### 15. Honor an explicitly empty skills section

**Change:** In `rendercv_cv_to_resume_data`, distinguish an absent `skills` key from a present empty list. A present `skills: []` must clear both normalized skill representations; an absent key may follow the documented fallback policy. Avoid using truthiness to decide whether to retain old skills.

**Manual check:** Start with two skills, set `skills: []` in YAML, save, reload, and confirm Visual, YAML, preview, PDF, and stored data contain no skills. Then omit the key entirely and check the chosen contract. Add tests for absent, empty, and populated skill sections.

### 16. Render custom item descriptions safely

**Change:** In `_custom_sections`, handle `CustomSectionItem.description` as `list[str]`; pass each point through the rich-text conversion individually. Keep item title, dates, location, links, and highlights in a stable RenderCV representation. Update the reverse parser to restore the structured item instead of turning it into a string list. Catch unexpected entry shapes as a validation error with a section path, not an HTTP 500.

**Manual check:** Create a custom item section with zero, one, and several description points. Confirm preview and PDF render, YAML opens, and Visual → YAML → Visual preserves all item fields after reload. Also submit an invalid description type and confirm a useful 422 response. Add adapter round-trip and endpoint tests.

### 17. Preserve or reject multiple summary entries

**Change:** Either extend the app model and visual editor to support several summary entries, or reject a YAML summary list with more than one entry before saving. The editor must not silently keep only `summary_items[0]`. If choosing rejection, report the `cv.sections.summary` path and leave the prior saved resume unchanged.

**Manual check:** Add two summary entries in YAML. Under the support path, both must survive Visual/YAML switches, reload, preview, and PDF. Under the rejection path, Save must show a clear error and the database must retain the previous summary. Add conversion and endpoint tests for one, two, and empty entries.

### 18. Surface malformed emphasis before export

**Change:** Define which Markdown emphasis syntax the builder supports. Validate it at the rich-text/YAML boundary and identify the affected field when markers are unmatched. Do not silently remove user text or change intentional literal asterisks. If automatic normalization is chosen, show the corrected text in the editor before saving.

**Manual check:** Put unmatched `**` in a summary and an experience bullet. The editor must flag the field or show a deliberate literal rendering; preview/PDF must not unexpectedly expose formatting markers. Also check valid bold text, escaped asterisks, and plain multiplication or wildcard text. Add converter tests for these cases.

### Release check after fixes

Run focused unit/API tests for the affected adapters and endpoints, the Playwright builder/settings flows, and a local browser pass using disposable resumes. Verify the saved row after reload, not only the transient UI. Confirm one experience and one project stack line in YAML and PDF so the earlier duplicate-stack fix remains intact. Review the artifact count after repeated previews. Only then deploy the application fixes and repeat non-destructive checks on a copy of the hosted resume. Document any deliberate YAML field limits and reset behavior in user-facing help.

## Implementation and release-check status

Implementation is in the audit branch. Do not treat it as deployed until the pull request is merged and the hosted deployment completes.

- Findings 1–5: fixed resume-scoped browser storage, stale-load guards, serialized autosaves with revision checks, stale-preview response guards, and bounded preview artifact replacement. The revision migration is `0006_resume_draft_revision.py`.
- Findings 6–10: settings loads now block writes and provide retry on failure; config writes use a process lock and atomic replacement; reset removes all editor draft keys after server success; reset text says provider settings and API keys remain; Playwright uses port 3100. CI now starts an isolated Postgres service and backend before browser tests.
- Findings 12–17: fixed hidden-section handling, hidden project preservation, comma-aware skill parsing, explicit empty skill handling, custom item conversion, and rejection of multiple summaries. Unsupported CV root and common entry fields now fail with a YAML path instead of being silently discarded.
- Finding 18: unmatched, unescaped `**` markers in summaries and common resume descriptions now fail validation with a field path. This does not detect every balanced but misplaced marker. It also does not inspect all custom-section fields.
- Finding 11 remains a defined subset, not full RenderCV schema coverage. The validator covers CV root keys and common entry keys. Theme-specific design keys and dynamic custom section fields still need a field-by-field preservation contract before the editor can safely claim full RenderCV YAML support.

Verification on 2026-10-19:

- Backend full suite: 587 passed.
- Frontend unit suite: 128 passed.
- Frontend lint and production build passed.
- Ruff passed for all changed backend files after the final emphasis checks.
- Alembic upgraded the isolated `resume_workbench_audit_impl` database to head.
- The local browser opened the builder at `http://127.0.0.1:3100/builder` and showed the blank-resume editor.
- Playwright E2E did not pass in this macOS sandbox. The first full run had 10 failing tests and 6 skipped tests. Some failures showed stale UI selectors and missing API setup. A focused rerun could not start Chromium because macOS denied the Chromium helper process (`bootstrap_check_in ... Permission denied`). CI now starts Postgres and the backend. Its first run confirmed that the existing E2E suite also had stale selectors and route mocks: the YAML toggle matched “Copy Full YAML”, the resume-list mocks used the old query name, and dashboard/settings/prompt tests expected old labels and roles. Those test expectations are now updated. A successful CI rerun is still required before release.

The test database `resume_workbench_audit_impl` contains only disposable audit test data. The hosted resume and production data were not changed.
