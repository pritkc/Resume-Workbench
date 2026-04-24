# Phase 3.12.2 — Implementation plan & checklist

> **Parent spec:** [phase-3.12.2-prompt-authoring-discoverability-and-safety.md](./phase-3.12.2-prompt-authoring-discoverability-and-safety.md)  
> **Locked decisions:** Shipped prompts under `apps/backend/app/prompts/text/` as **`.txt`**; not repo root; keep **`string.Template`** + composer / `prompt_overrides` rollback; **no** snapshot/version DB.

This document is the **execution** companion: file inventory, ordered tasks, tests, docs, UI notes, and ASCII wireframes.

### Implementation status (3.12.2 — complete)

**Shipped:** `app/prompts/_text_prompts.py`, full `text/` tree (pipeline steps, fragments, enrichment), thin Python loaders, composer/overrides unchanged.

**Validation:** `tests/unit/test_text_prompts.py` (loader + `index.yaml` vs `VALID_STEPS`), `tests/unit/test_shipped_prompt_placeholders.py` (`$` placeholders vs `VARIABLES` per step; enrichment `str.format` round-trips).

**Catalog:** Legacy enrichment rows in `config.py` include `notes` with `text/enrichment/` paths.

---

## 1. Current inventory (what exists today)

### 1.1 Pipeline steps (`VALID_STEPS` — `app/prompts/__init__.py`)

| Step module | Role | Notes |
|-------------|------|--------|
| `parse_resume.py` | Parse upload → JSON | System + user; `USER_TEMPLATE` uses `$schema`, `$resume_text` |
| `extract_jd_intel.py` | JD → intelligence JSON | System = `_rules/jd_intel` contract + craft; user has embedded JSON schema |
| `tailor_resume_full.py` | Full tailoring | Composes `tailoring_blocks` + `_rules/resume_diff`; `RULES_SOURCE` |
| `tailor_resume_lite.py` | Lite tailoring | Same pattern, different mode |
| `critique_resume.py` | Critique diff | `INSTRUCTIONS` + `_rules/critique` |
| `rewrite_resume.py` | Second pass | Instructions + bundle with `resume_diff` |
| `cover_letter.py` | Cover + outreach combined | System + large user |
| `answer_questions.py` | Application Q&A | System + user |

### 1.2 Shared / composed text (not separate `VALID_STEPS`)

| Location | Content |
|----------|---------|
| `app/prompts/_rules/resume_diff.py` | `RESUME_DIFF_RULES` — shared; `load_shared_rules_override("resume_diff")` |
| `app/prompts/_rules/jd_intel.py` | Contract + craft blocks |
| `app/prompts/_rules/critique.py` | `CRITIQUE_RULES` |
| `app/prompts/tailoring_blocks.py` | Craft, mode strategies, `TAILORING_USER_SHELL`, `REWRITE_RULES_BUNDLE` pieces |

### 1.3 Runtime & overrides

| Path / module | Purpose |
|---------------|---------|
| `app/prompt_overrides/` | `{step}.instructions.txt`, `{step}.rules.txt`, `{step}.composer.json`, `_rules.{name}.txt` |
| `app/prompts/_prompt_loader.py` | Composer JSON; `render_user_template` / `validate_user_template_against_variables` |
| `app/prompts/__init__.py` | `load_override`, `load_shared_rules_override`, `VALID_STEPS` |

### 1.4 Services that call `build_messages` (do not break)

- `app/services/parser.py` → `parse_resume`
- `app/services/tailoring/analysis.py` → `extract_jd_intel`
- `app/services/tailoring/prompting.py` → `tailor_resume_*` via `get_prompt` + `build_messages`
- `app/services/tailoring/orchestration.py` → critique / rewrite `build_messages`
- `app/services/application_questions.py` → `answer_questions`

### 1.5 Catalog / API / UI

| Area | Files |
|------|--------|
| Catalog API | `app/routers/config.py` (`_legacy_prompt_catalog_rows`, prompt composer routes), `app/routers/prompt_catalog_builder.py` |
| Schemas | `app/schemas/models.py` — `PromptManagerEntry`, `SharedRuleEntry`, `PromptCatalogSection`, … |
| Tailoring catalog sections | `app/prompts/tailoring_catalog.py` |
| Frontend | `app/(default)/settings/prompt-catalog/page.tsx`, `components/settings/prompt-card.tsx`, `shared-rules-card.tsx`, `prompt-section-tree.tsx`, `model-picker-modal.tsx`, `prompt-field-chrome.tsx`, `lib/api/config.ts`, `messages/en.json` |

### 1.6 Legacy catalog only (not in Prompt Manager `entries`)

- `app/prompts/enrichment.py` — thin loader: bodies live in **`text/enrichment/*.txt`**. User templates use **`str.format`** (`{name}`); JSON in those files uses `{{` / `}}` for literal braces. Legacy catalog rows in `config.py` still reference these operations and include **`notes`** with file paths.

---

## 2. Target tree (implementer default)

```text
apps/backend/app/prompts/text/
  README.md                 # Human index: map step_id → files, how overrides work
  index.yaml                # Optional: machine list of steps + fragment ids + VARIABLES per step
  fragments/
    resume_diff_output.txt
    jd_intel_contract.txt
    jd_intel_craft.txt
    critique_rules.txt
    tailoring_craft.txt
    tailoring_mode_full.txt
    tailoring_mode_lite.txt
    tailoring_user_shell.txt
  parse_resume/
    system.txt
    user.txt
  extract_jd_intel/
    system.txt              # OR split: system = load two fragments in code — see §4
    user.txt
  tailor_resume_full/
    system.txt              # full shipped system (craft+mode+schema) OR composed in code from fragments
    user.txt
  tailor_resume_lite/
    system.txt
    user.txt
  critique_resume/
    system.txt
    user.txt
  rewrite_resume/
    system.txt
    user.txt
  cover_letter/
    system.txt
    user.txt
  answer_questions/
    system.txt
    user.txt
  enrichment/
    analyze_system.txt
    analyze_user.txt
    enhance_system.txt
    enhance_user.txt
    regenerate_system.txt
    regenerate_item_user.txt
    regenerate_group_user.txt
```

**Duplication policy:** Prefer **fragments** for bytes that appear in more than one step (resume diff, tailoring craft, user shell). **Per-step `system.txt`** either contains the full final shipped string for that step or is assembled in Python from fragment paths only (no duplicate literals in `.py`).

---

## 3. New / heavily modified backend modules

| Action | Path | Responsibility |
|--------|------|------------------|
| **Create** | `app/prompts/_text_prompts.py` (name TBD) | `TEXT_ROOT = Path(__file__).parent / "text"`; `read_txt(path) -> str` with UTF-8, BOM strip, `\r\n` → `\n`; optional `@lru_cache` for shipped files |
| **Create** | `text/README.md` | Agent/human map |
| **Create** | `text/index.yaml` | Optional: `steps`, `fragments`, `variables` |
| **Modify** | Each step under §1.1 | Replace inline `"""..."""` bodies with loads from `text/…` (keep `STEP_NAME`, `VARIABLES`, `build_messages`, `FILE_PATH`, `SYSTEM_PROMPT_FILES` / `USER_PROMPT_FILE` updated to point at `text/…`) |
| **Modify** | `_rules/*.py` | Either **thin re-export** reading `text/fragments/*.txt` or **delete string bodies** and import from loader only |
| **Modify** | `tailoring_blocks.py` | Load from `text/fragments/`; keep `TAILORING_MODE_STRATEGY` dict structure or load keys from files |
| **Modify** | `prompt_catalog_builder.py` | Update `_probe_system_message` / shipped paths if `SYSTEM_DEFAULT` changes shape; ensure `system_prompt_files` list **`text/`** paths first |
| **Modify** | `tailoring_catalog.py` | If section splitters depend on headers in craft block, ensure moved **`.txt`** preserves same `SECTION` headers for catalog |
| **Modify** | `__init__.py` | Re-exports unchanged unless removing dead constants |

**Do not change without explicit task:** `_prompt_loader.py` contract for composer JSON; `prompt_overrides` path logic.

---

## 4. Macro phases & micro checklist

### Phase A — Loader + tree skeleton

- [x] **A1.** Add `apps/backend/app/prompts/text/` with `fragments/` + one pilot step folder (e.g. `parse_resume/`).
- [x] **A2.** Implement `read_shipped_txt(relative_path: str) -> str` with normalization (UTF-8, BOM, newlines).
- [x] **A3.** Add `text/README.md` with: purpose, tree layout, pointer to `prompt_overrides/`, “literal `$` use `$$`”, link to `docs/agent/llm-prompt-inventory.md`.
- [x] **A4.** (Optional) Add `text/index.yaml` schema and a tiny unit test that it lists the same steps as `VALID_STEPS` (or a subset until migration complete).

### Phase B — Migrate `parse_resume` (pilot)

- [x] **B1.** Copy current `PARSE_SYSTEM_PROMPT` + `USER_TEMPLATE` bytes into `text/parse_resume/system.txt` and `user.txt`.
- [x] **B2.** Change `parse_resume.py` to load strings at module level or lazy; keep `build_messages` signature.
- [x] **B3.** Run `pytest tests/unit/test_prompt_composer.py tests/unit/test_prompt_registry.py` + any parse tests.

### Phase C — Fragments + JD + critique + tailoring

- [x] **C1.** Add `text/fragments/resume_diff_output.txt` from `_rules/resume_diff.py` body.
- [x] **C2.** Add `jd_intel_contract.txt`, `jd_intel_craft.txt`; wire `extract_jd_intel.py` / `_rules/jd_intel.py` to read them (keep `RULES_NAME` / overrides behavior).
- [x] **C3.** Add `critique_rules.txt`; wire `critique_resume.py` + `_rules/critique.py`.
- [x] **C4.** Split `tailoring_blocks.py` content into `tailoring_craft.txt`, `tailoring_mode_full.txt`, `tailoring_mode_lite.txt`, `tailoring_user_shell.txt`.
- [x] **C5.** Wire `tailor_resume_full.py` / `tailor_resume_lite.py` / `rewrite_resume.py` / `REWRITE_RULES_BUNDLE` to compose from fragments + per-step `system.txt` if any step-specific prose remains in Python.
- [x] **C6.** Run `pytest tests/unit/test_tailoring_prompt_equivalence.py tests/unit/test_prompt_assembly.py tests/service/test_improver.py`.

### Phase D — Cover letter + answer_questions

- [x] **D1.** `text/cover_letter/system.txt`, `user.txt` from `cover_letter.py`.
- [x] **D2.** `text/answer_questions/system.txt`, `user.txt`.
- [x] **D3.** Run integration tests touching application packs / cover if any (`tests/integration/` grep `cover_letter`, `answer_questions`).

### Phase E — Dedupe names & catalog accuracy

- [x] **E1.** Remove or alias **one** public name per fragment (e.g. code imports `load_resume_diff_output()` from one module only; delete `TAILORING_CONTRACT_BLOCK = RESUME_DIFF_RULES` duplicate if both resolve to same file path).
- [x] **E2.** Update `SYSTEM_PROMPT_FILES` / `USER_PROMPT_FILE` on each step to list **`apps/backend/app/prompts/text/...`** first, then thin `*.py` if still needed for assembly.
- [x] **E3.** Update `tailoring_catalog.py` notes/paths if they still say old `_rules` only.
- [x] **E4.** Regenerate or hand-edit `docs/agent/llm-prompt-inventory.md` to describe `text/` tree.

### Phase F — Docs & agent handbook

- [x] **F1.** `docs/agent/llm-prompt-inventory.md` — new “Source of truth” section: `text/` tree, fragments, overrides.
- [x] **F2.** `docs/agent/llm-integration.md`, `docs/agent/README.md`, `docs/agent/coding-standards.md`, `docs/agent/architecture/backend-guide.md`, `docs/agent/architecture/backend-architecture.md` — replace “prompts only in `.py`” with **`.py` thin + `text/*.txt`**.
- [x] **F3.** `docs/plans/phase-3.7.6-easier-prompt-management-composer.md` — short banner at top: shipped bodies may live under `text/`; composer unchanged.
- [x] **F4.** Phase 3.12.2 parent doc — link to **this** checklist; status line reflects shipped **3.12.2**.

### Phase G — UI / UX (minimal for 3.12.2)

**Goal:** surface the **new** paths; optional small UX polish. No full WYSIWYG preview in scope.

- [x] **G1.** `PromptCard`: ensure `system_prompt_files` / `user_prompt_file` show `text/` entries (verify after backend update).
- [x] **G2.** `SharedRulesCard`: set `rules_source_file` to `text/fragments/resume_diff_output.txt` when migration moves default body there (keep override semantics).
- [x] **G3.** `messages/en.json`: add one line under prompt catalog meta or settings card: “Shipped prompt copy: `apps/backend/app/prompts/text/`” (if product wants).
- [x] **G4.** **Wireframe (settings → prompt catalog header)** — informational strip:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ LLM PROMPT CATALOG                                                       │
│ Shipped copy: apps/backend/app/prompts/text/  ·  Overrides: …/prompt_   │
│ overrides/   ·  Composer saves: *.composer.json                        │
└─────────────────────────────────────────────────────────────────────────┘
```

- [x] **G5.** **Wireframe (PromptCard header)** — stack paths vertically (already partial); ensure **first line** is “Edit shipped text:” linking conceptually to `text/…`:

```text
┌──────────────────────────────────────────────────┐
│ Tailor resume (full)          tailor_resume_full │
│ Step module: prompts/tailor_resume_full.py       │
│ Shipped text:  text/fragments/… → text/…/user.txt│
│ …                                                │
└──────────────────────────────────────────────────┘
```

- [x] **G6.** (Optional) Add `Link` or copy button for full path string — only if quick win.

### Phase H — Tests & CI (matrix)

**Always run after each phase:**

```bash
cd apps/backend && uv run pytest \
  tests/unit/test_prompt_registry.py \
  tests/unit/test_prompt_composer.py \
  tests/unit/test_prompt_assembly.py \
  tests/unit/test_tailoring_prompt_equivalence.py \
  tests/integration/test_config_api.py::TestPromptCatalog \
  tests/integration/test_config_api.py::TestPromptComposer \
  tests/service/test_improver.py
```

**Broader regression (before merge):**

```bash
cd apps/backend && uv run pytest tests/unit/ tests/integration/test_config_api.py -q
```

**CI / shipped copy validation:**

- [x] **H7.** Unit tests: `tests/unit/test_shipped_prompt_placeholders.py` — `string.Template` identifiers on pipeline `user.txt` vs each step’s `VARIABLES`; enrichment `str.format` smoke tests so missing `{placeholders}` fail in CI.

### Phase I — Optional: enrichment (3.12.2b)

- [x] **I1.** Decide: convert enrichment prompts to `$` + Template, or keep `.format` in a tiny wrapper.
- [x] **I2.** Add `text/enrichment/` (`analyze_system.txt`, `analyze_user.txt`, `enhance_*.txt`, `regenerate_*.txt`) + wire `enrichment.py` via `read_shipped_txt`.
- [x] **I3.** Update `config.py` legacy catalog rows to note paths or load from file.

---

## 5. UI/UX mockups (text)

### 5.1 Prompt Catalog page — global context strip (new)

Add a **mono one-liner** or **two-line** strip below the page title (see §G4). No mock image required; implement as existing Tailwind / design tokens.

### 5.2 Shared rules card — path clarity

When `rules_source_file` points at `text/fragments/resume_diff_output.txt`, duplicate the path in **title attribute** for hover (already pattern on PromptCard).

### 5.3 Composer section — no layout change required

Keep two scroll areas; shipped defaults reference panel should still show resolved `system_shipped` / `user_template_shipped` (now backed by files). If file load fails at import time, **fail fast** in tests; at runtime log and fall back only if product explicitly wants (default: **no fallback**).

---

## 6. Risk register & rollback

| Risk | Mitigation |
|------|------------|
| Wrong file encoding | Enforce UTF-8 read; CI `file` check or Python decode test on all `text/*.txt`. |
| Drift between full/lite tailoring | Single source fragments; tests in `test_tailoring_prompt_equivalence.py` / `test_prompt_assembly.py`. |
| Override / composer confusion | README + UI strip; behavior unchanged from today. |
| Large PR | Land **Phase B pilot** first, then C/D in chunks with green CI. |

**Rollback:** revert to previous commit; keep `text/` on branch until green.

---

## 7. Definition of Done

- [x] All **`VALID_STEPS`** shipped prose lives under `apps/backend/app/prompts/text/` (fragments + per-step) with **no** duplicate long literals in Python for the same content.
- [x] `text/README.md` exists and is linked from `llm-prompt-inventory.md`.
- [x] Agent docs updated (§F).
- [x] CI green on test matrix §H.
- [x] Parent phase doc links here; checklist checkboxes for your wave are ticked in the PR description or copied to GitHub issue.

---

## 8. Appendix — grep aids for implementers

```bash
# Find long prompt strings still in Python (post-migration sweep)
rg '"""' apps/backend/app/prompts/*.py apps/backend/app/prompts/_rules/*.py

# Find steps
rg "VALID_STEPS" apps/backend/app/prompts/__init__.py

# Frontend catalog
rg "promptCatalog|PromptCard" apps/frontend
```