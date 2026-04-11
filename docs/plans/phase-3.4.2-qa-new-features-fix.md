# Phase 3.4.2 — QA: New Features Fix

**Goal:** Fix all gaps, bugs, and missing integrations found after the phase-3.3.3 prompt-refactor implementation. Every issue blocks or degrades the interview-quality output we are building toward.

**Scope of review:** Full backend pipeline (extraction → orchestration → preservation → diffing → router) and frontend (type definitions → improve preview flow → bold_keywords integration → diff display).

**Status of acceptance criteria (from phase-3.3.3):**

| Criterion | Status |
|-----------|--------|
| HONESTY block removed from system prompt | ✅ Done |
| Raw JD no longer in tailoring prompt | ✅ Done |
| Rich `JDIntelligence` extraction | ✅ Done |
| `position` in experience entries | ✅ Done |
| `name` + `tech_stacks` in project entries | ✅ Done |
| Skills have no hard count constraint | ⚠️ Partial — `preserve_original_skills` undoes it |
| `bold_keywords` returned by LLM → backend | ✅ Done |
| `bold_keywords` auto-populate in frontend | ❌ Not implemented |
| All three modes updated | ✅ Done |
| AI-phrase cleanup still runs | ✅ Done |
| `KEYWORD_INJECTION_PROMPT` removed | ✅ Done |
| Backward compat (cover letter, outreach, app pack) | ✅ Done |
| All existing tests pass | ✅ 160 passing |
| Prompt versions bumped to v4.0 | ✅ Done |

---

## Issue Index

| # | Severity | Area | Summary |
|---|----------|------|---------|
| 1 | CRITICAL | Frontend | `bold_keywords` missing from `Data` interface — silently dropped |
| 2 | CRITICAL | Frontend | No code auto-populates `theme_settings.settings.bold_keywords` from improve response |
| 3 | HIGH | Backend | `preserve_original_skills` undoes the LLM's intentional skill regrouping |
| 4 | HIGH | Backend | `extract_jd_intelligence` location merge condition is wrong (always overrides) |
| 5 | MEDIUM | Backend | `verify_generated_resume_result` warns on keywords using stale flat-key logic |
| 6 | MEDIUM | Backend | `diffing.py` does not produce `experience_title` / `project_title` field types |
| 7 | MEDIUM | Frontend | `ResumeFieldDiff.field_type` union doesn't include title-specific types |
| 8 | LOW | Backend | `skills_values_count: int = 0` is dead code in `TailoringResponseContract` |
| 9 | LOW | Backend | `analysis.py` has a stale redundant import of `EXTRACT_KEYWORDS_PROMPT` |
| 10 | LOW | Tests | No test verifies `TailoringResult.bold_keywords` flows from LLM → result |

---

## Issue 1 — CRITICAL: `bold_keywords` missing from frontend `Data` type

**File:** `apps/frontend/components/common/resume_previewer_context.tsx`

**Problem:** The `Data` interface represents the improve preview API response. The backend now returns `bold_keywords: list[str]` in the `ImproveResumeData` payload, but the frontend `Data` type doesn't declare this field. TypeScript treats it as `undefined`, and any code that would read `result.data.bold_keywords` gets `undefined` at runtime.

**Root cause:** `Data` was never updated when `bold_keywords` was added to the backend schema.

**Current state:**
```typescript
export interface Data {
  // ... existing fields ...
  change_breakdown?: TailoringStageBreakdown;
  // bold_keywords is NOT here
}
```

**Fix:** Add `bold_keywords?: string[]` to the `Data` interface.

**Files to modify:**
- `apps/frontend/components/common/resume_previewer_context.tsx`

---

## Issue 2 — CRITICAL: `bold_keywords` auto-population not implemented in frontend

**Files:** `apps/frontend/app/(default)/tailor/page.tsx`, `apps/frontend/components/builder/resume-builder.tsx`

**Problem:** The plan (Section 8) requires: "when receiving tailoring preview, auto-populate `theme_settings.settings.bold_keywords` from the response." This is entirely unimplemented. The improve preview response is received in `tailor/page.tsx` (`runGenerate` → `previewImproveResume`), the result stored in `pendingResult`, then confirmed via `confirmAndNavigate`. At no point is `result.data.bold_keywords` read and merged into `theme_settings.settings.bold_keywords`.

The `resume-builder.tsx` useEffect on line 826-833 syncs `theme_settings` from the improve response, but only the top-level `theme_settings` object — it does not merge in the bold_keywords from the parallel `bold_keywords` field.

**Impact:** Users never get bold keywords in their PDF even though the LLM generates them. The existing `RenderCvRuntimeSettings.bold_keywords` field and renderer support are in place — they just never get data.

**Fix:** In `tailor/page.tsx`, after receiving the preview result, merge `result.data.bold_keywords` (if non-empty) into the theme settings that will be used for the confirm flow. The cleanest place is in `buildConfirmPayload` or as a separate step before calling `confirmImproveResume`.

In `resume-builder.tsx`, the `useEffect` that calls `setThemeSettings(improvedThemeSettings)` should also merge in `bold_keywords` from `improvedData.data.bold_keywords` into `settings.bold_keywords`.

**Suggested logic (tailor/page.tsx):**
```typescript
// After receiving result from previewImproveResume:
const boldKeywords = result?.data?.bold_keywords;
if (boldKeywords && boldKeywords.length > 0) {
  // merge into themeSettings for the confirm payload and display
  setThemeSettings(prev => ({
    ...prev,
    settings: { ...prev.settings, bold_keywords: boldKeywords },
  }));
}
```

**Files to modify:**
- `apps/frontend/app/(default)/tailor/page.tsx`
- `apps/frontend/components/builder/resume-builder.tsx`

---

## Issue 3 — HIGH: `preserve_original_skills` undoes LLM's intentional skill regrouping

**File:** `apps/backend/app/services/tailoring/preservation.py`

**Problem:** `finalize_tailored_resume` always calls `preserve_original_skills`, which always calls `restore_missing_additional_items`. This function adds back any original skill values that are "missing" from the LLM's output.

In 2.0, the LLM is explicitly allowed to regroup and expand skills. When it produces a new skills structure (e.g. regrouped from 3 groups to 4 groups with new JD-relevant labels), `preserve_original_skills` immediately corrupts it by injecting the original values back in. This directly contradicts the plan (Section 6):

> "If the LLM produced skills, use them as authoritative."

**Root cause:** `preserve_original_skills` was designed for the old 1.x approach where skills were immutable. The 2.0 approach removed the hard count constraint in `apply_compact_diff` but forgot to conditionally skip `preserve_original_skills`.

**Current behavior:**
1. `apply_compact_diff` writes LLM's new skill groups → correct
2. `rehydrate_tailoring_resume` builds a full resume → correct
3. `preserve_original_skills` sees original had "AWS" in "Cloud" group but LLM's new "Cloud & DevOps" group has "AWS" (just in a renamed group) → may still add it correctly, OR if the LLM removed a skill intentionally, it gets re-added → incorrect

**Fix:** In `finalize_tailored_resume`, check whether the LLM returned a skills key before calling `preserve_original_skills`. If `raw_llm_resume_data` contains `skills.groups`, treat LLM skills as authoritative. The boolean can be passed down from `apply_compact_diff` or detected by inspecting the payload:

```python
# In finalize_tailored_resume:
llm_returned_skills = bool(
    payload.skills and payload.skills.groups
)
if not llm_returned_skills:
    result = preserve_original_skills(original_resume_data, result)
# else: LLM's skills are authoritative — don't restore missing items
```

**Files to modify:**
- `apps/backend/app/services/tailoring/preservation.py`

---

## Issue 4 — HIGH: Location merge condition in `extract_jd_intelligence` always overrides

**File:** `apps/backend/app/services/tailoring/analysis.py` (line ~185)

**Problem:** The merge logic that backfills `location` from `target_metadata` has a logic error:

```python
if not result.get("location") and isinstance(result.get("location"), type(None)):
    result["location"] = target_metadata.get("location")
```

The second condition `isinstance(result.get("location"), type(None))` is always True when `not result.get("location")` is True (it's checking `isinstance(None, NoneType)` which is always True when the value is None). But if `location` is an empty string `""`, `not result.get("location")` is True but `isinstance("", type(None))` is False — meaning an empty-string location won't be overridden from metadata, which is correct behavior.

More importantly, when the LLM returns the new nested format and `result["location"] = "Remote"` (a real value), both conditions are False and it won't override — this is correct.

However, there's a subtle issue: when the LLM returns the new nested dict format, `result` already has the `location` field populated from the LLM extraction (e.g. `"location": "Remote"`). The `extract_job_target_metadata` function also tries to extract location independently. The condition should really be:

```python
if result.get("location") is None:
    result["location"] = target_metadata.get("location")
```

This is clearer and handles the empty-string edge case correctly. The `isinstance` check is confusing and should be removed.

**Fix:**
```python
if result.get("location") is None:
    result["location"] = target_metadata.get("location")
```

**Files to modify:**
- `apps/backend/app/services/tailoring/analysis.py`

---

## Issue 5 — MEDIUM: `verify_generated_resume_result` warns about keywords using stale logic

**File:** `apps/backend/app/services/tailoring/verification.py`

**Problem:** `verify_generated_resume_result` calls `find_supported_keywords(job_keywords, original)`, which uses `collect_job_keywords` to read the flat `required_skills`, `preferred_skills`, and `keywords` keys from the `job_keywords` dict.

In the 2.0 pipeline, `job_keywords` is the merged dict from `extract_job_keywords` which includes both legacy flat keys and the nested JDIntelligence structure. The flat `required_skills` key comes from `to_legacy_keywords()` which maps `technical_requirements.primary_stack`. This means verification will check for presence of `primary_stack` technologies in the result.

The issue: the 2.0 system uses `ats_keywords` for keyword guidance (much richer than `required_skills`) and the writing strategy is to weave keywords naturally rather than ensuring every keyword from `required_skills` appears verbatim. The verifier will produce spurious warnings like "Supported job keywords still missing after tailoring: Kubernetes, CI/CD" even when the LLM correctly used them in context.

Additionally, `verify_generated_resume_result` still emits warnings using "nudge mode introduced structural content changes" which is based on old assumptions — nudge mode in 2.0 can still change titles (by not changing them) but the mode semantics changed slightly.

**Fix:** Update `verify_generated_resume_result` to use `ats_keywords` from the `JDIntelligence` structure (available via the merged dict) instead of the flat legacy keys. If `job_keywords.get("ats_keywords")` is present, use those; otherwise fall back to the legacy path.

```python
# In verify_generated_resume_result:
ats_keywords = job_keywords.get("ats_keywords")
if ats_keywords and isinstance(ats_keywords, list):
    supported_keywords = [k for k in ats_keywords if keyword_in_text(k, extract_resume_text(original))]
else:
    supported_keywords = find_supported_keywords(job_keywords, original)
```

**Files to modify:**
- `apps/backend/app/services/tailoring/verification.py`

---

## Issue 6 — MEDIUM: `diffing.py` doesn't produce `experience_title` / `project_title` field types

**File:** `apps/backend/app/services/tailoring/diffing.py`

**Problem:** The plan (Section 8, Task 6) says: "Add title/name comparison to `calculate_resume_diff()` in `diffing.py`. New `field_type` values: `"experience_title"`, `"project_title"`."

Currently, `_append_entry_changes` uses `ignore_keys={"description", "highlights", "summary"}`, which means changes to `position`/`title` in experience entries ARE detected — but they're reported as `field_type="experience"` (the generic entry-level change type). This means:

1. In the diff modal, a title change appears in the "Experience (entry-level)" section alongside company-name / date metadata changes
2. There's no way to distinguish "entry metadata changed" vs "job title was enhanced" in the frontend
3. The `field_type` union in the frontend type doesn't include title-specific values

**Fix:** Add specific `position`/`name` change detection before the generic `_append_entry_changes` loop:

```python
# Detect experience title/position changes specifically
for idx, (orig, improved) in enumerate(zip(original_experiences, improved_experiences)):
    orig_pos = _first_text(orig, "position", "title")
    improved_pos = _first_text(improved, "position", "title")
    if orig_pos != improved_pos and orig_pos and improved_pos:
        changes.append(ResumeFieldDiff(
            field_path=f"workExperience[{idx}].position",
            field_type="experience_title",
            change_type="modified",
            original_value=orig_pos,
            new_value=improved_pos,
            confidence="medium",
        ))

# Detect project name changes
for idx, (orig, improved) in enumerate(zip(original_projects, improved_projects)):
    orig_name = _clean_text(orig.get("name"))
    improved_name = _clean_text(improved.get("name"))
    if orig_name != improved_name and orig_name and improved_name:
        changes.append(ResumeFieldDiff(
            field_path=f"personalProjects[{idx}].name",
            field_type="project_title",
            change_type="modified",
            original_value=orig_name,
            new_value=improved_name,
            confidence="medium",
        ))
```

**Files to modify:**
- `apps/backend/app/services/tailoring/diffing.py`

---

## Issue 7 — MEDIUM: Frontend `ResumeFieldDiff.field_type` union outdated

**File:** `apps/frontend/components/common/resume_previewer_context.tsx`

**Problem:** Once Issue 6 is fixed, the backend will emit `"experience_title"` and `"project_title"` as `field_type` values. The frontend union type doesn't include them, so TypeScript will flag them as unknown.

Additionally, the `diff-preview-modal.tsx` doesn't have a section that renders these new types — they'd be silently ignored.

**Current type:**
```typescript
field_type:
  | 'additional_item'
  | 'additional_group'
  | 'description'
  | 'summary'
  | 'experience'
  | 'education'
  | 'project';
```

**Fix:**
1. Add `'experience_title' | 'project_title'` to the union in `resume_previewer_context.tsx`
2. Add a rendering section in `diff-preview-modal.tsx` for title changes (e.g. "Title enhancements" section) so they're surfaced to the user

**Files to modify:**
- `apps/frontend/components/common/resume_previewer_context.tsx`
- `apps/frontend/components/tailor/diff-preview-modal.tsx`

---

## Issue 8 — LOW: `skills_values_count` is dead code

**File:** `apps/backend/app/services/tailoring/models.py`

**Problem:** `TailoringResponseContract` still declares `skills_values_count: int = 0`. It was set to 0 in `contracts.py` (the setter was removed), never used in `to_prompt_dict()` (removed in the refactor), and serves no purpose. It will never be non-zero.

**Fix:** Remove the field from `TailoringResponseContract`. No downstream code reads it.

**Files to modify:**
- `apps/backend/app/services/tailoring/models.py`
- `apps/backend/app/services/tailoring/contracts.py` (no-op setter already removed — just remove the field declaration)

---

## Issue 9 — LOW: Stale redundant import in `analysis.py`

**File:** `apps/backend/app/services/tailoring/analysis.py`

**Problem:** Line 11 imports `EXTRACT_KEYWORDS_PROMPT` and `EXTRACT_KEYWORDS_SYSTEM_PROMPT` from `app.prompts`. These are now aliases for the new prompts (`EXTRACT_JD_INTELLIGENCE_PROMPT` etc.), imported again on line 12 directly. The line 11 import is redundant.

```python
from app.prompts import EXTRACT_KEYWORDS_PROMPT, EXTRACT_KEYWORDS_SYSTEM_PROMPT, PROMPT_VERSIONS  # redundant
from app.prompts.templates import EXTRACT_JD_INTELLIGENCE_PROMPT, EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT  # actual usage
```

**Fix:** Remove the `EXTRACT_KEYWORDS_PROMPT` and `EXTRACT_KEYWORDS_SYSTEM_PROMPT` names from the `from app.prompts import ...` line (keep `PROMPT_VERSIONS`).

**Files to modify:**
- `apps/backend/app/services/tailoring/analysis.py`

---

## Issue 10 — LOW: No test for `bold_keywords` flowing through to `TailoringResult`

**File:** `apps/backend/tests/service/test_improver.py`

**Problem:** `test_sample_data_run_reports_manifest_and_stage_breakdown` doesn't verify that `bold_keywords` from the LLM response flow into `TailoringResult.bold_keywords`. This is the core new output of the 2.0 system and has no coverage.

**Fix:** Add a mock LLM return with `bold_keywords` and assert `result.bold_keywords` matches:

```python
async def test_bold_keywords_flow_into_tailoring_result(
    self, mock_llm, sample_resume, sample_job_keywords, sample_job_description
):
    mock_llm.return_value = _llm_compact_output(
        summary="5 years building distributed systems.",
        bold_keywords=["Kubernetes", "microservices", "CI/CD", "REST APIs"],
    )
    result = await generate_tailored_resume(
        original_resume="# Resume markdown",
        job_description=sample_job_description,
        job_keywords=sample_job_keywords,
        original_resume_data=sample_resume,
    )
    assert result.bold_keywords == ["Kubernetes", "microservices", "CI/CD", "REST APIs"]
```

Also need to update `_llm_compact_output` helper to accept `bold_keywords`.

**Files to modify:**
- `apps/backend/tests/service/test_improver.py`

---

## Task Breakdown

### Task 1: Fix `bold_keywords` frontend type + auto-population [Issues 1, 2]

**Files:**
- Modify: `apps/frontend/components/common/resume_previewer_context.tsx`
- Modify: `apps/frontend/app/(default)/tailor/page.tsx`
- Modify: `apps/frontend/components/builder/resume-builder.tsx`

- [ ] **Step 1:** Add `bold_keywords?: string[]` to the `Data` interface in `resume_previewer_context.tsx`
- [ ] **Step 2:** In `tailor/page.tsx` `runGenerate` function, after receiving preview result, if `result.data.bold_keywords` is non-empty, update local theme settings state so it propagates into the confirm flow and into `improvedThemeSettings`
- [ ] **Step 3:** In `resume-builder.tsx`, in the `useEffect` that syncs `improvedThemeSettings` (line ~826), also merge `improvedData.data.bold_keywords` into `settings.bold_keywords` if present
- [ ] **Step 4:** Verify bold keywords appear in the `RenderCvRuntimeSettings.bold_keywords` before PDF render

### Task 2: Fix `preserve_original_skills` for 2.0 [Issue 3]

**Files:**
- Modify: `apps/backend/app/services/tailoring/preservation.py`

- [ ] **Step 1:** In `finalize_tailored_resume`, detect whether `payload.skills` contains groups (LLM returned skills)
- [ ] **Step 2:** Skip `preserve_original_skills` when LLM returned a skills structure
- [ ] **Step 3:** Add test in `test_compact_diff.py` or `test_improver.py` confirming that LLM's new skill groups are preserved without original skill injection

### Task 3: Fix location merge condition [Issue 4]

**Files:**
- Modify: `apps/backend/app/services/tailoring/analysis.py`

- [ ] **Step 1:** Change `isinstance(result.get("location"), type(None))` to `result.get("location") is None`
- [ ] **Step 2:** Simplify to single `if result.get("location") is None:` condition

### Task 4: Update `verify_generated_resume_result` to use `ats_keywords` [Issue 5]

**Files:**
- Modify: `apps/backend/app/services/tailoring/verification.py`

- [ ] **Step 1:** Check for `ats_keywords` in `job_keywords` dict
- [ ] **Step 2:** If present, filter to those found in original resume text; use for missing-keyword check
- [ ] **Step 3:** Fall back to legacy `find_supported_keywords` if `ats_keywords` not present
- [ ] **Step 4:** Update `test_verify_diffs.py` test `test_warns_when_supported_keywords_are_still_missing` to pass `ats_keywords` in job_keywords and verify warning still fires

### Task 5: Add title change detection to `diffing.py` + update frontend types [Issues 6, 7]

**Files:**
- Modify: `apps/backend/app/services/tailoring/diffing.py`
- Modify: `apps/frontend/components/common/resume_previewer_context.tsx`
- Modify: `apps/frontend/components/tailor/diff-preview-modal.tsx`

- [ ] **Step 1:** Add `experience_title` and `project_title` detection in `calculate_resume_diff` before the `_append_entry_changes` calls — detect `position`/`title` changes in experience, `name` changes in projects
- [ ] **Step 2:** Add `'experience_title' | 'project_title'` to `ResumeFieldDiff.field_type` union in frontend
- [ ] **Step 3:** Add a "Title Enhancements" rendering section in `diff-preview-modal.tsx` that filters on these new types
- [ ] **Step 4:** Add unit tests in `test_resume_diff.py` for title-change detection

### Task 6: Clean up dead code + add `bold_keywords` test [Issues 8, 9, 10]

**Files:**
- Modify: `apps/backend/app/services/tailoring/models.py`
- Modify: `apps/backend/app/services/tailoring/analysis.py`
- Modify: `apps/backend/tests/service/test_improver.py`

- [ ] **Step 1:** Remove `skills_values_count: int = 0` from `TailoringResponseContract`
- [ ] **Step 2:** Remove `EXTRACT_KEYWORDS_PROMPT, EXTRACT_KEYWORDS_SYSTEM_PROMPT` from the redundant import line in `analysis.py`
- [ ] **Step 3:** Add `bold_keywords` param to `_llm_compact_output` helper in `test_improver.py`
- [ ] **Step 4:** Add `test_bold_keywords_flow_into_tailoring_result` test
- [ ] **Step 5:** Run full test suite to confirm 0 regressions

---

## Priority Order

Execute in this order for maximum impact:

1. **Task 1** (Issues 1+2) — Bold keywords are the headline new feature and currently completely dead in the frontend. Fix types first, then wire up auto-population.
2. **Task 2** (Issue 3) — Skills expansion is the second headline feature. The current preservation step silently undoes the LLM's skill regrouping.
3. **Task 5** (Issues 6+7) — Title changes need to surface in the diff UI so users see the enhancement.
4. **Task 3** (Issue 4) — Simple 1-line fix, ships with Task 1 PR.
5. **Task 4** (Issue 5) — Spurious verification warnings are low-harm but annoying in logs.
6. **Task 6** (Issues 8-10) — Cleanup + test coverage.
