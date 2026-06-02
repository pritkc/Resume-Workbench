# Shipped LLM prompts (`text/`)

**Source of truth** for pipeline prompt bodies used by `VALID_STEPS`. Edit **`.txt`** files here; Python modules under `app/prompts/` load them via `_text_prompts.read_shipped_txt`.

## Layout

| Path | Purpose |
|------|---------|
| `output_file_schema_rules/` | Legacy compact JSON diff contract (`resume_diff_output.txt`) for fallback compatibility; section-header content policy (`resume_content_rules.txt`) injected into resume tailoring as `$content_rules` |
| `{step_id}/` | Per-step **`system.txt`** and **`user.txt`** (`parse_resume/`, `extract_jd_intel/`, `tailor_resume_full/`, `tailor_resume_lite/`, `critique_resume/`, `rewrite_resume/`, `cover_letter/`, `answer_questions/`) |
| `enrichment/{analyze,enhance,regenerate_item,regenerate_group}/` | Each op has `system.txt` + `user.txt` |
| `index.yaml` | Machine-readable list of step ids and enrichment ops |
| `fragments/` | Deprecated — see `fragments/README.md` |

### `tailor_resume_full` (three-way split)

- **`tailor_resume_full/user.txt`:** JD first, then **`$content_rules`**, resume, and **`$output_template`**; the LLM returns section-header text that is parsed back into the compact diff.
- **`tailor_resume_full/system.txt`:** **`PRIMARY RUN RULES`** only — compact full-tailor framing for role, priority, title calibration, and claim policy.
- **`output_file_schema_rules/resume_content_rules.txt`:** Section-header-compatible content bible: locks, signal strategy, ATS, skills, writing policy, claim calibration, and banned patterns. It intentionally excludes JSON-only format/schema instructions.
- **`output_file_schema_rules/resume_diff_output.txt`:** Legacy compact JSON **output bible** retained for fallback compatibility.

Runtime note: the primary tailoring operation is still named **`resume_generate_full`**, but both **full** and **lite** prompt modes now target section-header text. The backend normalizes sparse or retained sections into the compact addressed diff shape: **`summary`**, **`experience`**, **`projects`**, **`skills`**, and **`bold_keywords`**. When the critique setting is enabled, the full tailoring pipeline also runs **`critique_resume`** and **`rewrite_resume`** as section-header text steps before applying the final diff.

## Overrides

- **Per-step prose:** `app/prompt_overrides/{step}.system.txt` (or legacy `{step}.instructions.txt`), `{step}.rules.txt` (diff block override for tailoring steps when used)
- **Composer:** `app/prompt_overrides/{step}.composer.json`
- **Shared rules:** `app/prompt_overrides/_rules.resume_diff.txt` for legacy JSON diff fallback output; `app/prompt_overrides/_rules.resume_content.txt` for section-header resume content policy.

Composer and file overrides **replace** shipped text at runtime; they do not live in this directory.

## Template placeholders

Rendering is implemented in **`app/prompts/_prompt_loader.render_user_template`** as two passes:

1. **JD blob (optional)** — Legacy prompts can still expand placeholders rooted at **`$extract_jd_intel_output`** from the cached `job_keywords` dict.
   - **Whole blob:** `$extract_jd_intel_output` alone → compact JSON for the entire dict (empty keys stripped via **`jd_intel_to_prompt_json`** in **`app/services/tailoring/jd_intel_blob.py`**).
   - **Dot paths:** e.g. `$extract_jd_intel_output.requirements.years_min`, `$extract_jd_intel_output.role.title` → JSON fragment for that sub-value; missing path → **`null`**.
   - If **`jd_intel_blob`** is omitted but **`extract_jd_intel_output=`** is supplied as a JSON **string**, it is parsed and used for the same placeholders (composer-only convenience).
2. **`string.Template`** — Remaining **`$name`** placeholders (`$original_resume`, `$jd_intel`, `$content_rules`, `$output_template`, …). A literal dollar sign in prose must be **`$$`**.

Step modules **`tailor_resume_full`**, **`tailor_resume_lite`**, **`critique_resume`**, and **`rewrite_resume`** take **`jd_intel_blob: dict`** at **`build_messages`** time. Resume tailoring and rewrite shipped **`user.txt`** files use **`$output_template`** for section-header output.

Other common tailoring-related names: **`$tailor_resume_full_output`**, **`$critique_resume_output`**, **`$original_resume`**, **`$response_contract`**, **`$jd_intel`**, **`$content_rules`**, and **`$output_template`**. Auxiliary writing prompts use **`$tailored_resume`** and **`$resume_profile`**. There is no **`$output_language`** placeholder.

**Runtime injection points:** tailoring and critique/rewrite receive the JD blob (as above) plus resume/contract/diff rules as applicable; cover letter and application-question prompts receive **`$tailored_resume`** and **`$resume_profile`**.

**Stored `job_keywords`:** New rows store a JSON-compatible wrapper: `{"format":"section_header_v1","raw":"...","metadata":{...},"intel":"..."}`. Legacy JSON blobs remain supported. JD extraction LLM rows use **`operation`** = **`extract_jd_intel_output`** (constant **`LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT`** in **`app/prompts/_constants.py`**); older traces may still show **`job_extract_keywords`**.

**Master resume for catalog preview:** `GET /api/v1/config/prompts/catalog/master-resume-preview` serializes the same `original_resume` string tailoring would use for the **active** resume if one is set; otherwise the **first resume in list order with no `parent_id`**; otherwise the **first resume** returned by `list_resumes`. Payload is capped at **256 KiB** with a `truncated` flag.

**Response contract for catalog preview:** `GET /api/v1/config/prompts/catalog/response-contract-preview` still returns the compact JSON preview for compatibility. Runtime primary tailoring uses `build_response_contract(...).to_section_template()` as `$output_template`.

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
