# LLM Prompt Inventory

> Current prompt surfaces and the safest refactor seams for the next prompt pass.

The monolithic `app/prompts/templates.py` from older upstream revisions **has been removed**. **Shipped prompt bodies** for pipeline steps live under **`apps/backend/app/prompts/text/`** as **`{step}/system.txt`** and **`{step}/user.txt`**, with the shared resume-diff JSON contract in **`text/output_file_schema_rules/resume_diff_output.txt`**. Thin Python modules under `apps/backend/app/prompts/` load them via `_text_prompts.read_shipped_txt` and still expose `build_messages`, `STEP_NAME`, `VARIABLES`, etc. Re-exports and the override mechanism are in `apps/backend/app/prompts/__init__.py`.

**Human / agent entrypoint:** `apps/backend/app/prompts/text/README.md` and `text/index.yaml` (step list must match `VALID_STEPS`).

## Runtime-Configurable Prompt IDs (tailoring)

Tailoring exposes **`full`** and **`lite`** modes (see `IMPROVE_PROMPT_OPTIONS` in `apps/backend/app/prompts/_constants.py`). Per-mode prose lives in **`text/tailor_resume_full/system.txt`** and **`text/tailor_resume_lite/system.txt`**; **`TAILORING_MODE_STRATEGY`** in `tailoring_blocks.py` exposes the mode slice after the `TAILORING MODE:` marker for catalog/UI.

Selection precedence in `apps/backend/app/routers/resumes.py`:

1. request payload `prompt_id`
2. `generation_defaults.prompt_id`
3. `default_prompt_id`
4. `DEFAULT_IMPROVE_PROMPT_ID` (`_constants.py`)

## Prompt modules (by file)

| Module | Role |
|--------|------|
| `_constants.py` | `IMPROVE_PROMPT_OPTIONS`, `DEFAULT_IMPROVE_PROMPT_ID`, `PROMPT_VERSIONS`, language names |
| `_schema.py` | Shared JSON schema fragments for prompts |
| `_text_prompts.py` | Load shipped UTF-8 `.txt` from `text/` (BOM strip, newline normalize) |
| `_prompt_loader.py` | Composer overrides; `render_user_template` (`string.Template` + optional JD blob dot-path expansion) |
| `parse_resume.py` | `PARSE_RESUME_PROMPT` — resume upload parsing |
| `extract_jd_intel.py` | JD intelligence extraction; output is arbitrary JSON cached as `job_keywords` |
| `tailoring_blocks.py` | Tailoring system/user shells, `IMPROVE_RESUME_PROMPT`, `TAILORING_MODE_STRATEGY`, contracts |
| `tailor_resume_full.py` / `tailor_resume_lite.py` | Step modules for tailoring operations |
| `tailoring_catalog.py` | Catalog metadata for tailoring |
| `cover_letter.py` | Cover letter + outreach system prompts |
| `answer_questions.py` | Application-question prompts |
| `enrichment.py` | Loads enrichment / regenerate user + system strings from `text/enrichment/{op}/system.txt` and `user.txt`; callers use `str.format` on user templates |
| `refinement.py` | Older refinement helpers; not the active tailoring path |
| `critique_resume.py`, `rewrite_resume.py` | Optional full-mode critique/rewrite pass, gated by `/config/critique` |
| `_rules/resume_diff.py` | Shared resume-diff JSON rules; shipped body under `text/output_file_schema_rules/resume_diff_output.txt` |
| `text/` | **Shipped** prompt `.txt` files (see `text/README.md`) |

### Representative constants → call sites

| Area | Constants / entry | Used by | LLM operation (typical) |
|------|---------------------|---------|-------------------------|
| Parse | `PARSE_RESUME_PROMPT` | `services/parser.py` | `resume_parse_json` |
| JD | `extract_jd_intel` prompts, `jd_intel_blob` helpers | `services/tailoring/analysis.py`, `services/tailoring/jd_intel_blob.py` | `extract_jd_intel_output` (`LLM_OPERATION_EXTRACT_JD_INTEL_OUTPUT`) |
| Tailor | `IMPROVE_RESUME_PROMPT`, tailoring blocks | `services/tailoring/prompting.py` | `resume_generate_full` |
| Critique / rewrite | `critique_resume`, `rewrite_resume` prompts | `services/tailoring/orchestration.py` | `critique_resume`, `rewrite_resume` |
| Cover + outreach (single call) | `COMBINED_MESSAGES_SYSTEM_PROMPT`, `COVER_LETTER_OUTREACH_PROMPT` | `services/cover_letter.py`, on-demand resume endpoints | `cover_letter_outreach_generate` |
| Enrichment | prompts in `enrichment.py` | `routers/enrichment.py` | enrichment operations |
| Refinement | `KEYWORD_INJECTION_PROMPT` (legacy) | `services/refiner.py` | experiments only |

## Tailoring Call Sequence

### Application-pack preview / direct improve

1. JD intelligence extraction when needed — LLM returns JSON stored as `job_keywords`; prompts inject it via **`$extract_jd_intel_output`** and optional **`.path.to.key`** (see `apps/backend/app/prompts/text/README.md`)
2. `resume_generate_full` with compact tailoring payload + response contract (`personalInfo` / `education` / `sectionMeta` excluded from LLM contract)
3. Compact-diff validation runs for observability only; validation errors are logged/attached to the trace but do not hard-fail P1 tailoring
4. In `full` mode, if `/api/v1/config/critique` is enabled, `critique_resume` reviews the first compact diff and `rewrite_resume` emits the second-pass compact diff
5. Local post-processing applies the compact diff to the original resume, preserves protected fields, rebuilds `sectionMeta`, verifies output, filters low-signal terms, and generates diff/change-manifest metadata
6. Title is derived locally from JD metadata; cover letter/outreach are generated later from the builder via explicit on-demand endpoints

## Config Surfaces

`/api/v1/config/prompts` — default tailor `prompt_id` and Settings selector.

`/api/v1/config/generation-defaults` — last-used tailor defaults (`prompt_id`, legacy cover/outreach flags). The current Tailor page sends cover/outreach flags as `false`; auxiliary documents are generated on demand after confirmation.

`/api/v1/config/critique` — toggles the optional full-mode `critique_resume` + `rewrite_resume` add-on; default is enabled when unset.

`/api/v1/config/model-overrides` — optional per-step model map. Supported step names include `parse_resume`, `extract_jd_intel`, `tailor_resume_full`, `tailor_resume_lite`, `critique_resume`, `rewrite_resume`, `cover_letter`, and `answer_questions`.

`/api/v1/config/prompts/catalog/master-resume-preview` — JSON body `{ "serialized_original_resume": string, "truncated": boolean }`: the same compact JSON (or markdown fallback) the tailoring user prompt uses for `$original_resume`, capped at **256 KiB** with `truncated: true` when cut. Resolution rule is implemented in `app/services/tailoring/master_resume_preview.py` (active resume, else first resume without `parent_id`, else first listed row).

## User-message placeholders (tailoring pipeline)

Shipped **user** templates use two mechanisms (see **`render_user_template`** in `app/prompts/_prompt_loader.py`):

- **JD blob expansion** — **`$extract_jd_intel_output`** supports optional dot segments, e.g. **`$extract_jd_intel_output.requirements.years_min`**, resolved from the cached **`job_keywords`** dict before `string.Template` runs.
- **`string.Template`** — Remaining **`$name`** slots after JD expansion.

Examples:

- **`$extract_jd_intel_output`** — whole JD JSON (shipped `user.txt` uses this root for the full blob or dot paths).
- **`$tailor_resume_full_output`** — tailored diff JSON fed into critique and rewrite after the full tailor step.
- **`$critique_resume_output`** — critique JSON for rewrite.
- **`$original_resume`** and **`$response_contract`** — built from the master resume and response contract.

**`output_language`** is not passed through templates or `build_messages`; English-only instructions live in shipped prose where needed.

## What Is Not Configurable Yet

Many non-tailoring prompts (parse, enrichment, cover, outreach) are code-defined; versioning is tracked in `PROMPT_VERSIONS` where applicable.

## Refactor Seams

Same as before: centralize prompt selection, explicit prompt descriptors, and richer `metadata` on `llm_calls`.

## Observability

Persisted rows use the `llm_calls` SQL table (`LLMCall` in `app/db/models.py`), surfaced at `/llm-traces` on the frontend.
