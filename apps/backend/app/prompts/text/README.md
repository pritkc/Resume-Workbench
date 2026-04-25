# Shipped LLM prompts (`text/`)

**Source of truth** for pipeline prompt bodies used by `VALID_STEPS` and shared fragments. Edit **`.txt`** files here; Python modules under `app/prompts/` load them via `_text_prompts.read_shipped_txt`.

## Layout

| Path | Purpose |
|------|---------|
| `fragments/` | Shared blocks: resume diff JSON contract, JD intel contract/craft, critique schema, tailoring craft/modes, separate full/lite user shells |
| `{step_id}/` | Per-step `system.txt` / `user.txt` where the full message is not only composed fragments (e.g. `parse_resume/`, `critique_resume/instructions.txt`) |
| `index.yaml` | Machine-readable list of step ids and enrichment asset names |
| `enrichment/` | Resume enrichment prompts (`app/routers/enrichment.py`). **User** templates use Python **`str.format`** with `{field}` placeholders; JSON examples in those files use `{{` / `}}` so braces survive `.format()`. |

## Overrides (unchanged)

- **Per-step:** `app/prompt_overrides/{step}.instructions.txt`, `{step}.rules.txt`, `{step}.composer.json`
- **Shared rules:** `app/prompt_overrides/_rules.resume_diff.txt`, `_rules.jd_intel.txt`, `_rules.critique.txt`

Composer and file overrides **replace** shipped text at runtime; they do not live in this directory.

## Template placeholders

User templates use **`string.Template`** with `$name` placeholders. A literal dollar sign in prose must be written as **`$$`**.

Common tailoring-related names (LLM outputs use the **`step_name_output`** style): **`$extract_jd_intel_output`**, **`$tailor_resume_full_output`**, **`$critique_resume_output`**, plus **`$original_resume`** and **`$response_contract`**. There is no **`$output_language`** placeholder; English-only wording is fixed in prompt text.

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
