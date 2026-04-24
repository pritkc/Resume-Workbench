# Phase 3.13.5 — Prompt authoring vs runtime (scratch notes)

**Audience:** quick read; not a spec yet.

---

## How prompts actually hit the model (today)

- Python builds **two strings**: `system_prompt` and user `prompt` (your “user template” after `$…` substitution).
- They go to the API as **two chat messages**, not one pasted blob:
  - `role: "system"` → full system string  
  - `role: "user"` → full user string  
- For **JSON** steps, the backend **appends** a short line on the system side: respond with valid JSON only (see `complete_json` in `app/llm.py`).
- So: **not** “sys + user concatenated into one message” for the provider — **yes**, each side is still “one raw string” per role.

---

## Why the catalog shows sections

- **Repo reality:** many steps = several `.txt` files + fragments stitched in code (`build_messages`).
- **UI reality:** sections = easier navigation and copy for humans; the model never sees “sections,” only the **final** system + user strings.

---

## Your workflow (external LLM for suggestions)

- **Catalog:** icon-only “advisory copy” builds one clipboard with two lines of rules (keep `$…` tokens), empty `---- revised system ----` / `---- revised user ----` pairs for the advisor to fill, then `---- system ----` / `---- user ----` blueprint blocks.
- **Watch:** `$variable` names must match what code passes (`VARIABLES` / `render_user_template`). Composer save validates unknown `$` names.

---

## Single raw text vs structured files

| Idea | Upside | Downside |
|------|--------|------------|
| **One big system + one big user file** | Easy to ship whole prompt to ChatGPT / Claude; fewer files | Weaker reuse (shared rules), harder diffs, easier to break placeholders |
| **Keep fragments + catalog (current)** | Shared rules once; catalog shows structure | More copying if you iterate section-by-section with a third party |

**Pragmatic take:** keep structured sources for the product; if we want less friction later, add a **“Copy assembled system” / “Copy assembled user”** (or export) button — optional future work, not required to understand runtime.

---

## “Contract” without being heavy

- **Input contract (soft):** declared `$placeholders` + validation on composer save.
- **Output contract (harder):** JSON shape / `response_contract` / parsing — that’s where strictness lives, not in Markdown headings inside the prompt.

Trusting the user to label “SECTION:” lines in prose is **fine for readability**; it does **not** change how the API is called — still two strings.

---

## Open questions (for you / later)

1. Do we need **one-click copy** of fully assembled system + user (post-substitution with dummy JSON) for advisor tools?  
2. Should **composer overrides** support a single “monolithic user” mode, or stay file-aligned?  
3. Any step where **system + user should be one user-only message** for a cheaper model? (Would be a behavior change, not cosmetic.)

---

## Rationale (why not change this in 3.13.4)

- 3.13.4 was naming + catalog preview + removing `output_language`.  
- Splitting or merging message roles touches **every** LLM caller and evals — separate phase if we do it.
