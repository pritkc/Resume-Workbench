# LLM Prompt Inventory

> Current prompt surfaces and the safest refactor seams for the next prompt pass.

## Runtime-Configurable Prompt IDs

Only resume tailoring currently exposes prompt IDs:

| Prompt ID | Meaning | Source |
|-----------|---------|--------|
| `nudge` | minimal edits | `IMPROVE_STRATEGY_GUIDANCE["nudge"]` |
| `keywords` | keyword-forward tailoring | `IMPROVE_STRATEGY_GUIDANCE["keywords"]` |
| `full` | broader rewrite within truthfulness rules | `IMPROVE_STRATEGY_GUIDANCE["full"]` |

Selection precedence in `apps/backend/app/routers/resumes.py`:

1. request payload `prompt_id`
2. `generation_defaults.prompt_id`
3. `default_prompt_id`
4. `DEFAULT_IMPROVE_PROMPT_ID`

## Prompt Modules

### `apps/backend/app/prompts/templates.py`

| Prompt or constant | Used by | LLM operation |
|--------------------|---------|---------------|
| `PARSE_RESUME_PROMPT` | `services/parser.py` | `resume_parse_json` |
| `EXTRACT_KEYWORDS_PROMPT` | `services/improver.py` | `job_extract_keywords` (also extracts core title, company, location) |
| `IMPROVE_RESUME_PROMPT` | `services/improver.py` | `resume_generate_full` |
| `IMPROVE_STRATEGY_GUIDANCE` | `services/improver.py` | folded into `resume_generate_full` |
| `CRITICAL_TRUTHFULNESS_RULES` | `services/improver.py` | folded into `resume_generate_full` |
| `COVER_LETTER_PROMPT` | `services/cover_letter.py` | `cover_letter_generate` |
| `OUTREACH_MESSAGE_PROMPT` | `services/cover_letter.py` | `outreach_generate` |

### `apps/backend/app/prompts/enrichment.py`

| Prompt or constant | Used by | LLM operation |
|--------------------|---------|---------------|
| `ANALYZE_RESUME_PROMPT` | `routers/enrichment.py` | `enrichment_analyze_resume`, `enrichment_reanalyze_resume` |
| `ENHANCE_DESCRIPTION_PROMPT` | `routers/enrichment.py` | `enrichment_generate_description` |
| `REGENERATE_ITEM_PROMPT` | `routers/enrichment.py` | `enrichment_regenerate_item` |
| `REGENERATE_ADDITIONAL_GROUP_PROMPT` | `routers/enrichment.py` | `enrichment_regenerate_additional_group` |

### `apps/backend/app/prompts/refinement.py`

| Prompt or constant | Used by | LLM operation |
|--------------------|---------|---------------|
| `KEYWORD_INJECTION_PROMPT` | `services/refiner.py` | retained for experiments only, not used in the active tailoring path |
| `AI_PHRASE_BLACKLIST` | `services/refiner.py` | local-only, no LLM call |
| `AI_PHRASE_REPLACEMENTS` | `services/refiner.py` | local-only, no LLM call |

## Tailoring Call Sequence

### Application-pack preview / direct improve

1. `job_extract_keywords`
   - prompt: `EXTRACT_KEYWORDS_PROMPT`
2. `resume_generate_full`
   - prompt: `IMPROVE_RESUME_PROMPT`
   - strategy text injected from `IMPROVE_STRATEGY_GUIDANCE[prompt_id]`
   - prompt also receives compact `job_analysis`, supported JD keywords from the source resume, a trimmed JD excerpt, and a `resume_output_plan`
3. local post-processing:
   - preserve personal info, dates, additional items, and custom sections
   - remove unsupported additions and AI-style phrasing locally
   - compute local warnings with `verify_generated_resume_result(...)`
   - compute preview diffs locally with `calculate_resume_diff(...)`
4. auxiliary generation:
   - local title derivation from extracted job metadata
   - optional `cover_letter_generate`
   - optional `outreach_generate`

## Config Surfaces

`/api/v1/config/prompts`

- stores the global default tailor `prompt_id`
- drives the Settings page prompt selector

`/api/v1/config/generation-defaults`

- stores the last-used tailor `prompt_id`
- also stores `include_cover_letter` and `include_outreach_message`
- consumed by the Tailor page as the create-pack default state

## What Is Not Configurable Yet

- parse prompt
- keyword extraction prompt
- refinement prompt (inactive in the current tailoring path)
- cover-letter prompt
- outreach prompt
- enrichment and regenerate prompts
- health-check prompts in `app/llm.py`

## Important Runtime Metadata

Current prompt-related metadata is not centralized, but several calls already persist useful context:

- tailor calls attach `prompt_id` in `metadata`
- application-pack preview/confirm store `prompt_id` in `generation_runs`
- job preview state stores `preview_prompt_id`

## Refactor Seams

The safest next-step split is:

1. prompt definitions
   - move pure prompt text and option metadata behind a clearer module boundary
2. prompt selection
   - centralize `prompt_id` resolution so routers do not own precedence rules
3. prompt execution descriptors
   - define prompt name, operation name, output kind, and system prompt together
4. prompt observability
   - make prompt version/name explicit in `metadata`, not just `prompt_id`

## Current Pain Points To Fix Carefully

- system prompts are still inline in callers instead of living next to template strings
- prompt constants and operation names are spread across services and routers
- only tailoring has a first-class prompt registry
- prompt versioning is implicit, not explicit
- enrichment uses router-level LLM calls without top-level trace scopes
- `services/refiner.py` still contains an older keyword-injection prompt that is no longer part of the active tailoring runtime
