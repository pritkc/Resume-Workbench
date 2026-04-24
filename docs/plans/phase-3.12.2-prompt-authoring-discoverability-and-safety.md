# Phase 3.12.2 — Prompt Authoring: Discoverability, WYSIWYG, and Safe Continuous Editing

> **Relationship:** Builds on **Phase 3.7.6** (`string.Template`, composer) and the split where resume-diff **schema** is in `_rules/resume_diff.py` and narrative blocks in `tailoring_blocks.py`. **Phase 3.12.1** owns broader doc cleanup. This doc is the **architecture** note for how prompts live on disk and in the UI.
>
> **Implementation:** Full technical plan, file inventory, phased **checklist**, tests, docs, and UI wireframes live in **[phase-3.12.2-implementation-checklist.md](./phase-3.12.2-implementation-checklist.md)**.
>
> **Status:** **Shipped (3.12.2)** — `text/` tree (pipeline steps, fragments, enrichment), `_text_prompts.py`, placeholder tests, and checklist **§7** complete. Day-to-day: **Read this first** + `text/README.md`.

---

## Read this first (brief)

### What you asked for (authoritative — overrides earlier wording in this file)

| Expectation | Implication for the plan |
|-------------|-------------------------|
| **One directory** an agent can open and see everything, **least friction** to edit | Physical layout beats “ scattered Python + `_rules` + overrides ” as the **north star**. **Locked:** under the backend app tree, not repo root — canonical tree e.g. `apps/backend/app/prompts/text/` with `{step}/system.txt`, `{step}/user.txt`, shared `fragments/*.txt`, plus **README or `index.yaml`** listing steps. (Exact folder name `text/` is implementer-default; rename only if it clashes.) |
| **No heavy history / snapshots** | Out of scope: version tables, time travel, audit UI. **Keep:** UI last save + reset/rollback you already use (`prompt_overrides`, composer delete). |
| **Clean duplicate names** (UI + code) | Same pass as the move: one **step id**, one **label** in UI, one pair of files; remove alias exports where safe. |
| **Raw text files vs today** | If we move to `.txt`: **UTF-8**, strip BOM / odd control chars on load, normalize `\r\n` → `\n`. **Placeholders:** keep **`string.Template` + `$name`** (already chosen in 3.7.6) — that stack is **already the main protection** against `{`/`}` clashes with JSON in prompts. Document “literal `$` → `$$`”. Optional later: CI check for unknown `$words`. |
| **As fast as possible** | Prefer **one migration PR** that establishes the directory + thin loader, then delete dead names. **Defer:** fancy WYSIWYG preview pane, generated long reports, DB/CMS prompts. |

### Recommended plan (speed-first, matches your priorities)

1. **Introduce one canonical directory** of plain-text prompts (system + user per step + shared fragments as separate files).  
2. **Thin Python** per step (or one registry module) that only: loads those files, declares allowed `$variables`, calls existing `build_messages` / composer paths.  
3. **In the same change:** trim catalog/UI strings so labels match folder names / step ids; remove redundant constant names in code (single import path for “resume diff schema”, etc.).  
4. **Keep** composer + file overrides for “last saved / rollback”; no new snapshot system.  
5. **Optional follow-up** (only if still painful): minimal CI script “unknown placeholder” or a one-screen preview in UI — not blocking.

### Decisions (locked in — 2026 stakeholder answers)

| Question | Answer |
|----------|--------|
| **Directory location** | **Not** at repo root. **Explicit path under** `apps/backend/app/prompts/…` is approved (e.g. `apps/backend/app/prompts/text/` as default implementer choice). |
| **`.txt` vs `.md`** | **Shipped prompts use `.txt`.** Rationale: loaders treat file bodies as opaque UTF-8 text for `string.Template`; no markdown processor, no accidental “MD means something special” drift. Editors still highlight `.txt`; optional `.md` **only** for human-only docs beside the tree (e.g. `text/README.md`). |

### If you read nothing else

**Goal:** agents open **one folder**, edit **plain files**, Python stays thin. **Safety:** UTF-8 + newline cleanup + existing `$` template rules; no big new framework. **Not now:** prompt history databases, rich-text editors, remote prompt services.

---

## 1. Goals and success criteria

| Goal | Meaning |
|------|--------|
| **G1 — One obvious place** | Someone who did not write the code can answer: “Where do I edit the system prompt for step X?” in **one hop** (URL, path, or single index file). |
| **G2 — WYSIWYG** | What you see in the editor is what the LLM receives, modulo clearly labeled **runtime injections** (e.g. `$job_intelligence`). No hidden concatenation order in the UI. |
| **G3 — Safe paste** | Copy-paste from Word, Google Docs, Slack, or agent output must not silently corrupt templates: Unicode OK; smart quotes and `$` edge cases **detected or escaped** with policy; line endings normalized in CI or on save. |
| **G4 — Agent-friendly** | A single machine-readable **inventory** (JSON/YAML) lists every artifact id, disk path, role (`system` / `user` / `shared_fragment`), and allowed placeholders—so agents do not grep the wrong duplicate name. |
| **G5 — Naming sanity** | One **canonical id** per logical artifact; aliases deprecated with linter or codegen—not six names for the same string across modules. |

**Non-goals (confirmed):** prompt **version history / snapshots / audit timelines**; production-grade CMS; replacing the LLM stack; DB-only prompt storage without git. **In scope only lightly:** “WYSIWYG” as **optional** preview later — not required for the first fast migration.

**Still non-goals unless you reopen them:** non-admin users editing prompts; full i18n of prompt copy.

---

## 2. Current pain points (baseline)

These are the forces that drive refactors, independent of any one file layout.

1. **Split sources of truth:** Shipped Python, `prompt_overrides/*.txt`, composer overrides, and shared `_rules/*.py` mean “effective prompt” is assembled at runtime—good for power users, bad for **WYSIWYG** unless the UI shows **resolved** text and labels **each** contributor slice.
2. **Duplicate or overlapping names:** Examples include contract blocks re-exported under multiple constants (`RESUME_DIFF_RULES` vs `TAILORING_CONTRACT_BLOCK`), and legacy aliases (`DATA_TEMPLATE` vs `USER_TEMPLATE`). Humans and agents both pick the wrong symbol.
3. **Placeholder vs content collision:** `string.Template` uses `$identifier`. Any literal `$` in prose (prices, regex, Markdown) is a footgun unless escaped (`$$`) or validated in CI.
4. **JSON or braces inside user templates:** JD schemas and `response_contract` live beside `$placeholders`. This is why 3.7.6 rejected `str.format` for the outer shell—any future move toward `{foo}` templating reintroduces escaping hell.
5. **No single “prompt package” artifact:** Editing is “edit Python here, maybe also shared rules there, maybe also overrides on disk”—hard to snapshot “the prompt we used Tuesday.”

---

## 3. What “WYSIWYG” can mean (spectrum)

Pick one primary UX; others can be secondary.

| Level | Description | Pros | Cons |
|-----|-------------|------|------|
| **W0 — Raw text** | Monaco (or textarea) with monospace, no preview. | Simple, diff-friendly. | Not really WYSIWYG; users mentally substitute variables. |
| **W1 — Preview pane** | Left: edit template; right: **resolved preview** with sample JSON + highlighted injected regions. | True WYSIWYG for **runtime** shape; still plain text on disk. | Needs fixture data per step; maintenance. |
| **W2 — Block editor** | Notion-style blocks for sections (Role, Contract, Craft). | Friendly for non-engineers. | Serialization format + migration cost; harder git diffs unless designed carefully. |
| **W3 — Rich text (HTML/RTF)** | Bold/lists in DB. | Familiar to some editors. | **Bad default** for LLM prompts (hidden markup, encoding); only viable with a **canonical plain-text export** and strict sanitization. |

**Recommendation:** Target **W1** as the product definition of WYSIWYG: **template + resolved preview + variable chips**, not a rich-text document editor. Rich text (W3) is explicitly **out of scope** unless converted to plain text at save time with tests.

---

## 4. Special characters, encoding, and “what breaks prompts”

### 4.1 Layers of safety

| Layer | Responsibility |
|-------|----------------|
| **L1 — Storage** | UTF-8 everywhere; normalize newlines (`\r\n` → `\n`) on save or in CI; optional NFC Unicode normalize if you see copy-paste issues from macOS/iOS. |
| **L2 — Template engine** | Keep **one** outer substitution mechanism (`string.Template` or a small custom `${id}` parser). Document **forbidden** patterns in **narrative** sections (e.g. raw `$` → use `$$` or reword). |
| **L3 — Validation (CI + API)** | On save: parse template, ensure every `$word` is in the allowlist; ensure no unknown placeholders; optional max length; optional “no null bytes / control chars” except `\n\t`. |
| **L4 — Smoke** | Optional: one integration test per step that builds messages with **fixture** payloads and asserts substring presence/absence—catches accidental deletion of critical instructions. |

### 4.2 Concrete footguns to design against

- **`$` in prose:** prices (`$100k`), variables (`$PATH`), Markdown footers. Mitigations: (a) escape as `$$`, (b) move money examples to user-fixed copy without `$`, (c) switch delimiter to `${var}` with a regex-based engine that only matches allowlisted names (heavier but clearer).
- **Smart quotes:** Usually harmless in LLM text; can break **JSON** if pasted into a JSON example inside a template. Mitigation: keep JSON examples in **heredoc-like** fenced blocks in **docs**, not inside executable templates—or validate JSON blocks in CI where applicable.
- **Trailing BOM / zero-width chars:** Strip on save in admin UI and in loader.
- **Composer override vs shipped:** UI must show **which layer wins** (already partially there); “WYSIWYG” must mean **effective** preview, not “shipped file only.”

---

## 5. Design space: architectural options

Below are **distinct** system designs, not incremental tweaks. You can combine pieces, but each row is a coherent “north star.”

### Option A — **Git-first packages (folder per step)**

Each step is a **directory** under e.g. `apps/backend/app/prompts/steps/extract_jd_intel/`:

- `system.md` or `system.txt`
- `user.md`
- `meta.yaml` (`id`, `placeholders`, `shared_includes`, `model_hint`)

Loader reads files at startup (or cached import). Overrides become **git branches** or replace whole folder via deploy artifact.

| Pros | Cons |
|------|------|
| WYSIWYG-friendly (open folder = whole prompt); great for agents (“edit this directory”). | Need loader + tests; Python code moves to thin glue. |

### Option B — **Single manifest per environment (`prompts.bundle.yaml`)**

One large YAML (or JSON) with keys per `step_name`, each value `{ system, user, variables }`. Generated into typed Python at **build time** for runtime performance and typecheck.

| Pros | Cons |
|------|------|
| One file to search; easy export/import. | Merge conflicts; huge diffs; still need validation pipeline. |

### Option C — **Database + version table (CMS-lite)**

Prompts in Postgres with `version`, `author`, `effective_at`. Git holds **migrations** that seed defaults.

| Pros | Cons |
|------|------|
| Non-git operators; audit trail; A/B. | Loses “prompts live next to code” unless you add export-to-git; harder for OSS and agent PRs. |

### Option D — **Keep Python canonical + codegen inventory (minimal move)**

Shipped prompts stay Python (or two `.txt` files **imported** by Python). A script emits `prompt_inventory.json` + OpenAPI extension for the UI. Composer remains the WYSIWYG surface; repo stays single source of truth.

| Pros | Cons |
|------|------|
| Smallest migration from today; aligns with 3.7.6. | True “folder per step” clarity is weaker than A unless you still split files. |

### Option E — **AST/lint layer (“prompts as data”)**

Prompts authored as structured records (YAML/JSON Schema) with fields `role_block`, `contract_block`, `craft_block`—rendered into system/user strings by a **pure function** with deterministic ordering.

| Pros | Cons |
|------|------|
| Catalog UI becomes trivial (edit fields); ordering bugs go away. | Migration cost; authors must think in schema fields. |

### Option F — **External template service**

Fetch prompts from remote at runtime (feature flags, LaunchDarkly-style).

| Pros | Cons |
|------|------|
| Instant rollout without deploy. | Network dependency; security; overkill for current scale. |

### Option G — **“Prompt compiler” in CI**

Authoring format is Markdown with front-matter; `uv run compile-prompts` emits Python modules. Invalid placeholders fail the build.

| Pros | Cons |
|------|------|
| Great for agents + humans; enforces validation before merge. | Extra toolchain; debug “what failed” stories must be excellent. |

---

## 6. Naming and duplication: target principles

Regardless of A–G, adopt **policy** (enforce with lint or codegen):

1. **One canonical id** per shipped artifact, e.g. `prompt.resume_diff.output_schema` — not three Python constants pointing at the same bytes unless two are explicitly `= ALIAS` with a **single** assignment site and a **no reassign** lint rule.
2. **Deprecate surface aliases:** `DATA_TEMPLATE` → `USER_TEMPLATE` only; re-export with `__getattr__` deprecation warning if needed during migration.
3. **Shared fragments** register in one **registry dict** keyed by id; step modules only **reference** ids, do not copy-paste bodies.
4. **Human-facing labels** (`STEP_LABEL`, catalog titles) stay separate from **machine ids** (`STEP_NAME`) — never reuse the same string for both without noticing.

---

## 7. Recommended direction (updated for single-directory + speed)

Previous drafts here suggested “Tier 1 = Python + inventory, maybe folders later.” **That is superseded** by the expectations in **Read this first**: the default recommendation is now **Option A–style immediately** — one tree of **plain text files** + minimal loader, done in as few PRs as practical.

### Phase A — Do first (fast path)

1. **Create the single directory layout** (exact tree TBD in implementation; see **Questions for you** in the brief section). Every pipeline step has `system.txt` + `user.txt` (or equivalent); shared pieces (resume diff schema, jd intel contract, etc.) are **files under `fragments/`** not re-exported Python duplicates.  
2. **One `README.md` or `index.yaml`** in that directory: table of step id → relative paths → allowed `$variables` (so an agent never greps blind).  
3. **Loader:** at import or first use, read UTF-8 text, apply newline normalization, optional BOM strip; assemble system/user the same way `build_messages` does today (including composer override **overriding** disk text when present — behavior unchanged).  
4. **Rename / dedupe** in UI + Python: one label per card, one canonical symbol per fragment in code.

### Phase B — After A, only if still painful

5. **Lightweight CI** or save-hook: warn on unknown `$identifier` in shipped files.  
6. **Optional W1 preview** (resolved pane) — nice, not part of the “fast” commitment.

### Deprioritized vs earlier draft

- **Option D** (stay Python-heavy + codegen only) is **fallback** if you hit a blocker (e.g. dynamic imports); it is no longer the default recommendation.  
- **Option G** (Markdown compiler), **Option C** (DB), **Option F** (remote): still out unless requirements change.

---

## 8. Risk register

| Risk | Mitigation |
|------|------------|
| Preview diverges from production | Preview must call the **same** `build_messages` / assembler as runtime, not a reimplemented string join. |
| CI validation too strict | Start warn-only mode; flip to error after cleanup. |
| Agents edit wrong file | Inventory + “edit links” in API (already started with `system_prompt_files` / `user_prompt_file`) — extend with **fragment ids** when registry lands. |
| Merge conflicts on monolith bundle | If you choose Option B, shard by step file anyway or accept pain. |

---

## 9. Locked decisions (no longer open)

- **Layout:** single canonical tree **under** `apps/backend/app/prompts/` (not repo root); default folder name **`text/`** for shipped `system.txt` / `user.txt` / `fragments/*.txt` unless implementation chooses a synonym and updates this doc once.
- **File format:** **`.txt`** for all machine-loaded prompt bodies; **`README.md`** allowed for index/navigation only.
- **Delimiter:** unchanged default — **`$name` + `string.Template`** until a future phase explicitly funds a lexer change.

---

## 10. Suggested follow-up docs (when implementing)

- Short **ADR**: “Why shipped prompts live under `app/prompts/text/` as `.txt`, not repo root or DB.”
- **`docs/agent/llm-prompt-inventory.md`** generated or verified against codegen output (ties to 3.12.1 cleanup).
- **UI spec** for W1 preview: fixtures location (`apps/backend/tests/fixtures/prompt_preview/…`), privacy (no real PII in defaults).

---

## 11. Summary

**North star:** one **directory** of plain-text prompts (+ index), thin Python, **git** as source of truth, existing **UI save + rollback** kept. **Not building:** snapshot/version history product. **Safety for raw files:** UTF-8, newline/BOM hygiene, keep **`string.Template`** (already protects the worst `{`/`}` issues). **Speed:** ship directory + loader + dedupe names first; preview panes and heavy CI are optional second.

Implementation order: **physical consolidation (Phase A) → optional lint/preview (Phase B)** — not the reverse.
