# Phase 3.4.3 — Revised QA: End-to-End Feature Validation

**Date:** 2026-04-11  
**Tested:** Full backend pipeline (232 tests) + live browser walkthrough (frontend at http://localhost:3000) + code-level static inspection  
**Context:** All 10 issues from phase-3.4.2 were found to be resolved. This document records what remains.

---

## Phase-3.4.2 Status — Confirmed Fixed

| # | Issue | Status |
|---|-------|--------|
| 1 | `bold_keywords` missing from frontend `Data` interface | ✅ Fixed |
| 2 | `bold_keywords` auto-population in builder useEffect | ✅ Fixed |
| 3 | `preserve_original_skills` undoing LLM skill regrouping | ✅ Fixed |
| 4 | Location merge condition using redundant `isinstance` check | ✅ Fixed |
| 5 | `verify_generated_resume_result` using stale flat-key logic | ✅ Fixed |
| 6 | `diffing.py` missing `experience_title` / `project_title` detection | ✅ Fixed |
| 7 | Frontend `ResumeFieldDiff.field_type` union outdated | ✅ Fixed |
| 8 | `skills_values_count` dead code in `TailoringResponseContract` | ✅ Fixed |
| 9 | Stale `EXTRACT_KEYWORDS_PROMPT` import in `analysis.py` | ✅ Fixed |
| 10 | No test for `bold_keywords` flowing through to `TailoringResult` | ✅ Fixed |

---

## New Issues Found

| # | Severity | Area | Summary |
|---|----------|------|---------|
| 1 | CRITICAL | Test | Integration test `_fake_tailoring_result` missing `bold_keywords` → 500 on every test run |
| 2 | HIGH | Backend | Diff double-reports title changes — `position`/`name` not in `_append_entry_changes` ignore_keys |
| 3 | MEDIUM | Backend/Frontend | `bold_keywords` not stored in generation_run payload — lost if user downloads PDF without visiting builder |
| 4 | MEDIUM | Frontend | 2 failing vitest tests in `diff-preview-modal.test.tsx` |
| 5 | LOW | Frontend | 2 TypeScript type errors in test files (`additional-groups`, `regenerate-wizard`) |
| 6 | LOW | Data | Some dashboard entries show "Unknown role" / "Unknown company" for older tailored resumes |

---

## Issue 1 — CRITICAL (Fixed): Integration test `_fake_tailoring_result` missing `bold_keywords`

**File:** `apps/backend/tests/integration/test_application_packs_api.py`

**Problem:** The `_fake_tailoring_result` helper builds a `SimpleNamespace` mock of `TailoringResult`. The router at `resumes.py:1456` reads `tailoring_result.bold_keywords`, but the mock had no such attribute — causing an `AttributeError` and a 500 response on every integration test run.

**Error observed:**
```
ERROR app.routers.resumes:resumes.py:585 Resume preview failed during update_generation_run:
'types.SimpleNamespace' object has no attribute 'bold_keywords'
FAILED tests/integration/test_application_packs_api.py::test_preview_generates_application_pack_metadata
```

**Fix applied (this session):** Added `bold_keywords=bold_keywords or []` parameter to `_fake_tailoring_result`.

**Current state:** ✅ All 232 backend tests pass.

---

## Issue 2 — HIGH: Diff double-reports title and project-name changes

**File:** `apps/backend/app/services/tailoring/diffing.py`

**Problem:** `calculate_resume_diff` was updated (phase-3.4.2) to detect experience title/position changes as `field_type="experience_title"` and project name changes as `field_type="project_title"`. However, the subsequent `_append_entry_changes` calls for `workExperience` and `personalProjects` use `ignore_keys={"description", "highlights", "summary"}`. This set does **not** exclude `position`, `title`, or `name`.

As a result, when a position or project name changes:
1. A `field_type="experience_title"` (or `"project_title"`) entry is correctly added.
2. The **same change** also triggers a `field_type="experience"` (or `"project"`) generic entry from `_append_entry_changes`.

The diff modal renders both sections — users see the same change in two places: "Title Enhancements" **and** "Experience" (or "Project").

**Code location:**
```python
# diffing.py lines 459-485
_append_entry_changes(
    changes,
    "workExperience",
    "experience",
    original.get("workExperience", []),
    improved.get("workExperience", []),
    _format_experience_entry,
    {"description", "highlights", "summary"},  # BUG: missing "position", "title"
)
_append_entry_changes(
    changes,
    "personalProjects",
    "project",
    original.get("personalProjects", []),
    improved.get("personalProjects", []),
    _format_project_entry,
    {"description", "highlights", "summary"},  # BUG: missing "name"
)
```

**Fix:**
```python
_append_entry_changes(
    changes,
    "workExperience",
    "experience",
    original.get("workExperience", []),
    improved.get("workExperience", []),
    _format_experience_entry,
    {"description", "highlights", "summary", "position", "title"},  # exclude title keys
)
_append_entry_changes(
    changes,
    "personalProjects",
    "project",
    original.get("personalProjects", []),
    improved.get("personalProjects", []),
    _format_project_entry,
    {"description", "highlights", "summary", "name"},  # exclude name
)
```

**Files to modify:**
- `apps/backend/app/services/tailoring/diffing.py`
- `apps/backend/tests/unit/test_resume_diff.py` — add/update test verifying a title-only change produces exactly one `experience_title` entry and zero `experience` entries

---

## Issue 3 — MEDIUM: `bold_keywords` not persisted to DB at confirm time

**Files:** `apps/backend/app/routers/resumes.py`, `apps/frontend/app/(default)/tailor/page.tsx`

**Problem:** The tailoring LLM returns `bold_keywords` in its response. The preview endpoint includes them in `ImproveResumeData.bold_keywords` (line 1456). However, these keywords are **never stored in the generation_run's `result_payload`** (lines 1406-1424 in the preview flow). As a result:

1. The confirm endpoint calls `_read_preview_tailoring_payload(request.generation_run_id)` and cannot find `bold_keywords`.
2. The confirmed resume is saved to the DB with `theme_settings` from the application pack, which has no `settings.bold_keywords`.
3. The confirm response returns `bold_keywords=[]` (the default).

**Current workaround (in place):** The tailor page (`tailor/page.tsx` line 238-243) carries `bold_keywords` forward from the preview result into the confirmed result, stores them in `ResumePreviewContext`, and the builder's `useEffect` (line 826-842) reads them from context and merges them into `themeSettings`, triggering autosave.

**Remaining gap:** If the user confirms a tailored resume and then:
- Downloads the PDF **directly from `/resumes/[id]`** (without visiting the builder first), the PDF is rendered using the DB-stored `theme_settings` which lacks `bold_keywords` — the PDF will have no bold keywords.
- Refreshes the browser before the builder autosave triggers — same result.

**Impact:** `bold_keywords` is the headline 2.0 feature. A user who goes through the tailor → resumes page → download flow will silently miss this feature.

**Fix (Option A — Backend, recommended):**
Store `bold_keywords` in the generation_run `result_payload` during preview and recover them in the confirm flow, then merge into the stored `theme_settings.settings.bold_keywords` for the new resume:

```python
# In preview result_payload (resumes.py ~line 1406-1424):
"bold_keywords": tailoring_result.bold_keywords,

# In confirm flow, recover:
bold_keywords_from_preview = preview_tailoring_payload.get("bold_keywords", [])

# When resolving theme_settings in confirm, merge bold_keywords:
if bold_keywords_from_preview:
    profile = theme_settings  # RenderThemeProfile
    current_settings = dict(profile.to_storage_dict().get("settings", {}))
    current_settings["bold_keywords"] = bold_keywords_from_preview
    # rebuild the profile with updated settings
```

**Fix (Option B — Frontend, simpler):**
In `buildConfirmPayload` (tailor/page.tsx), merge the `bold_keywords` from `result.data.bold_keywords` into the `theme_settings` sent with the confirm request. The `ImproveResumeConfirmRequest` already has `theme_settings: RenderThemeSettings | None`.

```typescript
// In buildConfirmPayload:
const boldKeywords = result.data.bold_keywords;
const baseThemeSettings = result.data.theme_settings;
const themeSettingsForConfirm = boldKeywords?.length && baseThemeSettings
    ? {
        ...baseThemeSettings,
        bold_keywords: true,
        settings: { ...(baseThemeSettings.settings ?? {}), bold_keywords: boldKeywords },
      }
    : baseThemeSettings ?? null;

return {
    resume_id: masterResumeId,
    job_id: result.data.job_id,
    improved_data: resumePreview as ResumeData,
    improvements: [...],
    application_pack_id: result.data.application_pack_id ?? null,
    generation_run_id: result.data.generation_run_id ?? null,
    include_cover_letter: includeCoverLetter,
    include_outreach_message: includeOutreachMessage,
    theme_settings: themeSettingsForConfirm,
};
```

Option B is lower risk (no backend change) and ensures the confirmed resume is saved with the correct settings immediately.

**Files to modify (Option B):**
- `apps/frontend/app/(default)/tailor/page.tsx`

---

## Issue 4 — MEDIUM: 2 failing vitest tests in `diff-preview-modal.test.tsx`

**File:** `apps/frontend/tests/diff-preview-modal.test.tsx`

**Problem:** 2 of 5 tests in this suite fail:

### 4a — "shows the high-risk warning banner when dangerous changes are present"
```
TestingLibraryElementError: Unable to find an element with the text: tailor.diffModal.warningTitle
```

The component renders `{t('tailor.diffModal.warningMessage')}` inside the warning banner, but there is **no** `{t('tailor.diffModal.warningTitle')}` element. The test expects a distinct warning title (e.g. "⚠ High Risk") before the message body.

**Component state (diff-preview-modal.tsx line 188-195):**
```tsx
{diffSummary.high_risk_changes > 0 && (
  <div className="...border-[#F97316]...">
    <AlertTriangle className="..."/>
    <p className="...">
      {t('tailor.diffModal.warningMessage')}  {/* only message, no title */}
    </p>
  </div>
)}
```

**Fix:** Add a title span before the warning message:
```tsx
<span className="font-mono text-xs font-bold text-[#C2410C]">
  {t('tailor.diffModal.warningTitle')}
</span>
```
And add `tailor.diffModal.warningTitle` to the i18n translation files (e.g. "⚠ High-Risk Changes Detected").

### 4b — "renders change attribution when breakdown is provided"
```
TestingLibraryElementError: Unable to find an element with the text: Change Attribution
```

The component renders `"Attribution"` as the section label (line 204), but the test expects `"Change Attribution"`.

**Fix:** Change `"Attribution"` → `"Change Attribution"` in the component to match the test expectation and improve clarity.

**Files to modify:**
- `apps/frontend/components/tailor/diff-preview-modal.tsx`
- `apps/frontend/lib/i18n/translations/` (add `warningTitle` key for each language)

---

## Issue 5 — LOW: TypeScript type errors in frontend test files

**Problem:** `npx tsc --noEmit` reports 5 errors in test files (production code is clean):

### 5a — `tests/additional-groups.test.ts`
```
error TS2353: Object literal may only specify known properties, and 'id' does not exist in type 'SkillGroup'.
```
The test uses `{ id: 'ml', label: 'Machine Learning', items: [] }` but `SkillGroup` is typed as `{ label: string; values: string[] }`. At runtime `normalizeAdditionalGroups` handles both shapes, but TypeScript rejects the test input.

**Fix:** Cast the test objects to `unknown as SkillGroup` or adjust to use the correct shape `{ label: 'Machine Learning', values: [] }`.

### 5b — `tests/regenerate-wizard.test.tsx`
```
error TS2322: Property 'skillsItem' does not exist in type 'IntrinsicAttributes & RegenerateDialogProps'
```
The test passes `skillsItem={null}` to `<RegenerateDialog>`, but `RegenerateDialogProps` was updated to use `additionalGroupItems: RegenerateItemInput[]` (the prop was renamed and its type changed from a single nullable item to an array).

**Fix:** Update all 3 render calls in the test from `skillsItem={null}` to `additionalGroupItems={[]}`.

**Files to modify:**
- `apps/frontend/tests/additional-groups.test.ts`
- `apps/frontend/tests/regenerate-wizard.test.tsx`

---

## Issue 6 — LOW: Dashboard "Unknown role" / "Unknown company" entries

**Observed during:** Browser test walkthrough

**Problem:** Several dashboard resume cards show `"Software Engineer @"` (no company) or `"Unknown role"` / `"Unknown company"`. These are older tailored resume records created before the JD target-metadata extraction was implemented or before job keywords were properly stored.

**Not a code bug** — the display logic correctly falls back to these strings when `role`/`company` fields are null. The data in the DB is simply incomplete for older entries.

**Recommended action:** Optionally backfill the `application_packs.role` and `application_packs.company` columns by re-running `extract_job_target_metadata` over the stored job descriptions. Or simply accept it as historical data debt and rely on the dashboard filter/search to surface proper records going forward.

---

## Task Breakdown

### Task 1: Fix diff double-reporting [Issue 2] ← HIGH priority

**Files:**
- `apps/backend/app/services/tailoring/diffing.py`
- `apps/backend/tests/unit/test_resume_diff.py`

- [ ] Add `"position"` and `"title"` to `ignore_keys` in the `workExperience` `_append_entry_changes` call
- [ ] Add `"name"` to `ignore_keys` in the `personalProjects` `_append_entry_changes` call
- [ ] Add unit test: when only `position` changes on an experience entry, exactly 1 `"experience_title"` diff is produced and 0 `"experience"` diffs
- [ ] Add unit test: when only `name` changes on a project entry, exactly 1 `"project_title"` diff is produced and 0 `"project"` diffs
- [ ] Run full test suite to confirm 0 regressions

### Task 2: Persist bold_keywords through confirm flow [Issue 3] ← MEDIUM priority

**Files (Option B — frontend-only):**
- `apps/frontend/app/(default)/tailor/page.tsx`

- [ ] In `buildConfirmPayload`, read `result.data.bold_keywords` and `result.data.theme_settings`
- [ ] If `boldKeywords` is non-empty, merge them into `theme_settings` (`bold_keywords: true` at top level, `settings.bold_keywords` as the list)
- [ ] Pass the merged `theme_settings` in the confirm payload
- [ ] Verify: after confirm, the new tailored resume's stored theme_settings has `settings.bold_keywords` populated (check the DB record)
- [ ] Verify: downloading PDF from `/resumes/[id]` (without visiting builder) produces a PDF with bold keywords

### Task 3: Fix failing frontend vitest tests [Issue 4] ← MEDIUM priority

**Files:**
- `apps/frontend/components/tailor/diff-preview-modal.tsx`
- `apps/frontend/lib/i18n/translations/en.json` (and other locale files)

- [ ] Add `{t('tailor.diffModal.warningTitle')}` element inside the warning banner
- [ ] Add `tailor.diffModal.warningTitle` to all i18n translation files (at minimum English, Spanish, Chinese, Japanese, Portuguese)
- [ ] Change `"Attribution"` → `"Change Attribution"` in the changeBreakdown section header
- [ ] Run `npx vitest run` to confirm all 5 `diff-preview-modal` tests pass

### Task 4: Fix TypeScript errors in test files [Issue 5] ← LOW priority

**Files:**
- `apps/frontend/tests/additional-groups.test.ts`
- `apps/frontend/tests/regenerate-wizard.test.tsx`

- [ ] In `additional-groups.test.ts`: replace `{ id: 'ml', label: ..., items: [] }` with `{ label: ..., values: [] }` or add an `as` cast
- [ ] In `regenerate-wizard.test.tsx`: rename `skillsItem={null}` → `additionalGroupItems={[]}` in all 3 render calls
- [ ] Run `npx tsc --noEmit` to confirm zero TypeScript errors

---

## Priority Order

1. **Task 1** (Issue 2) — Diff double-reporting degrades the diff modal UX for every title change, one of the key 2.0 improvements. Ship in next push.
2. **Task 2** (Issue 3) — bold_keywords are the headline 2.0 feature. The workaround (via builder context) covers most users, but the gap in the resumes/PDF download path is a silent quality regression.
3. **Task 3** (Issue 4) — 2 failing tests in CI will confuse future contributors. Fix alongside Task 1.
4. **Task 4** (Issue 5) — TypeScript errors in tests are low-harm but should be addressed for a clean CI.

---

## What Was Verified Working

- **232 backend tests pass** (after fixing Issue 1).
- **83/85 frontend vitest tests pass** (Issues 4a/4b account for the 2 failures).
- **All Phase-3.4.2 acceptance criteria confirmed in code**: bold_keywords type in Data, auto-population in builder, preserve_original_skills bypass, location merge fix, ats_keywords verification, experience_title/project_title in diffing and frontend types, dead code removed, stale import removed, bold_keywords flow test added.
- **Live browser**: Dashboard loads with resume history and filters; Settings page with LLM config, prompts, language, danger zone all render; Tailor page with JD input, mode selector, toggles; Builder with visual editor, YAML editor, Design/Locale tabs, theme controls, RenderCV preview panel.
- **API**: `/api/v1/health` returns `{"status": "healthy", ...}` ✓. Backend running on port 8000, frontend on port 3000.
- **Cover Letter, Outreach, JD Match tabs** in builder: correctly disabled for master resumes (expected behavior — only visible on tailored resumes).
