# Enrichment

> "Enrichment" now covers two AI-assisted editing flows: question-based enhancement and targeted regeneration.

## 1. Question-Based Enhancement Flow

This is the older wizard surfaced from the resume detail page.

Frontend:

- `apps/frontend/components/enrichment/enrichment-modal.tsx`
- `apps/frontend/hooks/use-enrichment-wizard.ts`

Backend endpoints:

- `POST /api/v1/enrichment/analyze/{resume_id}`
- `POST /api/v1/enrichment/enhance`
- `POST /api/v1/enrichment/apply/{resume_id}`

Behavior:

1. analyze the resume for weak experience/project descriptions
2. ask targeted follow-up questions
3. generate additional bullets from the answers
4. append those bullets to the existing description instead of replacing it

Prompt/operation mapping:

- `ANALYZE_RESUME_PROMPT` -> `enrichment_analyze_resume`
- legacy re-analysis path uses `ANALYZE_RESUME_PROMPT` -> `enrichment_reanalyze_resume`
- `ENHANCE_DESCRIPTION_PROMPT` -> `enrichment_generate_description`

Important implementation detail:

- if answers already include valid `item_id` values, the backend skips the expensive re-analysis call and derives item context directly from `processed_data`

## 2. Builder Regenerate Flow

This is the newer targeted rewrite flow exposed from the builder via the sparkles action.

Frontend:

- `apps/frontend/components/builder/regenerate-wizard.tsx`
- `apps/frontend/hooks/use-regenerate-wizard.ts`
- `apps/frontend/lib/api/enrichment.ts`

Backend endpoints:

- `POST /api/v1/enrichment/regenerate`
- `POST /api/v1/enrichment/apply-regenerated/{resume_id}`

Supported item types:

- `experience`
- `project`
- `additionalGroup`

Behavior:

1. user selects specific items
2. user supplies freeform rewrite instructions
3. backend regenerates selected items in parallel with `asyncio.gather`
4. user reviews diff summaries
5. apply step replaces the chosen content

Prompt/operation mapping:

- `REGENERATE_ITEM_PROMPT` -> `enrichment_regenerate_item`
- `REGENERATE_ADDITIONAL_GROUP_PROMPT` -> `enrichment_regenerate_additional_group`

## Apply Semantics

Question-based enhancement:

- additive
- only appends bullets to experience/project descriptions

Regenerate:

- replacement
- all-or-nothing apply to avoid partially corrupting resume state

`apply-regenerated` uses several guards before it writes:

- item id parsing
- title/subtitle matching
- original-content matching
- fallback metadata disambiguation when indices drift

If the current resume no longer matches the reviewed payload, the endpoint returns `409` and asks the user to regenerate again.

## Key Backend File

- `apps/backend/app/routers/enrichment.py`

## Prompt Inventory

Prompt definitions live in:

- `apps/backend/app/prompts/enrichment.py`

This file is part of the upcoming prompt-refactor surface and should stay aligned with `docs/agent/llm-prompt-inventory.md`.

## Current Observability Gap

Individual enrichment calls are persisted through normal LLM tracing, but the enrichment routes do not currently wrap the workflow in a higher-level `llm_trace_scope()` request scope the way tailoring does.

If you work on enrichment tracing, that is a real gap to close rather than a docs bug.

## Agent Notes

- If item ids or resume section shapes change, update enrichment matching, regenerate payload builders, and backend apply logic together.
- Additional-group regeneration depends on the canonical `additional.groups` schema.
- Changes here usually need test updates in both integration and unit coverage because apply safety is strict by design.
