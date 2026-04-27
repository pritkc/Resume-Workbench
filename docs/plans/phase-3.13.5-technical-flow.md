# Phase 3.13.5 — Technical flow: two files per step + shared diff schema

**Goal:** Align **on-disk layout**, **backend assembly**, and **Prompt Catalog** so each catalog step is “two housings” — **`system.txt`** and **`user.txt`** under that step’s folder — while **resume diff / JSON output contract** lives **once** under **`text/output_file_schema_rules/`**. Runtime remains **two LLM messages** (`system`, `user`).

**Non-goals (this phase):** Changing model providers, token limits, or `$placeholder` semantics.

---

## 1. Target layout (ASCII)

```text
app/prompts/text/
├── output_file_schema_rules/     ← ONLY cross-step contract for diff-shaped JSON
│   └── resume_diff_output.txt    ← (or rename later; keep parser/tests in sync)
├── parse_resume/
│   ├── system.txt
│   └── user.txt
├── extract_jd_intel/
│   ├── system.txt
│   └── user.txt
├── tailor_resume_full/
│   ├── system.txt                ← prose only (craft + full mode); NO pasted copy of diff file
│   └── user.txt
├── tailor_resume_lite/
│   ├── system.txt
│   └── user.txt
├── critique_resume/
│   ├── system.txt
│   └── user.txt
├── rewrite_resume/
│   ├── system.txt
│   └── user.txt
├── cover_letter/
│   ├── system.txt
│   └── user.txt
├── answer_questions/
│   ├── system.txt
│   └── user.txt
└── enrichment/                   ← see §4; normalize to same two-file pattern per op
    ├── analyze/
    ├── enhance/
    ├── regenerate_item/
    └── regenerate_group/
```

**Assembly rule (tailoring + rewrite):**  
`effective_system = read("{step}/system.txt") + "\n\n" + read("output_file_schema_rules/resume_diff_output.txt")`  
(plus overrides — see §3.) So the catalog “resolved system” for those steps must use the **same** function as production.

---

## 2. Principles (lock these before coding)

1. **Single source for diff JSON rules** — `output_file_schema_rules/resume_diff_output.txt` is the only shipped file for that contract; **never** hand-duplicate its body into `tailor_*` / `rewrite_resume` `system.txt`.
2. **Two files per step folder** — Every `VALID_STEPS` entry has exactly `system.txt` + `user.txt` for **step-owned** prose (variables stay `$name` in `user.txt` where applicable).
3. **Catalog = runtime** — The path list / preview in Prompt Catalog must come from the **same** module constants or helper as `build_messages` (no orphan `SYSTEM_PROMPT_FILES` that list dead paths).
4. **Shared overrides only for diff** — Keep `prompt_overrides/_rules.resume_diff.txt` (name can stay for backward compatibility) as the **only** `_rules.*` override once `jd_intel` / `critique` are merged into step `system.txt`.

---

## 3. Overrides & composer (behavior matrix)

| Mechanism today | After migration |
|-----------------|-----------------|
| `{step}.instructions.txt` / `{step}.rules.txt` | **Implemented:** `PUT …/instructions` writes **`{step}.system.txt`**; load tries **`.system.txt`** then legacy **`.instructions.txt`**. **`rules`** override remains **`{step}.rules.txt`** (diff segment for tailoring steps). Shared **`_rules.resume_diff.txt`** unchanged. |
| `_rules.resume_diff.txt` | **Keep** — still overrides the shared diff file only. |
| `_rules.jd_intel.txt`, `_rules.critique.txt` | **Remove** after JD/critique text is merged into `extract_jd_intel/system.txt` and `critique_resume/system.txt`; migration script copies last override content into step file if present. |
| Composer JSON | Unchanged: replaces whole system/user for a step. |

**Implementation note:** If you switch overrides from `instructions`/`rules` to `system`/`user`, update `app/prompts/__init__.py`, routers under `config`, and any UI that edits overrides — add a **short deprecation** path (read old filenames once, save new) if you cannot break existing installs.

---

## 4. Enrichment (`text/enrichment/`)

Today: flat files (`analyze_system.txt`, `analyze_user.txt`, …).  

**Target:** One subfolder per operation, each with **`system.txt`** + **`user.txt`**:

- `enrichment/analyze/system.txt`, `enrichment/analyze/user.txt`
- `enrichment/enhance/…`
- `enrichment/regenerate_item/…`
- `enrichment/regenerate_group/…`

`regenerate_system.txt` is shared by item + group today — **either** duplicate one line into both folders **or** keep a tiny `enrichment/regenerate_shared_system.txt` (optional; user preference was “only resume_diff common” — so **duplicating** two identical one-liners is acceptable).

Update `app/prompts/enrichment.py` imports and `apps/backend/app/routers/enrichment.py` if paths are hardcoded.

---

## 5. Python / wiring changes (modules)

| Area | Work |
|------|------|
| `_text_prompts.read_shipped_txt` | No signature change; update all **relative paths** passed in. |
| `_rules/resume_diff.py` | Point `RESUME_DIFF_RULES` at `output_file_schema_rules/resume_diff_output.txt`; keep `RULES_NAME = "resume_diff"` for overrides unless renamed deliberately. |
| `_rules/jd_intel.py`, `_rules/critique.py` | **Delete** after contents merged into step `system.txt`; remove `jd_intel` / `critique` from `_VALID_SHARED_RULES` in `app/prompts/__init__.py`. |
| `tailoring_blocks.py` | Stop exporting long shipped strings for **craft/mode/shell** if those strings move entirely into per-step files; keep only what other code still needs (e.g. catalog builder may import from step paths). Prefer **each step module** reading its own `system.txt` / `user.txt`. |
| `extract_jd_intel.py` | `INSTRUCTIONS` = merged content of old `jd_intel_contract` + `jd_intel_craft` → single `extract_jd_intel/system.txt`; `build_messages` uses `load_override(step, "instructions")` **or** new `system` override — align with §3. |
| `tailor_resume_full.py` / `lite.py` | `INSTRUCTIONS` from `{step}/system.txt`; `RULES` from shared diff reader only; `USER_TEMPLATE` from `{step}/user.txt`. |
| `rewrite_resume.py` | Merge today’s `rewrite_resume/instructions.txt` + inlined tailoring craft + full mode (from fragments) into **`rewrite_resume/system.txt`** as **self-contained** prose; append shared diff at runtime same as tailor steps. Remove dependency on `REWRITE_RULES_BUNDLE` as a cross-import of tailoring fragments. |
| `critique_resume.py` | Merge `instructions.txt` + `critique_rules.txt` → `critique_resume/system.txt`. |
| `parse_resume.py`, `cover_letter.py`, `answer_questions.py` | Already two-file pattern; verify paths and catalog metadata only. |
| `tailoring_catalog.py` | Refactor section builder to read from **new** paths (per-step `system.txt` + shared diff path), not `tailoring_blocks` string constants. |
| `prompt_catalog_builder.py` | `_step_prompt_source_paths`: each step returns `[".../text/{step}/system.txt"]` (and optionally append shared diff path in metadata for display), `user.txt` path. |
| Routers / Settings UI | Shared rules card: **only** `resume_diff` / `output_file_schema_rules`. Remove JD/critique shared cards or fold into step docs. |
| `text/index.yaml` | Replace `fragments:` with `output_file_schema_rules:` entry; list steps + enrichment layout. |
| `text/README.md` | Rewrite layout section to match this doc. |

---

## 6. Tests (must touch)

- [x] Unit: `test_prompt_assembly`, `test_prompt_composer`, `test_tailoring_prompt_equivalence`, `test_master_resume_preview`, config catalog integration tests, path assertions updated for new layout.
- [x] Grep / fix references to old `fragments/` paths in backend tests and docs touched in this phase.

---

## 7. Rollout strategy (recommended order)

1. [x] **Add** `output_file_schema_rules/resume_diff_output.txt` (copy from `fragments/`), wire `resume_diff.py` to new path, run tests.  
2. [x] **Migrate** `extract_jd_intel` to `system.txt`/`user.txt`, update catalog + tests.  
3. [x] **Migrate** `tailor_resume_full` / `lite`.  
4. [x] **Migrate** `critique_resume`, `rewrite_resume`.  
5. [x] **Delete** obsolete `fragments/*.txt`, remove `_rules/jd_intel` + `_rules/critique`.  
6. [x] **Enrichment** folder normalization.  
7. [x] **Docs** (`text/README.md`, `docs/agent/llm-prompt-inventory.md`, this checklist).

---

## 8. Master checklist (tick in PRs)

### 8.1 Shared diff home

- [x] Create `apps/backend/app/prompts/text/output_file_schema_rules/`.
- [x] Move `fragments/resume_diff_output.txt` → `output_file_schema_rules/resume_diff_output.txt` (or chosen final filename; update all imports).
- [x] Update `_rules/resume_diff.py` shipped path + `USED_BY` comments.
- [x] Confirm `prompt_overrides/_rules.resume_diff.txt` still applies to that file only.
- [x] Update Prompt Catalog “shared rules” to surface **only** this rule pack.

### 8.2 `VALID_STEPS` — two files per folder

- [x] **parse_resume** — confirm `parse_resume/system.txt`, `user.txt`; update `SYSTEM_PROMPT_FILES` / catalog paths if needed.
- [x] **extract_jd_intel** — new `extract_jd_intel/system.txt` (merge contract + craft); keep `user.txt`; delete `fragments/jd_intel_*.txt`; remove shared `jd_intel` override type or migrate files.
- [x] **tailor_resume_full** — new `tailor_resume_full/system.txt` (craft + mode full); new `tailor_resume_full/user.txt` (shell); runtime concat shared diff; delete used fragments for this step.
- [x] **tailor_resume_lite** — same pattern with lite mode + lite user shell.
- [x] **critique_resume** — `critique_resume/system.txt` (merge old instructions + critique rules); `user.txt`; remove `fragments/critique_rules.txt` + shared critique override.
- [x] **rewrite_resume** — `rewrite_resume/system.txt` (self-contained: old instructions + craft + full mode prose); `user.txt`; runtime concat shared diff; remove fragment references from `rewrite_resume.py`.
- [x] **cover_letter** — already `system.txt` / `user.txt`; path sanity only.
- [x] **answer_questions** — same.

### 8.3 Overrides / API / UI

- [x] Override file naming: **`PUT /prompts/{step}/instructions`** writes **`{step}.system.txt`**; **`load_override(..., "instructions")`** reads **`{step}.system.txt`** first, then legacy **`{step}.instructions.txt`**. HTTP field names unchanged for the Prompt Catalog UI.
- [x] Shared rules API: **`PUT/DELETE /shared-rules/{name}`** accepts **`resume_diff`** only (`jd_intel` / `critique` removed).
- [ ] Migration helper for old `_rules.jd_intel.txt` (optional; operators can paste into `extract_jd_intel` shipped `system.txt` or a step override manually).

### 8.4 Catalog & discovery

- [x] `prompt_catalog_builder.py` — `system_prompt_files` / `user_prompt_file` reflect new tree; tailoring steps list prose `system.txt` plus appended `output_file_schema_rules/resume_diff_output.txt` in `SYSTEM_PROMPT_FILES`.
- [x] `tailoring_catalog.py` — notes updated for new shipped paths; section splitter still uses `TAILORING_*` constants derived from merged files in `tailoring_blocks.py`.
- [x] `text/index.yaml` + README.

### 8.5 Enrichment

- [x] Restructure dirs per §4; update `enrichment.py` + router catalog notes.
- [x] Unit tests referencing shipped paths updated where needed.

### 8.6 Cleanup

- [x] `text/fragments/README.md` points to new layout (folder retained for discoverability).
- [x] Delete `_rules/jd_intel.py` / `_rules/critique.py`; slim `_rules/__init__.py`.
- [x] `phase-3.13.5-prompts-merger.md` links this doc; §9 notes implementation complete.

### 8.7 Quality gate

- [x] Full backend test suite green (362 tests).
- [ ] Manual: Settings → Prompt Catalog — spot-check resolved system for tailoring includes diff block; shared diff card save/reset (recommended once per release).

---

## 9. Risk callouts (for implementers)

- **`rewrite_resume` bundle** — Today it concatenates diff + **tailoring craft + full mode**. Those non-diff paragraphs must live in **`rewrite_resume/system.txt`** after migration so `rewrite_resume` does not import tailoring fragment files anymore (aligns with “only resume_diff is shared”).
- **Catalog section headers** — If `tailoring_catalog.py` splits on `ALL CAPS:` headers, preserve those markers inside merged `system.txt` or change the splitter.
- **Composer** — Still wins over shipped files; document that composer body must include diff rules **or** rely on server to always append diff after composer system (product decision: **recommend always append diff server-side** so composers cannot accidentally drop JSON contract).

---

## 10. Related docs

- `docs/plans/phase-3.13.5-prompts-merger.md` — rationale, cons, and agreed “resume_diff only” shared policy.
- `docs/plans/phase-3.13.5-prompt-authoring-and-runtime.md` — runtime two-message behavior.

---

**Status:** **Implemented** (2026-04-24) — layout and loaders match §1–§5; see git history for this change set. Optional: §8.3 migration helper + §8.7 manual catalog smoke test.
