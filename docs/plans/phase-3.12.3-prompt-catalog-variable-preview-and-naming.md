# Phase 3.12.3 — Prompt variables: naming, master resume preview, retire `output_language`

**Locked answers (stakeholder):** (1) Pattern **`{step_name}_output`** for LLM-derived blobs. (2) Critique/rewrite draft input → **`tailor_resume_full_output`**. (3) Catalog uses **default master resume only**, no picker. (4) **`output_language`** removed from code/templates; English wording added **manually** in prompts by stakeholder. (5) **Clean break** — no deprecation shims.

**Implementation checklist:** [phase-3.13.4-implementation-checklist.md](./phase-3.13.4-implementation-checklist.md)

**Update (2026):** Prompts use **`$extract_jd_intel_output`** with optional dot-separated paths (e.g. **`$extract_jd_intel_output.requirements.years_min`**); Python passes **`jd_intel_blob`** — see **`apps/backend/app/prompts/text/README.md`**.

---

## Read this first (quick approval)

### What we would actually change (simple)

1. **Variables that are the output of another LLM step** (example: JD intelligence blob that came from `extract_jd_intel`)  
   - **Rename** the template placeholder and Python `render_user_template(...)` kwargs so the name matches the **step that produced it**, or is obviously derived (e.g. `extract_jd_intel_output` instead of `job_intelligence`).  
   - If the **step id** itself is ugly or unclear, rename the **step** in a separate, small pass (only if you want — that touches routes, labels, and docs more widely).  
   - **Cost:** every `user.txt` that uses the old `$name`, every `build_messages` call site, and any on-disk **composer JSON** that still uses old names must be updated (or we accept a one-time break and document it).

2. **Variables that only exist at runtime** (paste text, click flow — e.g. raw `job_description`)  
   - **Leave names and behavior as they are.** No preview magic required.

3. **Variables that are “fixed shape” data built from the master resume** (serialized resume / contract-style payloads — what you called `original_resume`-style)  
   - In prompt catalog, **show the current serialized content** for the **resolved master resume** (singular, no picker), using the **same code path** tailoring uses today to build that string.  
   - **Staleness (your question):** After you change schema + diff parser and **rebuild**, you do **not** depend on “running tailoring once” to refresh **code**. The serializer runs in the app process; the next API call uses new code.  
   - **What can still look “stale”:** (a) **static** example text checked into the repo if we ever showed only that — we won’t rely on that for this case if we wire live serialization; (b) the **document stored in the database** if it was never re-saved through the new normalizer — then the JSON shape might be old until the user edits/saves or you run a migration. So: **real-time fresh = yes**, as long as we read live data + current serializer, not a cached copy from an old job.

4. **`output_language`**  
   - **Remove** the variable from templates and from `build_messages` / callers.  
   - **Add** a single clear line in the relevant prompts: output is **English** (or fixed wording you prefer).  
   - **Cost:** all steps that pass `output_language` today need their signatures and UI/catalog cleaned up in one PR.

### Most important notes

- **Renaming `$placeholders` is a breaking change** for anyone with composer overrides containing the old names. Plan: grep + doc + optional short migration note in changelog.  
- **Showing master resume content** needs a **resume id** (or “primary resume”) and normal **resume read** auth — same as opening a resume elsewhere. No new “secret” data.  
- **Scope stays narrow:** no “last-run replay,” no separate fixture microservice, no heavy metadata model — unless you later ask for it.

### Resolved (see checklist **3.13.4**)

Open questions from the first draft are **answered**; execution tasks live only in [phase-3.13.4-implementation-checklist.md](./phase-3.13.4-implementation-checklist.md).

---

## 1. Goal (aligned to your list)

- **LLM-output variables:** names should read as “this came from step X” (or `X_output`). Improve vague step names if needed — short and obvious.  
- **Runtime-only variables:** unchanged.  
- **Master-resume / schema-driven variables:** show **live** serialized content for the **default master resume** so prompt authors see what the model would get **with current backend code**.  
- **Retire `output_language`:** English-only via prompt text; remove parameter plumbing.

---

## 2. Variable categories (rules of thumb)

| Category | Examples (today-ish) | Action |
|----------|----------------------|--------|
| **Output of another LLM step** | JD intelligence JSON fed into tailor / critique / rewrite | Rename to step-oriented names; update `text/*/user.txt`, `VARIABLES`, `build_messages`, composer docs. |
| **Only at runtime / user action** | Raw job description text, paste buffers | Leave as-is. |
| **Derived from master resume + fixed serializers** | Serialized resume / response contract where we control shape | Catalog: one small UI affordance + one API field or endpoint that returns **current** serialized string for selected `resume_id`. |
| **Retired** | `output_language` | Remove from templates and code paths; add English line to prompts. |

---

## 3. Staleness — direct answer

| Question | Answer |
|----------|--------|
| After schema + parser change + rebuild, does prompt catalog show the **new** resume JSON shape immediately? | **If** the catalog shows data produced by **running current serializer code** on the **current** resume record: **yes**, on next load — no tailoring job required. |
| When would it still look “old”? | If the **stored** resume payload in DB was never written through the new shape (no re-save, no migration). That is a **data** issue, not “catalog cache.” |
| Can we get “fresh” real time? | **Yes:** implement preview as “call the same function tailoring calls, now” with `resume_id`, not “show last job’s saved prompt snapshot.” |

---

## 4. Implementation sketch (minimal)

### 4.1 Renames (LLM-derived)

- Pick a single convention, e.g. `{producer_step}_output` for JSON blobs produced by a prior step.  
- Table in the implementation PR: old name → new name per step; grep `render_user_template`, `VARIABLES`, `user.txt`, tests.  
- Update `docs/agent/llm-prompt-inventory.md` and any catalog hints.

### 4.2 Live master-resume (schema-driven) preview

- **Backend:** `GET /api/v1/config/prompts/catalog/master-resume-preview` (no `resume_id` query) — resolves master resume internally, returns serialized string for preview, **size-capped** with a `truncated: true` flag.  
- **Frontend:** show expandable block for **`$original_resume`** (name unchanged in this phase) on relevant steps; **no** selector.  
- **No** separate fixture file required for that variable if live path exists; optional tiny synthetic fallback when no resume selected (“Pick a resume to preview”).

### 4.3 Retire `output_language`

- Remove from `tailor_resume_*`, `rewrite_resume?` (if present), `cover_letter?`, and any service passing it.  
- Insert fixed sentence in `text/.../system.txt` or `user.txt` where tone mattered.

---

## 5. Edge cases (short)

| Case | Handling |
|------|----------|
| Composer JSON still has old `$names` after rename | Validation error in UI or save path; changelog tells devs to reset/update composer files. Or short-lived alias in `render_user_template` wrapper (only if you answer yes to Q5). |
| Huge resume JSON | Truncate for display with “show full” lazy load or cap + download copy button later. |
| No `resume_id` selected | Show message; do not fake stale content. |
| User has no resumes | Same — empty state. |

---

## 6. Files likely touched

- `apps/backend/app/prompts/**/*.py`, `text/**/*.txt` — renames + English line + `output_language` removal.  
- `apps/backend/app/services/tailoring/` (and any caller of `build_messages` with `output_language`).  
- `apps/backend/app/routers/config.py` / `prompt_catalog_builder.py` — catalog + optional preview route.  
- `apps/frontend/.../prompt-catalog` and `prompt-card.tsx` — resume selector + preview display.  
- `apps/frontend/lib/api/config.ts` — types for new field or endpoint.

---

## 7. Success criteria

- Placeholder names for LLM-derived inputs read clearly against **pipeline step names**.  
- Catalog can show **live** master-resume serialization for a selected resume, reflecting **current** backend code after deploy.  
- `output_language` gone; prompts state English output explicitly.

---

## 8. Out of scope for this phase

- JD intelligence **live** preview without running extract or pasting JD (you already said leave runtime vars alone).  
- Renaming **step modules** / routes (`extract_jd_intel` → something else) unless you explicitly want that broader refactor.  
- Last-run trace replay, fixture packs as primary system, extra Pydantic fields on every variable “for analytics.”

---

*Status: planning — implement after answers in section “Questions for you”.*
