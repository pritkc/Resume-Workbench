# Phase 3.7.3 — Manual verification checklist (prompt schema & pipeline refactor)

**Scope:** Validates the Phase 3.7.2 work: split tailoring/JD prompt blocks, two modes (`full` / `light`), legacy `keywords` / `nudge` migration, config APIs, UI, and dependent flows.

**How to use:** Run through in order when possible (API smoke → settings → tailor → edge cases). Check each box when verified in your environment.

---

## 1. Environment and smoke

- [ ] Backend starts without import or startup errors (`uv run` / your usual command).
- [ ] Frontend dev server starts and loads `/` without a blank error overlay.
- [ ] Automated suites still pass locally: backend `pytest`, frontend `npm test`, frontend `npm run build` (optional but recommended before manual QA).

---

## 2. Prompt configuration APIs (backend)

Use your running API base URL and auth as usual (curl, Bruno, browser devtools, etc.).

### 2.1 List prompt options

- [ ] `GET` endpoint that returns tailoring prompt options (e.g. config route for prompt options) exposes **exactly two** options with ids **`full`** and **`light`** (no `nudge` / `keywords`).
- [ ] Each option includes sensible `label` / `description` (or equivalent fields your client uses).

### 2.2 Default prompt id

- [ ] Response includes `default_prompt_id` (or equivalent). Fresh install / cleared storage should default to **`full`** unless you intentionally changed stored config.

### 2.3 Update default prompt (settings parity)

- [ ] `PUT` (or PATCH) to update default tailoring prompt to **`light`** persists and a subsequent `GET` returns **`light`**.
- [ ] Change default back to **`full`** and confirm it persists.

### 2.4 Legacy prompt migration on write (if applicable)

- [ ] If the API accepts stored `prompt_id` / `default_prompt_id` from old clients, sending **`keywords`** migrates to **`full`** (or stored value becomes `full` after save).
- [ ] Sending **`nudge`** migrates to **`light`** (or stored value becomes `light` after save).
- [ ] Sending a truly invalid id still fails with a clear error (or falls back per product rules — match what integration tests encode).

### 2.5 Prompt catalog (read-only)

- [ ] `GET` endpoint for the prompt catalog returns tailoring entries with the **new block structure** (e.g. `tailoring_contract_block`, `tailoring_craft_block`, `tailoring_mode_strategies`, `tailoring_user_message` — exact ids may vary; confirm sections exist and are non-empty).
- [ ] Resume tailoring entry still exposes **system** and **user** template text where your schema defines them.
- [ ] JD intelligence extraction prompts appear **if** your catalog lists them (contract/craft split); content is readable and not truncated to empty strings.

---

## 3. Settings UI (`/settings`)

- [ ] **Prompt / default tailoring mode** control loads without error.
- [ ] Dropdown (or picker) shows only **two** modes: **Full** and **Light** (labels match i18n strings).
- [ ] Changing default and saving updates the UI and survives refresh (or re-fetch of config).
- [ ] Link to **Prompt catalog** (`/settings/prompt-catalog`) works.

---

## 4. Prompt catalog page (`/settings/prompt-catalog`)

- [ ] Page loads catalog entries (no permanent error state).
- [ ] Tailoring-related sections show **contract** vs **craft** split (or clearly separated blocks), not a single undifferentiated blob unless that is expected for your UI.
- [ ] **User message** template (`TAILORING_USER_SHELL` equivalent) is visible where applicable.
- [ ] Expand/collapse or tree navigation still works if you use `PromptCatalogTree`.

---

## 5. Tailor flow (`/tailor`)

### 5.1 Mode selection and persistence

- [ ] Mode picker lists **Full** and **Light** only (no legacy names).
- [ ] Selecting **Full** vs **Light** and running a tailoring pass uses the intended behavior (see 5.3).
- [ ] If you use localStorage or “last used” defaults: old stored values **`nudge`** → UI behaves as **`light`**; **`keywords`** → **`full`** (or defaults reset after migration).

### 5.2 End-to-end tailoring (happy path)

With a real resume + job description + LLM configured:

- [ ] **Full** mode: preview completes, diff/preview renders, no unexpected validation errors.
- [ ] **Light** mode: preview completes; output is **more conservative** than full (fewer structural edits — subjective but should be noticeable on the same JD).
- [ ] **Confirm** persist path (if you use preview → confirm): tailored resume saves; builder opens or resume list updates.

### 5.3 Regression checks

- [ ] **Bold keywords** (or equivalent) still appear after confirm when the preview had them (confirm path should not drop them if your app carries them forward).
- [ ] **Change manifest** / diff summary still appears when enabled (no empty manifest solely due to prompt refactor).
- [ ] **Warnings** in the response (if any) do not reference removed modes (`nudge` / `keywords` as mode names).

---

## 6. Resume API flows that depend on `prompt_id`

- [ ] **Improve resume** (non-preview) endpoint: omitting `prompt_id` uses **saved default** or **`full`** per `_resolve_prompt_id` rules.
- [ ] Explicit `prompt_id: "full"` and `"light"` both succeed.
- [ ] Legacy body `prompt_id: "keywords"` still produces a **full** run (migrated).
- [ ] Legacy `prompt_id: "nudge"` still produces a **light** run (migrated).

---

## 7. Generation defaults and “create resume” flow (if applicable)

- [ ] Last-used tailoring defaults (`generation_defaults` / similar) load **`full`** or **`light`** only.
- [ ] If stored JSON still had **`keywords`** / **`nudge`**, opening create flow or loading defaults shows **migrated** ids after merge.

---

## 8. LLM traces / observability (optional)

- [ ] A tailoring run records **operation** / **metadata** consistent with the primary pipeline (`resume_generate_full` or your current operation name).
- [ ] **Prompt version** fields in traces or logs reference updated versioning (e.g. `tailoring_user` / JD prompts) if you inspect them.

---

## 9. Downstream features on tailored resumes

These should be unchanged by the prompt refactor but are worth a quick pass:

- [ ] **Cover letter** generation for a tailored resume still runs (if your product requires a prior tailor).
- [ ] **Application questions** / packs that reference source vs tailored resume ids still work.
- [ ] **Builder** render of a tailored resume: no schema or section loss solely from new prompt assembly.

---

## 10. Internationalization

- [ ] English (and any other locale you ship) shows **Full** / **Light** strings on tailor and settings, not stale keys or missing translations.

---

## 11. Documentation (quick sanity)

- [ ] `docs/prompts/llm-prompt-composition.md` describes **two** modes and **block assembly** (optional read — confirms docs match product).

---

## Notes

- **Manual “3 resumes per mode”** from the implementation plan: repeat section 5.2 with three different resumes and JDs if you want extra confidence in **full** vs **light** behavior.
- **Pipeline placeholders**: `jd_intelligence` and `critic` steps may exist in code as **disabled** structural placeholders; JD extraction may still run **upstream** in analysis — behavior is “same as before” unless you explicitly enabled a unified runner.

---

## Sign-off

| Date | Tester | Environment (branch / commit) | Result |
|------|--------|------------------------|--------|
|      |        |                        |        |
