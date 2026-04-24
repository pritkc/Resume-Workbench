# Phase 3.13.4 — Implementation checklist: prompt variables, catalog preview, English-only

**Parent spec / decisions:** [phase-3.12.3-prompt-catalog-variable-preview-and-naming.md](./phase-3.12.3-prompt-catalog-variable-preview-and-naming.md)

**Stakeholder locks (no deprecation shims — dev-only, clean break):**

1. LLM-derived template keys: **`{step_name}_output`** (e.g. `extract_jd_intel_output`).
2. Critique first input from tailor full: **`tailor_resume_full_output`** (same pattern).
3. Catalog: **no resume picker** — resolve the **single current master resume** server-side; expose serialized preview only for that resume.
4. **`output_language`:** remove from code paths and shipped templates; **stakeholder adds English line manually** in prompts where needed (implementer strips placeholders / kwargs only).
5. **No** backward-compat aliases in code or templates.

---

## Naming map (implement exactly — update all call sites)

| Old template key / kwarg | New | Notes |
|---------------------------|-----|--------|
| `job_intelligence` (tailor full/lite user shell) | `extract_jd_intel_output` | Same JSON string as today, new name. |
| `jd_intelligence` (critique, rewrite user templates) | `extract_jd_intel_output` | One canonical name for JD intel JSON everywhere. |
| `draft_resume` (critique, rewrite) | `tailor_resume_full_output` | Critique/rewrite only exist on full pipeline where prior step is tailor full. |
| `critique` (rewrite `user.txt` + Python) | `critique_resume_output` | Critique step is `critique_resume`. |
| `original_resume` | **Keep** `original_resume` | Master / serialized resume input (not `{step}_output`). Optional later rename to `master_resume_json` — **out of scope** unless you expand this checklist. |
| `response_contract` | **Keep** `response_contract` | Built in code, not an LLM step output; name already clear. |
| `mode_id` | **Removed from user template** | Full vs lite use separate shipped user shells; routing stays in Python (`render_tailoring_user_prompt` / `get_prompt`). |

**Remove entirely:** `output_language` from `string.Template` user templates, `VARIABLES`, `build_messages` signatures, `TailoringPromptContext`, services, routers, tests, and `prompt_catalog_builder` probes.

---

## A — Shipped text and prompt modules

- [x] **`text/fragments/tailoring_user_shell_full.txt` / `tailoring_user_shell_lite.txt`:** (was single `tailoring_user_shell.txt`.) `$extract_jd_intel_output`; no `$output_language`; no `$mode_id` — separate shells per mode.
- [x] **`text/critique_resume/user.txt`:** `$draft_resume` → `$tailor_resume_full_output`; `$jd_intelligence` → `$extract_jd_intel_output`.
- [x] **`text/rewrite_resume/user.txt`:** `$draft_resume` → `$tailor_resume_full_output`; `$jd_intelligence` → `$extract_jd_intel_output`; `$critique` → `$critique_resume_output`.
- [x] **`apps/backend/app/prompts/tailor_resume_full.py`** and **`tailor_resume_lite.py`:** `VARIABLES`, `build_messages` params, `render_user_template` kwargs aligned; drop `output_language`.
- [x] **`critique_resume.py`:** Parameter names + `VARIABLES` + `render_user_template` match new template keys.
- [x] **`rewrite_resume.py`:** Same.
- [x] **`apps/backend/app/prompts/tailoring_catalog.py`:** Section labels that reference `{job_intelligence}` / `{output_language}` etc. → new names for catalog UI consistency.
- [x] **`cover_letter.py`** + **`text/cover_letter/*.txt`:** Remove `$output_language` and function args; stakeholder-owned English line in copy.
- [x] **Enrichment:** Remove `output_language` from `str.format(...)` calls in **`routers/enrichment.py`** and from **`text/enrichment/*.txt`** placeholders (`{output_language}`) so format calls do not pass it; stakeholder adjusts prose for English-only.

---

## B — Tailoring assembly and services

- [x] **`services/tailoring/prompting.py`:** `build_prompt_context` / `render_tailoring_user_prompt` / `assemble_tailoring_system_prompt` — drop `output_language`; pass renamed kwargs into `build_messages`. Remove `output_language` field from **`TailoringPromptContext`** or replace with nothing (update all consumers).
- [x] **Callers of `build_prompt_context` / `TailoringPromptContext`** (orchestration, improver, routers): update argument lists and attribute reads.
- [x] **`services/cover_letter.py`:** Stop computing/passing `output_language` into cover letter `build_messages`.
- [x] **Grep** repo for `output_language`, `job_intelligence`, `jd_intelligence`, `draft_resume` (as prompt kwargs), `critique=` in rewrite path — **zero** stale references.

---

## C — Config API, catalog builder, preview (master resume)

- [x] **`routers/prompt_catalog_builder.py`:** Update `_probe_system_message` / any `build_messages(...)` probes with new kwarg names and without `output_language`.
- [x] **Define “current master resume” resolver** (single function used by preview): e.g. latest resume with `source_resume_id is None`, or first by `updated_at`, or existing product rule — **document chosen rule in `text/README.md` one sentence**; implement in one module to avoid drift.
- [x] **New or extended authenticated endpoint** (minimal): e.g. extend `GET` prompt catalog payload or add `GET /api/v1/config/prompt-catalog/master-resume-context` returning `{ "serialized_original_resume": "...", "truncated": bool }` using the **same serialization path** as `build_prompt_context` for `original_resume` (structured JSON vs markdown parity with tailoring).
- [x] **Size cap** (e.g. 256 KiB) + `truncated` flag on response; no unbounded payloads.
- [x] **Auth:** same as reading resumes list / resume detail for the current user.

---

## D — Frontend

- [x] **`lib/api/config.ts`** (and types): new field or endpoint client for master resume preview blob.
- [x] **`prompt-card.tsx`:** For steps whose `VARIABLES` include `original_resume`, show collapsible **“Current master resume (as sent to prompts)”** loaded once per catalog page load (or on card mount) from the new API — **no** resume picker UI.
- [x] **Loading / empty states:** no master resume found → short message; error → catalog error pattern.

---

## E — Tests and CI

- [x] **`tests/unit/test_tailoring_prompt_equivalence.py`**, **`test_prompt_assembly.py`**, **`test_prompt_composer.py`**, **`test_shipped_prompt_placeholders.py`**, **`test_config_api.py`**, **`test_improver.py`**, **`test_cover_letter.py`**, **`test_regenerate_endpoints.py`**, integration tests touching tailoring — update all `build_messages` / fixture strings / expected `$` identifiers.
- [x] **Full backend:** `uv run pytest tests/`
- [x] **Frontend:** `npm run lint` + `npm run build` for touched files.

---

## F — Documentation

- [x] **`docs/plans/phase-3.12.3-…md`:** Add “Locked” blurb + link to this checklist; remove or strike resolved “Questions for you” once implemented.
- [x] **`docs/agent/llm-prompt-inventory.md`** and **`apps/backend/app/prompts/text/README.md`:** New variable names; master preview behavior; English-only note for tailoring/cover.

---

## G — Explicit non-tasks (this phase)

- No `{step}_output` rename for **`response_contract`** (not LLM step output).
- No UI resume picker.
- No code deprecation shims for old `$` names.
- Stakeholder-owned prompt prose for “write in English” — implementer does not need to author final marketing copy beyond removing the variable.

---

## Done when

- [x] All checkboxes above are `[x]`.
- [x] Grep confirms no `output_language` in tailoring/cover/rewrite/critique/catalog paths (except changelog or historical docs if any).
- [x] Grep confirms old names `job_intelligence` / `jd_intelligence` / `draft_resume` as **template** identifiers are gone from `text/` and Python `render_user_template` calls.
