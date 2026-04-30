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

## Overrides

- **Per-step prose:** `app/prompt_overrides/{step}.system.txt` (or legacy `{step}.instructions.txt`), `{step}.rules.txt` (diff block override for tailoring steps when used)
- **Composer:** `app/prompt_overrides/{step}.composer.json`
- **Shared diff:** `app/prompt_overrides/_rules.resume_diff.txt`

Composer and file overrides **replace** shipped text at runtime; they do not live in this directory.

## Template placeholders

User templates use **`string.Template`** with `$name` placeholders. A literal dollar sign in prose must be written as **`$$`**.

Common tailoring-related names (LLM outputs use the **`step_name_output`** style): **`$extract_jd_intel_output`**, **`$tailor_resume_full_output`**, **`$critique_resume_output`**, plus **`$resume_evidence`** (deterministic support/adjacency/gap map), **`$original_resume`**, **`$response_contract`**, and **`$resume_diff_rules`** (shared output-schema text). Auxiliary writing prompts use **`$tailored_resume_context`** for the rehydrated resume's JD-specific summary, top bullets, projects, education, selected skills, and style note. There is no **`$output_language`** placeholder; English-only wording is fixed in prompt text.

**Runtime injection points:** full tailoring receives `$extract_jd_intel_output`, `$resume_evidence`, `$original_resume`, `$response_contract`, and `$resume_diff_rules`; rewrite receives the original resume, rehydrated first-pass draft, critique JSON, JD intelligence, response contract, and diff rules; cover letter and application-question prompts receive `$tailored_resume_context` alongside the stable `$resume_profile`.

**Master resume for catalog preview:** `GET /api/v1/config/prompts/catalog/master-resume-preview` serializes the same `original_resume` string tailoring would use for the **active** resume if one is set; otherwise the **first resume in list order with no `parent_id`**; otherwise the **first resume** returned by `list_resumes`. Payload is capped at **256 KiB** with a `truncated` flag.

**Response contract for catalog preview:** `GET /api/v1/config/prompts/catalog/response-contract-preview` returns the same compact JSON as `$response_contract` for **full** and **lite** (`build_response_contract` → `to_prompt_dict`), using the same master resume row as above. Each mode string is capped at **256 KiB** with its own `truncated` flag.

Encoding: **UTF-8**. Files are normalized to Unix newlines on load.

## Agent index

See also `docs/agent/llm-prompt-inventory.md` at the **repository root** for the full pipeline map.

## Prompt Catalog (Settings UI)

In the app: **Settings** → **LLM Prompt Catalog** (`/settings/prompt-catalog`).

| Area | What it is |
|------|------------|
| **On this page** (sidebar on large screens, “Jump to” on small screens) | Quick links: pipeline overview → each **shared rules** card → each **pipeline step** card. |
| **Pipeline** | Read-only diagram of Full vs Lite step order. |
| **Shared resume-diff rules** | Editable shared rules + expandable **shipped default** (full height on the page, not a tiny scroll box). |
| **Pipeline steps** | Per step: paths to shipped `.txt` files, model override, **Prompt composer** (expand the section). Inside composer: **System** and **User** tabs so each message uses the full width; text areas **grow with content** (scroll the window to read long prompts). **Shipped defaults** is a separate expandable reference block. |

Shipped files live under this `text/` directory; composer and `prompt_overrides/` still override at runtime (unchanged).
