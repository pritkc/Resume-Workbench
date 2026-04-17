# Phase 3.7.6 — Easier Prompt Management (“Composer”)

**Status:** Draft — implementation plan  
**Depends on:** Phase 3.7.5 (prompt modularization, catalog API, manager UI) — **complete**  
**Conceptual spec:** [`prompt-two-scrolls-architecture.md`](./prompt-two-scrolls-architecture.md)  
**Goals:** **Robustness** (no brace/format accidents, validated loads) and **ease of change** (one obvious file per step, two scrolls: System + User).

---

## Table of Contents

1. [Goals & Non-Goals](#1-goals--non-goals)
2. [Problem After 3.7.5](#2-problem-after-375)
3. [Target Model: Python “Two Scrolls”](#3-target-model-python-two-scrolls)
4. [File & Module Layout](#4-file--module-layout)
5. [Placeholder Contract](#5-placeholder-contract)
6. [Loader & Registry](#6-loader--registry)
7. [Overrides](#7-overrides)
8. [Call-Site Integration](#8-call-site-integration)
9. [Shared Snippets](#9-shared-snippets)
10. [Backend API & Catalog](#10-backend-api--catalog)
11. [Frontend — Prompt Composer](#11-frontend--prompt-composer)
12. [Migration from Current Prompt Modules](#12-migration-from-current-prompt-modules)
13. [Testing & CI](#13-testing--ci)
14. [Security & Operations](#14-security--operations)
15. [Rollout Phases](#15-rollout-phases)
16. [Risks & Mitigations](#16-risks--mitigations)
17. [Implementation Checklist](#17-implementation-checklist)

---

## 1. Goals & Non-Goals

### Goals

| ID | Goal |
|----|------|
| G1 | **Single canonical source** per pipeline step: **`SYSTEM`** + **`USER`** strings in a **Python** module (no ambiguous delimiter parsing in production). |
| G2 | **Safe placeholders** when JSON lives in `USER`: use **`string.Template`** with `$identifier` placeholders — **not** `str.format` on raw templates with `{` schema blocks. |
| G3 | **One override file per step** (same shape as shipped), replacing the split `*.instructions.txt` / `*.rules.txt` / `_rules.*.txt` model for operator workflows. |
| G4 | **Fail fast**: unknown placeholder, missing variable, or unloadable module → clear error at load or test time. |
| G5 | **Prompt Composer UI**: two editors (System | User), variable chips, reset to shipped default. |

### Non-Goals

- Replacing LiteLLM or provider routing (unchanged).
- Changing **output JSON schemas** consumed by parsers unless explicitly migrated in the same phase (schema changes are **data** edits inside `USER`, not new plumbing).
- Markdown-delimited `.md` as **canonical** on-disk format (optional **export** only).

---

## 2. Problem After 3.7.5

Phase 3.7.5 split monoliths into per-step modules with **INSTRUCTIONS**, **RULES**, **DATA_TEMPLATE**, plus **shared rules** (`resume_diff`, `jd_intel`, `critique`). That improved organization but:

- Editors must mentally merge **INSTRUCTIONS + RULES → system** and **DATA_TEMPLATE → user** (see [`prompt-two-scrolls-architecture.md`](./prompt-two-scrolls-architecture.md)).
- **`DATA_TEMPLATE.format(...)`** alongside JSON examples in the same string is **error-prone** (`{{` / `}}` escaping).
- Overrides are **granular** (instructions vs rules vs shared files) — good for partial edits, heavy for “replace whole prompt from ChatGPT.”

Phase 3.7.6 **aligns disk and mental model**: two blobs, one file per step, Template-safe placeholders.

---

## 3. Target Model: Python “Two Scrolls”

Each step is represented by a **small Python module** (naming TBD, e.g. `extract_jd_intel_prompt.py` or keep `extract_jd_intel.py` exporting the new constants).

```text
┌─────────────────────────────────────────┐
│  SYSTEM = """ ... small contract ... """ │
└─────────────────────────────────────────┘
                    +
┌─────────────────────────────────────────┐
│  USER = """ ... task + schema + $vars """ │
└─────────────────────────────────────────┘
         │
         │  string.Template(USER).substitute(**kwargs)
         ▼
     final user message to LLM
```

**Exported symbols (minimum):**

| Symbol | Type | Purpose |
|--------|------|---------|
| `STEP_NAME` | `str` | Registry id (`extract_jd_intel`, …) |
| `VARIABLES` | `tuple[str, ...]` | Allowed placeholder names (order optional; used for validation + UI) |
| `SYSTEM` | `str` | System message (no `$` substitution unless documented) |
| `USER` | `str` | User template with `$name` placeholders |

**Optional:** `STEP_LABEL`, `PIPELINE`, `PIPELINE_ORDER`, `FILE_PATH` for catalog (can re-export from existing step modules).

---

## 4. File & Module Layout

**Suggested layout (implementation choice):**

```
apps/backend/app/prompts/
├── __init__.py              # get_prompt, load_prompt_pair, overrides (revised)
├── _prompt_loader.py        # NEW: import step, merge SYSTEM/USER, Template.substitute
├── extract_jd_intel.py      # MIGRATE: export SYSTEM, USER, VARIABLES; keep build_messages wrapper
├── tailor_resume_full.py
├── ...
└── prompt_overrides/        # REVISE: one file per step OR single merged store — see §7
    └── .gitignore           # optional: local overrides
```

**Alternative:** Subfolder `prompts/steps/extract_jd_intel.py` — only if import paths stay clean.

**Rule:** Shipped prompts live **in repo**; overrides live under `prompt_overrides/` with **parallel names**, e.g. `extract_jd_intel.py` (override) masking the shipped module via loader indirection — **or** override as **single file** containing only `SYSTEM`/`USER` text parsed by loader (see §7).

---

## 5. Placeholder Contract

1. **Mechanism:** `string.Template` from the standard library.  
   - Valid placeholders: `$job_description`, `$original_resume`, `$mode_id`, …  
   - Escaping literal `$`: `$$` in Template (document in contributor note).

2. **Forbidden in v1:** `str.format` on `USER` for step templates (avoids `{` collision with JSON).

3. **Validation:**  
   - After `substitute`, **scan** for `$[a-z_][a-z0-9_]*` (regex) in output — if any remain → **ValueError** (unfilled placeholder).  
   - Alternatively: `Template.pattern` / manual list of expected placeholders vs `VARIABLES`.

4. **Types:** Callers pass **strings** only; JSON-serialize dicts before inject (`json.dumps(..., ensure_ascii=False)`).

---

## 6. Loader & Registry

### 6.1 Responsibilities

- **`load_prompt_pair(step_name: str) -> PromptPair`**: returns dataclass with `system: str`, `user_template: str`, `variables: tuple[str, ...]`, `source: Literal["shipped", "override"]`.
- **`render_user(step_name, **kwargs) -> str`**: Template substitute + validation.
- **`get_system(step_name) -> str`**: For callers that only need system (rare).

### 6.2 Resolution

1. If override exists for `step_name` → load `SYSTEM`/`USER`/`VARIABLES` from override payload.  
2. Else → import shipped module from `app.prompts.<step_name>` or dedicated `*_prompt` module.

### 6.3 `build_messages` signature

Keep existing call sites stable where possible:

```python
def build_messages(..., **runtime_vars) -> tuple[str, str]:
    system, user_tmpl, variables = load_prompt_pair(STEP_NAME)
    user = render_user(STEP_NAME, user_tmpl, variables, runtime_vars)
    return system, user
```

Each step’s `build_messages` becomes a thin wrapper that maps positional args to **named** Template variables.

---

## 7. Overrides

### 7.1 Target behavior

- **One logical artifact per step** containing both `SYSTEM` and `USER` (same as shipped).
- **On-disk options (pick one in implementation):**

| Option | Description |
|--------|--------|
| **A. Single `.py` file** in `prompt_overrides/` | Full module with `SYSTEM`, `USER`, `VARIABLES` — **import** after path prepend. Strong typing; must trust override code. |
| **B. Serialized payload** (JSON/TOML) | `{ "system": "...", "user": "...", "variables": [...] }` — no code execution; **preferred** if overrides are edited only via API/UI. |
| **C. One text file with structured markers** | Parse `<<<SYSTEM>>>` / `<<<USER>>>` **only** in override loader with tests — not canonical for shipped. |

**Recommendation:** **B (JSON)** for API/UI-driven overrides; **A** for power users who paste from repo. Document one path.

### 7.2 API

- **PUT** `/config/prompts/{step_name}/composer` — body `{ "system": str, "user": str }` (variables inferred from shipped `VARIABLES` or required match).  
- **DELETE** `/config/prompts/{step_name}/composer` — remove override, restore shipped.  
- Deprecate or keep **PUT** `/instructions` and `/rules` for one release — **migration** section.

---

## 8. Call-Site Integration

| Area | Action |
|------|--------|
| `services/tailoring/analysis.py`, `llm_calls.py`, `parser.py`, `cover_letter.py`, `application_questions.py` | Replace `build_messages` internals to use `load_prompt_pair` + `render_user`. |
| `prompt_catalog_builder.py` | Catalog **entries** expose `system_default`, `user_default` (or `instructions`/`rules` **renamed** in API to `system`/`user` for clarity — **breaking**; version API or add fields). |
| **Critique / rewrite** | Two modules; shared schema → import from `_snippets/critique_schema.py` to avoid drift. |

---

## 9. Shared Snippets

Reusable blocks (JD schema prose, resume-diff rules, critique contract) live under **`app/prompts/_snippets/`** as **Python modules** exporting plain strings. Step modules **import** and compose into `SYSTEM` or `USER` with normal string concatenation or f-strings (no `$` inside snippets — only in the step’s top-level `USER` template).

**Example:**

```python
from app.prompts._snippets.jd_intel import JD_SCHEMA_AND_RULES_BODY

USER = f"""Analyze this job description...

{JD_SCHEMA_AND_RULES_BODY}

Job description:
$job_description
"""
```

**Critique / rewrite:** Prefer a single `_snippets/critique_output_contract.py` (or similar) imported by both `critique_resume` and `rewrite_resume` so large schema updates touch **one** file.

**Rule:** Snippets are **library text**, not separate override targets in v1 — operators override the **whole step** `USER`/`SYSTEM` via Composer if needed.

---

## 10. Backend API & Catalog

### 10.1 Schema changes (Pydantic)

Extend `PromptManagerEntry` (or add parallel fields):

- `system: str` — resolved system text (override or shipped).  
- `user_template: str` — `USER` before substitution (or elide large bodies; show `user_preview` + length).  
- `variables: list[str]`  
- `system_is_override`, `user_is_override` — booleans if we allow partial overrides later; **v1** single override blob may set one flag.

**Backward compatibility:** Keep legacy `instructions` / `rules` / `data_template` for one release with **deprecated** flag in OpenAPI, or bump API version.

### 10.2 Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/config/prompts/catalog` | Includes composer fields per step. |
| PUT | `/config/prompts/{step}/composer` | Save full system+user override. |
| DELETE | `/config/prompts/{step}/composer` | Clear override. |

---

## 11. Frontend — Prompt Composer

- **Prompt catalog** page: per-step **two panels** (System | User) with monospace, **variable legend** from `variables`.  
- **Save** → PUT composer endpoint.  
- **Reset** → DELETE composer.  
- **i18n** for labels: “System”, “User template”, “Variables”.  
- Remove or hide **three**-way split (instructions / rules / data template) once migrated.

---

## 12. Migration from Current Prompt Modules

For each `VALID_STEPS` module:

1. **Concatenate** current `INSTRUCTIONS` + `RULES` (and shared rules resolution) into new **`SYSTEM`** — *or* push **long** craft text into **`USER`** per [`prompt-two-scrolls-architecture.md`](./prompt-two-scrolls-architecture.md) (minimal system).  
2. **Rename** `DATA_TEMPLATE` → **`USER`**; replace `{foo}` with `$foo` and update `build_messages` to `Template.substitute`.  
3. **Equivalence tests:** golden output vs old `build_messages` for fixed fixtures (same system+user bytes).  
4. **Remove** `_rules/*.py` **only** where inlined; keep shared snippets as imports.  
5. **Update** `prompt_catalog_builder` to read new exports.  
6. **Migrate** disk overrides from `*.instructions.txt` + `*.rules.txt` → single composer payload (script or manual).

---

## 13. Testing & CI

| Test | Purpose |
|------|---------|
| Per-step unit test | `substitute` with dummy kwargs → no leftover `$`, stable snapshot hash optional. |
| Loader test | Override wins over shipped; DELETE restores. |
| Integration | Config PUT/GET composer round-trip. |
| **CI** | Import all prompt modules; **fail** if `VARIABLES` mismatch or `Template` raises on dummy data. |

---

## 14. Security & Operations

- **Prompt injection:** Untrusted JD/resume only in **USER** after substitution; **SYSTEM** stays small and fixed from repo.  
- **Logging:** Do not log full prompts at INFO by default.  
- **Secrets:** Never store API keys in prompt files; overrides are still plaintext.  
- **Git:** Document `prompt_overrides/` policy (ignored vs committed).

---

## 15. Rollout Phases

| Phase | Scope |
|-------|--------|
| **3.7.6a** | Loader + `string.Template`; migrate **one** pilot step (`extract_jd_intel`); equivalence test; catalog read-only new fields. |
| **3.7.6b** | Migrate remaining steps; deprecate old override file names; composer PUT/DELETE. |
| **3.7.6c** | Frontend Composer UI; remove deprecated API fields. |
| **3.7.6d** | Docs, cleanup `_rules` duplication, final checklist. |

---

## 16. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| **Regression** in LLM behavior | Equivalence tests + small canary rollout. |
| **`$` in user data** | Document escaping; rare in JSON; use `safe_substitute` + detect unfilled only if acceptable. |
| **Large USER templates** | OK; monitor token limits; optional compression in docs only. |
| **API breakage** | Version or parallel fields; deprecation window. |

---

## 17. Implementation Checklist

### Phase 3.7.6a — Foundation

- [ ] Add `PromptPair` dataclass and `_prompt_loader.py` (`load_prompt_pair`, `render_user`).  
- [ ] Implement `string.Template` substitution + unfilled-placeholder check.  
- [ ] Migrate **`extract_jd_intel`** to `SYSTEM` / `USER` / `VARIABLES`; update `build_messages`.  
- [ ] Golden equivalence test vs pre-migration output.  
- [ ] Extend catalog builder to expose `system` + `user_template` + `variables` (additive fields).

### Phase 3.7.6b — Full migration

- [ ] Migrate all `VALID_STEPS` modules.  
- [ ] Consolidate shared rules into `_snippets/` or inline per `USER`.  
- [ ] New override storage format + migration from old `*.instructions.txt` / `*.rules.txt` / `_rules.*.txt`.  
- [ ] Composer PUT/DELETE endpoints.  
- [ ] Remove or deprecate granular override endpoints.

### Phase 3.7.6c — Frontend

- [ ] `lib/api/config.ts` types for composer.  
- [ ] Prompt catalog / composer UI: two panes, save, reset.  
- [ ] i18n strings.

### Phase 3.7.6d — Hardening

- [ ] CI import-all-prompts job.  
- [ ] Update [`prompt-two-scrolls-architecture.md`](./prompt-two-scrolls-architecture.md) if implementation diverges.  
- [ ] Mark Phase 3.7.5 docs **superseded** for prompt structure where conflicted.

---

## Document History

| Version | Date | Notes |
|---------|------|-------|
| 1.0 | 2026-04-14 | Initial phase plan (Python two-scrolls, Template placeholders, composer API/UI). |

---

## See Also

- [`prompt-two-scrolls-architecture.md`](./prompt-two-scrolls-architecture.md) — rationale, security, placeholder strategy.  
- [`phase-3.7.5-technical-plan-claude-opus-4.6.md`](./phase-3.7.5-technical-plan-claude-opus-4.6.md) — prior phase (modular prompts, critique, manager v1).
