# Phase 3.16.1 — Skills: layered contract & observability implementation plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax. Implement in order unless a task states otherwise; each task should end with tests green and a small commit where practical.

**Goal:** Refactor skills handling so **one structural truth** feeds RenderCV and storage, while **user diff UI**, **QA/regressions**, and **training exports** each get the right level of detail—without forcing the LLM to emit a dense `{ value, why }` grid for every chip on every run.

**Architecture:**  
1) **Apply path** — canonical resume `skills.groups` as `{ label, values: string[] }` only (existing `normalize_skill_groups` / `_simplify_skills_groups` in `preservation.py`; RenderCV unchanged).  
2) **Contract** — tiered rationale: mandatory **group-level** notes when a group’s membership or label meaningfully changes; **per-value `why` only** for adds/removes/promotions/high-risk moves; **omit or null** for plain retain.  
3) **Identity** — stable **`group_id`** (slug) per group in stored resume + contract so manifests, diffs, and training rows don’t break on reorder.  
4) **Observability** — optional persisted artifact (or derived server-side) keyed by `(group_id[, value_index])` for manifest enrichment, diff modal drill-down, QA fixtures, and labeled training data—**never** required in the YAML/JSON the renderer consumes.

**Tech stack:** FastAPI / Pydantic v2 (`apps/backend`), tailoring pipeline (`orchestration.py`, `preservation.py`, `models.py`, `change_manifest.py`, `validation.py`), prompts (`apps/backend/app/prompts/text/...`), frontend diff UI (`diff-preview-modal.tsx`, `resume_previewer_context.tsx`), RenderCV adapter (unchanged contract: plain groups).

**Related prior discussion:** Hybrid model (not whole-section-only, not full per-cell prose for every token); three consumers **equally** supported via **projections**, not one obese JSON.

---

## Current baseline (where we are)

| Area | Behavior today |
|------|------------------|
| LLM shape | `TailoringLLMResponseV2.skills`: `TailoredSkillsGroup` with `label` + `values` as `dict[str, TailoredCell]` (value + required `why`). |
| Apply | `_apply_tailored_skills_groups` in `preservation.py` merges cells into plain strings; `_simplify_skills_groups` caps groups/values and dedupes. |
| Finalize | `finalize_tailored_resume` strips to structural skills; `additional` mirrors normalized skills. |
| Manifest | `skills.groups` single regroup row when normalized groups differ; `_skills_tailored_reason` concatenates many cell whys (verbose). |
| Diff UI | Skills section groups added/removed/modified strings; aggregate rationale in details. |

**Pain:** Token and noise cost from **mandatory per-cell `why`**, repeated “retained …” lines, and manifest/diff coupling to that verbosity.

---

## Target end state (snapshot)

- **Renderer & shared resume JSON:** Only `label` + `values[]` (+ optional `id` on group for stability). No `why` in stored resume used for PDF/theme.
- **LLM response (compact mode):** Cells may omit `why` or use `null` when unchanged; schema validation allows optional `why` where policy says so; prompt states **when** `why` is required.
- **Deterministic labels for training:** Backend can compute `unchanged | added | removed | moved` per value by diffing baseline vs applied using `group_id` + normalized string, merged with explicit LLM `why` when present.
- **Optional `skills_observability` blob** (name TBD): e.g. `{ "version": 1, "groups": [ { "group_id", "group_why", "values": [ { "text", "why?", "change_tag" } ] } ] }` — generated or LLM-filled; attached to tailoring API response / stored run record if product needs replay (see open questions).

---

## File map (expected touch points)

| Responsibility | Files |
|----------------|--------|
| Schema / validation | `apps/backend/app/services/tailoring/models.py` (`TailoredCell`, `TailoredSkillsGroup`, `TailoringLLMResponseV2`), `apps/backend/app/services/tailoring/validation.py` |
| Apply / normalize | `apps/backend/app/services/tailoring/preservation.py` (`_apply_tailored_skills_groups`, `_simplify_skills_groups`), `apps/backend/app/services/additional_groups.py` |
| Manifest & enrichment | `apps/backend/app/services/tailoring/change_manifest.py`, `orchestration.py` |
| Resume / API types | `apps/backend/app/schemas/models.py` (SkillGroup / skills block if `id` added) |
| Prompts & contract | `apps/backend/app/prompts/text/tailor_resume_full/user.txt`, `.../system.txt`, shared `resume_diff_output.txt` (or `$resume_diff_rules`); `contracts.py` (`build_response_contract`) |
| Tests | `apps/backend/tests/unit/test_tailoring_validation.py`, `test_prompt_contracts.py`, preservation/apply tests, change manifest tests |
| Frontend | `resume_previewer_context.tsx` (types if API grows), `diff-preview-modal.tsx` (SkillsGroupedView / optional drill-down) |

---

## Phase A — Contract & validation (backend first)

### Task A1: Optional `why` on skill cells

**Files:** `models.py` (`TailoredCell` / skill-specific cell type if split), `validation.py`, `test_tailoring_validation.py`

- [ ] **A1.1** Introduce validation rules: `why` optional when cell is “retain-only” (e.g. `value` null/unchanged semantics—define precisely in schema docstring); required when `value` present and differs from baseline **or** when prompt marks slot as “new”.
- [ ] **A1.2** Add tests: valid payload with sparse whys; invalid when policy requires `why` and it’s missing.

### Task A2: Group-level rationale

**Files:** `models.py`, `validation.py`, prompts

- [ ] **A2.1** Require **`label.why`** (or dedicated `group_rationale`) when any value in that group is added/removed/reordered vs baseline—or allow single omitted if entire group verbatim (define rule).
- [ ] **A2.2** Tests for group-level requirement matrix.

---

## Phase B — Stable group identity

### Task B1: Persist `id` on skill groups

**Files:** `schemas/models.py` (SkillGroup model), `additional_groups.normalize_skill_groups` (seed/fill missing ids), frontend resume types if Builder edits groups

- [ ] **B1.1** Add optional `id: str` per group (slug); default stable generator from existing `groups[].id` or `label` + index hash **once** when missing—document collision policy.
- [ ] **B1.2** Ensure `build_response_contract` includes `group_id` per row for LLM addressing (alongside indices).
- [ ] **B1.3** Migration: existing resumes without ids get ids on load/save (no destructive migration file required if runtime-only fill is acceptable).

### Task B2: Apply & manifest use `group_id`

**Files:** `preservation.py`, `change_manifest.py`, `diffing.py` (if per-group paths appear)

- [ ] **B2.1** When applying tailored skills, map by `group_id` first, then index fallback for legacy responses.
- [ ] **B2.2** Extend manifest paths or parallel index: e.g. `skills.groups[<id>]` or keep `skills.groups[<slug>].values` consistent with `_VALID_TOP_LEVEL`.

---

## Phase C — Prompts & token budget

### Task C1: Prompt edits for tiered rationales

**Files:** `tailor_resume_full/user.txt`, `resume_diff_output.txt` (skills subsection), optionally `system.txt`

- [ ] **C1.1** Document in rules: **no** per-value `why` for unchanged chips; one **group** note for strategy; per-value `why` only for adds/JD-alignment/removals.
- [ ] **C1.2** Add short examples (good vs bad) to reduce “Retained X” spam.
- [ ] **C1.3** Run golden/contract tests (`test_prompt_contracts.py`, `test_prompt_assembly.py`) and adjust expectations.

---

## Phase D — Observability & training projections

### Task D1: Server-side `change_tag` enrichment

**Files:** New small module e.g. `apps/backend/app/services/tailoring/skills_observability.py` (or under `change_manifest.py`), `orchestration.py`

- [ ] **D1.1** After apply, diff **baseline groups** vs **applied groups** (by `group_id`, normalized value strings) → emit `added` / `removed` / `unchanged` / `moved` per entry.
- [ ] **D1.2** Merge with LLM-provided `why` when present into a structure suitable for API response (see D2).

### Task D2: API / storage hook for observability blob (optional product flag)

**Files:** `TailoringResult` in `models.py`, router response DTOs if any, frontend types

- [ ] **D2.1** Add optional `skills_observability: dict | None` (or separate file URL) on tailoring result behind env/feature flag initially.
- [ ] **D2.2** Document JSON shape versioning (`version` field).

### Task D3: Training export strip

**Files:** CLI or internal endpoint (future); document in plan only if out of immediate scope—mark **stretch**.

- [ ] **D3.1** Specify export schema: `(run_id, jd_hash, group_id, value, change_tag, llm_why | null, deterministic_reason)`.

---

## Phase E — Frontend diff UX

### Task E1: Skills section uses tags + sparse notes

**Files:** `diff-preview-modal.tsx`, `SkillsGroupedView`

- [ ] **E1.1** When observability blob or merged tags available, show **+ / − / ≈** (or labels) beside items; retain compact group headers.
- [ ] **E1.2** Group-level rationale prominent; expand per-item only where `why` exists (avoid giant monospace dumps).

---

## Testing & QA gates

- [ ] Unit: validation (sparse whys), apply by `group_id`, manifest path resolution.
- [ ] Integration: full tailor flow with mocked LLM returning sparse skills rationales → applied resume validates; RenderCV preview unchanged structurally.
- [ ] Regression: existing fixtures in `tests/unit/test_tailoring_change_manifest.py` / preservation tests updated, not deleted without replacement.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Weaker UX if model skips required whys | Validation + linter pass in CI on golden responses |
| `group_id` drift across builder edits | Normalize on save; contract always sends current ids |
| Breaking OpenAPI clients | Optional fields only; bump API minor version if new top-level keys |

---

## Open decisions (resolve before Phase D2)

1. **Persist observability** on `Resume` row vs ephemeral API-only vs object storage artifact for large traces.
2. **Split TailoredCell** into `StructuralCell` vs `AnnotatedCell` in schema for clarity—or keep one type with optional `why` only.
3. **Training export** in-product vs offline batch pipeline only.

---

## Success criteria

- [ ] Structural resume JSON for rendering has **no** skill `why` fields.
- [ ] Typical successful tailor responses show **meaningfully smaller** skills JSON vs today (measure token count or char length on fixtures).
- [ ] Diff/modal still answers “why did this group change?” and “why was this JD term added?”
- [ ] QA can assert golden before/after + optional observability artifact.
- [ ] Training pipeline can ingest **deterministic tags** merged with sparse LLM `why`.

---

## References (code)

- `apps/backend/app/services/tailoring/preservation.py` — `_simplify_skill_groups`, `_apply_tailored_skills_groups`, `finalize_tailored_resume`
- `apps/backend/app/services/tailoring/models.py` — `TailoredCell`, `TailoredSkillsGroup`, `TailoringLLMResponseV2`
- `apps/backend/app/services/tailoring/change_manifest.py` — `build_change_manifest`, `_skills_tailored_reason`, `enrich_change_manifest_with_tailored_cells`
- `apps/frontend/components/tailor/diff-preview-modal.tsx` — skills grouping UI
