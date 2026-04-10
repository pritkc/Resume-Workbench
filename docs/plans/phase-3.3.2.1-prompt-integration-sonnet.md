# Phase 3.3.2.1 — Prompt Integration: End-to-End Product Completion

## Goal

Wire the optimized Phase 3.3.2 prompts (lean system prompt, lean user prompt, lean contract) into the full
end-to-end product and fix every remaining gap between the LLM output and what the UI/API needs.
After this phase ships, the product should be fully functional, top to bottom, with no placeholders.

---

## System Architecture Map

```
User → Frontend (Next.js)
         ↓ POST /api/resumes/improve/preview
         ↓ POST /api/resumes/improve/confirm
       FastAPI (routers/resumes.py)
         ↓ extract_job_keywords()           [analysis.py → LLM]
         ↓ generate_tailored_resume()       [orchestration.py → LLM ← PROMPT (3.3.2)]
         ↓ finalize_tailored_resume()       [preservation.py]  ← local guardrails
         ↓ build_change_manifest()          [change_manifest.py]
         ↓ calculate_resume_diff()          [diffing.py]       ← UI diff display
         ↓ generate_cover_letter/outreach() [cover_letter.py → LLM]
         ↓ render_resume_bundle()           [rendercv_engine]  ← PDF + PNG artifacts
         ↓ db.create_generation_run()       ← observability
       Frontend renders result
```

The **LLM boundary** is clean: `orchestration.py:generate_tailored_resume()` is the only caller of
the tailoring LLM, and it already uses the new lean prompts from 3.3.2. Everything downstream is pure
Python — no further prompt changes needed for the tailoring path.

---

## Current State After 3.3.2

| Layer | Status |
|---|---|
| `TAILORING_SYSTEM_PROMPT` | ✅ Lean v3.0 — changes array format in OUTPUT block |
| `IMPROVE_RESUME_PROMPT_TEMPLATE` | ✅ Lean v3.0 — `CHANGES ARRAY RULES` block removed |
| `TailoringResponseContract.to_prompt_dict()` | ✅ Lean serializer — ~65% fewer contract tokens |
| `prompting.py` build_prompt_context | ✅ Calls `to_prompt_dict()` |
| `templates.py` versions | ✅ v3.0 |
| All 15 `test_improver.py` tests | ✅ Passing |

---

## Gap Analysis — What Is Not Yet Wired

### Gap 1 — `changes[]` op field vs. action field mismatch

**Problem:** The new system prompt instructs the LLM to emit:
```json
{"op": "replace", "path": "...", "original": "...", "value": "..."}
```
But `TailoringLLMResponse` (which inherits from `TailoringResumePayload`) validates changes against
`ResumeChange` schema, which uses `"action"` not `"op"`:

```python
# schemas/models.py — ResumeChange
class ResumeChange(BaseModel):
    path: str
    action: str       # ← "action", not "op"
    original: str | None = None
    value: Any = None
    reason: str | None = None
```

The old prompt used `replace` / `append` / `regroup` in the CHANGES ARRAY RULES block, matching
`action`. New system prompt uses `op`. This mismatch means `validate_declared_changes()` will silently
drop all changes (they'll be in `rejected_declared_changes`).

**Fix:** Either:
- (A) Update `ResumeChange` to accept both `action` and `op` (with `op` as alias), OR  
- (B) Revert `op` in the system prompt back to `action` (simpler, no schema change)

**Recommended:** Option B — change `op:` → `action:` in `TAILORING_SYSTEM_PROMPT`. The word `op` saves
nothing over `action` in terms of token count and risks breaking the contract validation.

**File:** `apps/backend/app/prompts/templates.py` — `TAILORING_SYSTEM_PROMPT` OUTPUT block

**Change:**
```diff
- changes[]: one record per edit, indexed path (e.g. workExperience[0].description[2])
-   - op: "replace" | "append" | "regroup"; include "original" when replacing
+ changes[]: one record per edit, indexed path (e.g. workExperience[0].description[2])
+   - action: "replace" | "append" | "regroup"; include "original" when replacing
```

---

### Gap 2 — `customSections` empty dict not triggering `preserve` flag

**Problem:** `TailoringResponseContract.to_prompt_dict()` sets `"preserve": true` on `customSections`
only when `section.keys or section.rules` is truthy. But when `customSections` is empty `{}`,
`build_response_contract()` sets `keys=[]` and `rules=["Preserve keys and types."]`, so `rules` IS
truthy — `preserve` will appear. ✅ No issue for non-empty custom sections.

**However:** When `customSections` has actual sub-sections (e.g. `publications`), those are stored in
`section.sections` (nested `TailoringSectionContract`), not `section.keys`. The `to_prompt_dict()`
method never emits the nested sub-section details for `customSections` — the model just gets
`"customSections": {"preserve": true}` and has to infer the structure from the resume JSON itself.

**Status:** Acceptable for now. The model sees the full resume JSON with its `customSections` keys,
so it can infer the structure. The `preserve` flag is sufficient instruction. ✅ No change needed.

---

### Gap 3 — `max_tokens=15000` may truncate long resumes

**Problem:** `orchestration.py` passes `max_tokens=15000` to `complete_json()`. With the lean prompt
saving ~1,500 input tokens, the max_response budget is now more generous — but for very long resumes
the LLM may still truncate mid-JSON. The retry hint already handles this, but the root fix is to:

**Fix:** Raise `max_tokens` to `16000` (Sonnet's practical max output limit) now that we have the
input budget headroom.

**File:** `apps/backend/app/services/tailoring/orchestration.py` line 93

```diff
- max_tokens=15000,
+ max_tokens=16000,
```

---

### Gap 4 — `improve_resume` legacy endpoint re-extracts job keywords every call

**Problem:** `routers/resumes.py:improve_resume_endpoint` (the legacy `/improve` endpoint, line 1784)
always calls `extract_job_keywords(job["content"])` even if `job["job_keywords"]` is already cached
with a matching `job_keywords_hash`. The preview flow (`_improve_preview_flow`) already has hash
checking but the legacy endpoint skips it.

**Fix:** Apply the same hash-check pattern from `_improve_preview_flow` (lines 1241-1263) to
`improve_resume_endpoint`.

**File:** `apps/backend/app/routers/resumes.py` — `improve_resume_endpoint` function (~line 1821)

```python
# Current (always extracts):
job_keywords = await extract_job_keywords(job["content"])

# Fixed (cached):
job_keywords = job.get("job_keywords")
job_keywords_hash = job.get("job_keywords_hash")
content_hash = _hash_job_content(job["content"])
if not job_keywords or job_keywords_hash != content_hash:
    job_keywords = await extract_job_keywords(job["content"])
    try:
        db.update_job(request.job_id, {"job_keywords": job_keywords, "job_keywords_hash": content_hash})
    except Exception as e:
        logger.warning("Failed to cache job keywords for job %s: %s", request.job_id, e)
```

---

### Gap 5 — `IMPROVE_STRATEGY_GUIDANCE` still referenced in `orchestration.py` but v3.0 prompts no longer use `strategy_primary_goal`

**Problem:** `build_prompt_context()` sets `strategy_primary_goal` from `IMPROVE_STRATEGY_GUIDANCE`,
and `TailoringPromptContext` carries it. But `render_tailoring_prompt()` does NOT pass it to the
template — it was removed in a previous phase. The field is computed but never used.

**Status:** Dead code, not a bug. It doesn't affect correctness but wastes ~5ms of computation.

**Fix (optional cleanup):** Remove `strategy_primary_goal` from `TailoringPromptContext` dataclass
and from `build_prompt_context()`. Keep `IMPROVE_STRATEGY_GUIDANCE` in `templates.py` since it
informs `description_rule` which is surfaced to config UI.

---

### Gap 6 — Frontend tailor component not sending `prompt_id`

**Problem:** The frontend `tailor` component calls `POST /resumes/improve/preview` but may not be
sending `prompt_id` in the request body. Without it, `_resolve_prompt_id(None)` falls back to the
`default_prompt_id` in config (usually `keywords`), never reaching `full` mode unless explicitly
configured.

**Fix:** Frontend `ImproveResumeRequest` body must include `prompt_id: "full"` (or whichever the
UI selector value is). Verify the tailor component's API call includes the prompt_id field from the
mode selector dropdown.

**Files to check:**
- `apps/frontend/components/tailor/` — the improve request payload builder
- `apps/frontend/hooks/` — any `useImproveResume` or similar hook

---

### Gap 7 — `changes[]` validated against narrow allow-list in `validate_declared_changes()`

**Problem:** `change_manifest.py:_ALLOWED_PATH_PATTERNS` contains a fixed allow-list of path regexes.
If the model emits a path like `workExperience[0].description` (without an index), it gets rejected.
The system prompt now instructs: `indexed path (e.g. workExperience[0].description[2])` which is correct,
but the pattern `r"^workExperience\[\d+\]\.description(\[\d+\])?$"` makes the index optional — so
`workExperience[0].description` (no bullet index) IS allowed for array-level replace ops.

**Status:** No change needed — the existing patterns already handle this correctly. ✅

---

### Gap 8 — `refiner.py:remove_ai_phrases` runs against job_content but `full` mode job_content can be truncated

**Problem:** `preservation.py:apply_local_resume_cleanup()` calls `remove_ai_phrases(result, job_content)`.
The `job_content` passed is the **full** JD (not the trimmed excerpt). But the prompt was built with the
**trimmed** JD. This is correct — the refiner should check against the full JD for phrase grounding.
No issue.

**Status:** ✅ No change needed.

---

### Gap 9 — Observability: `stage_breakdown` not surfaced in `/improve/preview` warnings when changes are rejected

**Problem:** `tailoring_result.rejected_declared_changes` is stored in `generation_run.result_payload`
but is NOT included in `response_warnings` returned to the frontend. Rejected changes (model claims
edits that don't match the original text) are silently swallowed in the preview response's `warnings`.

**Fix:** Add a warning to `response_warnings` in `_improve_preview_flow` if
`tailoring_result.rejected_declared_changes` is non-empty:

```python
if tailoring_result.rejected_declared_changes:
    response_warnings.append(
        f"{len(tailoring_result.rejected_declared_changes)} declared change(s) could not be verified"
    )
```

**File:** `apps/backend/app/routers/resumes.py` — `_improve_preview_flow`, after line 1273

---

### Gap 10 — Word-count bloat guard threshold needs tuning for `full` mode

**Problem:** `verification.py` fires a warning when result words > 1.8× original words. In `full`
mode, a resume that adds one bullet per 4 entries on a 1,000-word resume might legitimately grow to
~1,100 words (~1.1×). The 1.8× threshold is correct. **No change needed** — it's already conservative.

**Status:** ✅ No change needed.

---

## Complete Implementation Steps

### Step 1 — Fix `op` → `action` in system prompt [CRITICAL]

**File:** `apps/backend/app/prompts/templates.py`

In `TAILORING_SYSTEM_PROMPT`, change the OUTPUT block line:
```diff
-   - op: "replace" | "append" | "regroup"; include "original" when replacing
+   - action: "replace" | "append" | "regroup"; include "original" when replacing
```

Bump `tailoring_system` to `v3.1`.

---

### Step 2 — Raise `max_tokens` to 16000

**File:** `apps/backend/app/services/tailoring/orchestration.py` line 93

```diff
- max_tokens=15000,
+ max_tokens=16000,
```

---

### Step 3 — Cache job keywords in legacy `/improve` endpoint

**File:** `apps/backend/app/routers/resumes.py` — `improve_resume_endpoint`

Replace the unconditional `extract_job_keywords` call (~line 1821) with the hash-check pattern
already used in `_improve_preview_flow`.

---

### Step 4 — Surface rejected changes as warnings in preview response

**File:** `apps/backend/app/routers/resumes.py` — `_improve_preview_flow`

After `response_warnings = list(tailoring_result.warnings)` (line 1273), add:

```python
if tailoring_result.rejected_declared_changes:
    response_warnings.append(
        f"{len(tailoring_result.rejected_declared_changes)} declared change(s) could not be verified"
    )
```

---

### Step 5 — Remove dead `strategy_primary_goal` field (optional cleanup)

**Files:**
- `apps/backend/app/services/tailoring/prompting.py` — remove field from `TailoringPromptContext` and `build_prompt_context()`

---

### Step 6 — Verify frontend sends `prompt_id`

**Files:**
- `apps/frontend/components/tailor/` — confirm `prompt_id` is included in request payload
- `apps/frontend/hooks/` — any improve resume hook

If missing, add `prompt_id` to the payload builder using the UI mode selector value.

---

### Step 7 — End-to-end smoke test

Run the existing test suite and verify manually:

```bash
# Unit tests
cd apps/backend && python -m pytest tests/service/test_improver.py -v

# Full integration smoke test (manual):
# 1. Upload a resume → verify processed_data populated
# 2. Add a job description → verify job_keywords extracted and cached
# 3. POST /improve/preview → verify:
#    - response.data.resume_preview has tailored bullets
#    - response.data.change_manifest has indexed paths
#    - response.data.change_breakdown.llm_declared_changes > 0
#    - response.data.change_breakdown.llm_rejected_changes == 0 (or near 0)
#    - response.data.artifacts has PDF + PNG preview
# 4. POST /improve/confirm → verify tailored resume persisted with resume_id
# 5. GET /resumes?resume_id={id} → verify all fields populated
```

---

## Data Flow: Request to Response (Complete)

```
1. Frontend: POST /resumes/improve/preview
   { resume_id, job_id, prompt_id: "full", include_cover_letter: true }

2. Router: routers/resumes.py
   a. db.get_resume(resume_id) → original resume
   b. db.get_job(job_id) → job + cached job_keywords
   c. If keywords stale → extract_job_keywords(jd) → LLM call #1

3. Orchestration: orchestration.py:generate_tailored_resume()
   a. TailoringResumePayload.from_resume_data() — strips personalInfo/education/sectionMeta
   b. find_supported_keywords() — pure Python
   c. build_job_analysis() — pure Python
   d. trim_job_description_for_prompt() — pure Python
   e. build_response_contract() — lean contract via to_prompt_dict()
   f. build_prompt_context() → render_tailoring_prompt()
      System: TAILORING_SYSTEM_PROMPT v3.1
      User:   IMPROVE_RESUME_PROMPT_TEMPLATE v3.0
              + lean contract (~380 tokens vs ~1,100)
   g. complete_json(prompt, system_prompt, max_tokens=16000) → LLM call #2
   h. TailoringLLMResponse.model_validate(result) → typed response
   i. rehydrate_tailoring_resume() — adds back personalInfo/education/sectionMeta
   j. finalize_tailored_resume():
      - preserve_personal_info()     ← immutable fields enforced locally
      - restore_original_dates()     ← date precision guard
      - restore_dates_from_markdown()← markdown fallback
      - preserve_original_skills()   ← skill completeness guard
      - protect_custom_sections()    ← hallucination guard
      - apply_local_resume_cleanup() ← remove_ai_phrases + alignment violations
   k. build_change_manifest()        ← computed ground-truth changes
   l. validate_declared_changes()    ← LLM-declared vs ground-truth reconcile
   m. build_stage_breakdown()        ← UI observability stats

4. Router (continued):
   a. _canonicalize_improved_resume_data() → normalize
   b. _calculate_diff_from_resume() → diff_summary + detailed_changes for UI
   c. generate_improvements()        ← rule-based suggestions (no LLM)
   d. _generate_auxiliary_messages() → cover_letter + outreach (LLM calls #3/#4, optional)
   e. _backfill_job_target_metadata() → role/company/location
   f. db.create_application_pack()   ← pack record
   g. db.create_generation_run()     ← observability record
   h. render_resume_bundle()         ← RenderCV PDF + PNG
   i. store_rendercv_bundle()        ← artifact storage

5. Response: ImproveResumeResponse
   {
     data: {
       resume_id: null,          ← null in preview
       application_pack_id: ...,
       generation_run_id: ...,
       resume_preview: { ... },  ← full tailored ResumeData
       change_manifest: [...],   ← indexed paths + actions
       change_breakdown: { ... },← stage stats
       diff_summary: { ... },    ← total changes count
       detailed_changes: [...],  ← field-level diffs for UI highlighting
       cover_letter: "...",
       outreach_message: "...",
       artifacts: [...],         ← PDF + PNG preview artifacts
       theme_settings: { ... },
       warnings: [...],
     }
   }

6. Frontend: user reviews preview → POST /resumes/improve/confirm
   { resume_id, job_id, improved_data, generation_run_id, application_pack_id }

7. Router: routers/resumes.py:improve_resume_confirm_endpoint()
   a. _canonicalize_improved_resume_data(request.improved_data)
   b. _validate_confirm_payload() ← personalInfo integrity check
   c. Preview hash validation ← replay attack guard
   d. _resolve_confirm_auxiliary_messages() ← reuse cached cover_letter/outreach
   e. db.create_resume() ← persisted tailored resume
   f. db.create_improvement()
   g. db.update_application_pack(status="confirmed")
   h. render_resume_bundle() → PDF + PNG (final render)
   i. db.create_generation_run(run_kind="application_pack_confirm")

8. Response: ImproveResumeResponse
   { data: { resume_id: "new-id", ... } }  ← non-null resume_id
```

---

## Schema Contracts (No Changes Needed)

The following schemas are already correct and require no modification:

| Schema | Status |
|---|---|
| `TailoringLLMResponse` | ✅ Validates the full LLM JSON output |
| `TailoringResumePayload` | ✅ Sent to and read from LLM |
| `TailoringResponseContract` | ✅ `to_prompt_dict()` serializer added in 3.3.2 |
| `ResumeChange` | ⚠️ `action` field — must match what system prompt says (Step 1) |
| `ImproveResumeResponse` | ✅ Complete |
| `ImproveResumeData` | ✅ Complete |
| `ResumeDiffSummary` | ✅ Complete |
| `TailoringStageBreakdown` | ✅ Complete |

---

## Prompt Token Budget (After 3.3.2 + 3.3.2.1)

| Input component | Tokens (est.) | Notes |
|---|---|---|
| System prompt | ~140 | v3.1 (fixed op→action) |
| User prompt instructions | ~95 | v3.0 |
| Job analysis JSON | ~200 | varies by JD |
| Job description (trimmed) | ~800 | capped at 4000 chars |
| Resume payload JSON | ~1500 | varies by resume length |
| Response contract | ~380 | lean to_prompt_dict() |
| **Total input** | **~3,115** | **vs ~4,600 before 3.3.2** |
| Max output | 16,000 | raised in Step 2 |

---

## Affected Files Summary

| File | Change Type | Priority |
|---|---|---|
| `app/prompts/templates.py` | `op` → `action`, bump v3.1 | 🔴 Critical |
| `app/services/tailoring/orchestration.py` | `max_tokens` 15000 → 16000 | 🟡 High |
| `app/routers/resumes.py` | Job keyword caching in legacy endpoint | 🟡 High |
| `app/routers/resumes.py` | Rejected changes warning in preview | 🟢 Medium |
| `app/services/tailoring/prompting.py` | Remove dead `strategy_primary_goal` | 🔵 Low |
| `apps/frontend/components/tailor/` | Verify `prompt_id` in request | 🟡 High |

---

## Acceptance Criteria

1. ✅ All 15 `test_improver.py` tests pass
2. ✅ Preview response `change_breakdown.llm_rejected_changes` is 0 or near-0 on a real resume
3. ✅ Preview response `change_manifest` contains at least 3 indexed paths for a real full-tailor call
4. ✅ Confirm endpoint persists the resume and returns a non-null `resume_id`
5. ✅ Cover letter and outreach message are present in response when enabled
6. ✅ PDF + PNG artifacts are generated and returned in `artifacts`
7. ✅ `detailed_changes` array enables UI diff highlighting
8. ✅ Job keywords are not re-extracted if the JD content hasn't changed

---

## Out of Scope (Phase 3.3.3)

- Diff-only LLM output (emit only changed fields; reconstruct server-side)
- Per-mode system prompt variants
- Streaming response for real-time preview rendering
- Batch tailoring for multiple job descriptions
