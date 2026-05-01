# Shipped LLM prompts (`text/`)

**Source of truth** for pipeline prompt bodies used by `VALID_STEPS`. Edit **`.txt`** files here; Python modules under `app/prompts/` load them via `_text_prompts.read_shipped_txt`.

## Layout

| Path | Purpose |
|------|---------|
| `output_file_schema_rules/` | Shared **resume diff JSON** contract (`resume_diff_output.txt`), injected at runtime as **`$resume_diff_rules`** in tailor + rewrite **user** messages |
| `{step_id}/` | Per-step **`system.txt`** and **`user.txt`** (`parse_resume/`, `extract_jd_intel/`, `tailor_resume_full/`, `tailor_resume_lite/`, `critique_resume/`, `rewrite_resume/`, `cover_letter/`, `answer_questions/`) |
| `enrichment/{analyze,enhance,regenerate_item,regenerate_group}/` | Each op has `system.txt` + `user.txt` |
| `index.yaml` | Machine-readable list of step ids and enrichment ops |
| `fragments/` | Deprecated — see `fragments/README.md` |

### `tailor_resume_full` (three-way split)

- **`tailor_resume_full/user.txt`:** JD first, then resume, response contract, **`$resume_diff_rules`**; short **EDITORIAL ORDER** TOC pointing at system + schema message.
- **`tailor_resume_full/system.txt`:** **`PRIMARY RUN RULES`** (top, edit often), **ROLE & GOAL**, **PROCESS** only — full-tailor framing.
- **`output_file_schema_rules/resume_diff_output.txt`:** Universal **output bible**: precedence vs PRIMARY RUN RULES, JSON shape/indexing/locks, plus shared editorial (bullets, calibration, ATS, banned words, etc.) for any phase using this diff format.

## Overrides

- **Per-step prose:** `app/prompt_overrides/{step}.system.txt` (or legacy `{step}.instructions.txt`), `{step}.rules.txt` (diff block override for tailoring steps when used)
- **Composer:** `app/prompt_overrides/{step}.composer.json`
- **Shared diff:** `app/prompt_overrides/_rules.resume_diff.txt`

Composer and file overrides **replace** shipped text at runtime; they do not live in this directory.

## Template placeholders

Rendering is implemented in **`app/prompts/_prompt_loader.render_user_template`** as two passes:

1. **JD blob (optional)** — When the caller passes **`jd_intel_blob`** (the cached `job_keywords` dict), placeholders rooted at **`$extract_jd_intel_output`** are expanded first (same **`{step}_output`** convention as **`$tailor_resume_full_output`**, **`$critique_resume_output`**, etc.).
   - **Whole blob:** `$extract_jd_intel_output` alone → compact JSON for the entire dict (empty keys stripped via **`jd_intel_to_prompt_json`** in **`app/services/tailoring/jd_intel_blob.py`**).
   - **Dot paths:** e.g. `$extract_jd_intel_output.requirements.years_min`, `$extract_jd_intel_output.role.title` → JSON fragment for that sub-value; missing path → **`null`**.
   - If **`jd_intel_blob`** is omitted but **`extract_jd_intel_output=`** is supplied as a JSON **string**, it is parsed and used for the same placeholders (composer-only convenience).
2. **`string.Template`** — Remaining **`$name`** placeholders (`$original_resume`, `$response_contract`, `$resume_diff_rules`, …). A literal dollar sign in prose must be **`$$`**.

Step modules **`tailor_resume_full`**, **`tailor_resume_lite`**, **`critique_resume`**, and **`rewrite_resume`** take **`jd_intel_blob: dict`** at **`build_messages`** time. Shipped **`user.txt`** files use **`$extract_jd_intel_output`** for the full blob or **`$extract_jd_intel_output.<nested.key>`** for slices.

Other common tailoring-related names: **`$tailor_resume_full_output`**, **`$critique_resume_output`**, **`$original_resume`**, **`$response_contract`**, **`$resume_diff_rules`**. Auxiliary writing prompts use **`$tailored_resume`** and **`$resume_profile`**. There is no **`$output_language`** placeholder.

**Runtime injection points:** tailoring and critique/rewrite receive the JD blob (as above) plus resume/contract/diff rules as applicable; cover letter and application-question prompts receive **`$tailored_resume`** and **`$resume_profile`**.

**Stored `job_keywords`:** Persists the extractor’s JSON (shape driven by **`extract_jd_intel`** prompts). **`enrich_jd_intel_blob`** may fill nested **`role`**, **`company`**, and **`location`** when the model leaves them empty. There is no second server-side “legacy flat” merge. JD extraction LLM rows use **`operation`** = **`extract_jd_intel_output`** (constant **`LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT`** in **`app/prompts/_constants.py`**); older traces may still show **`job_extract_keywords`**.

**Master resume for catalog preview:** `GET /api/v1/config/prompts/catalog/master-resume-preview` serializes the same `original_resume` string tailoring would use for the **active** resume if one is set; otherwise the **first resume in list order with no `parent_id`**; otherwise the **first resume** returned by `list_resumes`. Payload is capped at **256 KiB** with a `truncated` flag.

**Response contract for catalog preview:** `GET /api/v1/config/prompts/catalog/response-contract-preview` returns the same compact JSON as `$response_contract` for **full** and **lite** (`build_response_contract` → `to_prompt_dict`), using the same master resume row as above. Each mode string is capped at **256 KiB** with its own `truncated` flag.

Encoding: **UTF-8**. Files are normalized to Unix newlines on load.

## Agent index

See also **`docs/agent/llm-prompt-inventory.md`** (from the repo root) for the full pipeline map.

## Prompt Catalog (Settings UI)

In the app: **Settings** → **LLM Prompt Catalog** (`/settings/prompt-catalog`).

| Area | What it is |
|------|------------|
| **On this page** (sidebar on large screens, “Jump to” on small screens) | Quick links: pipeline overview → each **shared rules** card → each **pipeline step** card. |
| **Pipeline** | Read-only diagram of Full vs Lite step order. |
| **Shared resume-diff rules** | Editable shared rules + expandable **shipped default** (full height on the page, not a tiny scroll box). |
| **Pipeline steps** | Per step: paths to shipped `.txt` files, model override, **Prompt composer** (expand the section). Inside composer: **System** and **User** tabs so each message uses the full width; text areas **grow with content** (scroll the window to read long prompts). **Shipped defaults** is a separate expandable reference block. |

Shipped files live under this `text/` directory; composer and `prompt_overrides/` still override at runtime (unchanged).
