# LLM Prompt Inventory

> Current prompt surfaces and the safest refactor seams for the next prompt pass.

The monolithic `app/prompts/templates.py` from older upstream revisions **has been removed**. Prompt text and constants live in **focused modules** under `apps/backend/app/prompts/`. Re-exports and the override mechanism are in `apps/backend/app/prompts/__init__.py`.

## Runtime-Configurable Prompt IDs (tailoring)

Tailoring exposes **`full`** and **`lite`** modes (see `IMPROVE_PROMPT_OPTIONS` in `apps/backend/app/prompts/_constants.py`). Strategy text is folded via **`TAILORING_MODE_STRATEGY`** in `apps/backend/app/prompts/tailoring_blocks.py`.

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
| `_prompt_loader.py` | Loading / composition helpers |
| `parse_resume.py` | `PARSE_RESUME_PROMPT` — resume upload parsing |
| `extract_jd_intel.py` | JD keyword / intelligence extraction (`EXTRACT_*`) |
| `tailoring_blocks.py` | Tailoring system/user shells, `IMPROVE_RESUME_PROMPT`, `TAILORING_MODE_STRATEGY`, contracts |
| `tailor_resume_full.py` / `tailor_resume_lite.py` | Step modules for tailoring operations |
| `tailoring_catalog.py` | Catalog metadata for tailoring |
| `cover_letter.py` | Cover letter + outreach system prompts |
| `answer_questions.py` | Application-question prompts |
| `enrichment.py` | Enrichment / regenerate prompts |
| `refinement.py` | Older refinement helpers; not the active tailoring path |
| `critique_resume.py`, `rewrite_resume.py` | Critique / rewrite flows |
| `_rules/*.py` | Shared rules blocks (JD intel, resume diff, critique) |

### Representative constants → call sites

| Area | Constants / entry | Used by | LLM operation (typical) |
|------|---------------------|---------|-------------------------|
| Parse | `PARSE_RESUME_PROMPT` | `services/parser.py` | `resume_parse_json` |
| JD | `EXTRACT_KEYWORDS_PROMPT`, JD intelligence blocks | `services/tailoring/analysis.py` | keyword / intel extraction |
| Tailor | `IMPROVE_RESUME_PROMPT`, tailoring blocks | `services/tailoring/prompting.py` | `resume_generate_full` |
| Cover / outreach | `COVER_LETTER_SYSTEM_PROMPT`, etc. | `services/cover_letter.py` | `cover_letter_generate`, `outreach_generate` |
| Enrichment | prompts in `enrichment.py` | `routers/enrichment.py` | enrichment operations |
| Refinement | `KEYWORD_INJECTION_PROMPT` (legacy) | `services/refiner.py` | experiments only |

## Tailoring Call Sequence

### Application-pack preview / direct improve

1. Keyword / JD intelligence extraction as needed
2. `resume_generate_full` with compact tailoring payload + response contract (`personalInfo` / `sectionMeta` excluded from LLM contract)
3. Local post-processing: preserve fields, rebuild `sectionMeta`, verification, diff
4. Optional auxiliary generation: title, cover letter, outreach with compact profiles

## Config Surfaces

`/api/v1/config/prompts` — default tailor `prompt_id` and Settings selector.

`/api/v1/config/generation-defaults` — last-used tailor options and cover/outreach flags.

## What Is Not Configurable Yet

Many non-tailoring prompts (parse, enrichment, cover, outreach) are code-defined; versioning is tracked in `PROMPT_VERSIONS` where applicable.

## Refactor Seams

Same as before: centralize prompt selection, explicit prompt descriptors, and richer `metadata` on `llm_calls`.

## Observability

Persisted rows use the `llm_calls` SQL table (`LLMCall` in `app/db/models.py`), surfaced at `/llm-traces` on the frontend.
