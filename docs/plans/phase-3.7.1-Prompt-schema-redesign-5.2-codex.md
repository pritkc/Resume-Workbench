# Phase 3.7.1 - Prompt Schema Redesign (5.2, Codex)

**Date:** 2026-04-15 (America/Los_Angeles)  
**Status:** Design plan (no big-bang rewrite)  
**Scope:** Main resume-generation/tailoring prompts only (enrichment is out of scope for this phase).

## 1) Goals and assumptions

### Goals
- Make prompt behavior easier to understand, edit, and extend without hunting across unrelated files.
- Preserve current stable JSON behavior and response shape guarantees.
- Split prompt content into:
  - safe-to-experiment content (tone, examples, writing quality instructions)
  - protected calibrated content (output contract, hard constraints, strict JSON rules)
- Support optional intermediate steps (reflection/critic/finalization) without rewriting the whole system.
- Support per-step model routing, with `cliproxyapi` as first-class path.
- Reduce tailoring modes to two with clear isolated instructions.

### Explicit assumptions
- We keep existing stack (FastAPI, Pydantic, LiteLLM router, current config storage). No new framework/dependency.
- We keep existing local post-processing and validation (`response_contract`, preservation, diff, verification).
- We keep prompt text in repo as source of truth; UI editing is an additional layer, not a replacement.
- We preserve current operation IDs where possible to avoid observability/reporting churn.

## 2) Current structure: issues and stable strengths

### Current issues
1. Fragmentation of prompt responsibility
- Prompt text, prompt selection, runtime assembly, and system handling are spread across `templates.py`, tailoring services, and config/router surfaces.
- It is hard to know which parts are safe to edit vs risky to touch.

2. Calibrated and experimental text are mixed
- Output contract rules, mode behavior, style guidance, and examples sit together in long strings.
- Small wording experiments can accidentally alter strict behavior.

3. Mode behavior is under-isolated
- Current modes mostly share one template/system set and vary mainly by mode constraint text.
- Behavioral drift is hard to control.

4. Pipeline extensibility is implicit
- Current flow is effectively fixed around one main tailoring generation step.
- Inserting critique/reflection/finalization steps requires ad-hoc orchestration changes.

5. Model routing is global-first, not step-first
- Runtime model config is largely one active config; per-step routing is not a first-class prompt pipeline concept.

### Good/stable points to keep
1. Strong JSON safety envelope already exists
- `complete_json()` retry behavior, extraction safeguards, and strict parsing are solid.
- Local reconstruction/preservation is a key stability layer.

2. Response contract is an important safeguard
- `build_response_contract()` and contract injection materially reduce shape breakage.

3. Prompt catalog policy model already exists
- `system`, `runtime_injected`, `user_choice`, `user_editable_future` is a good foundation for editable vs protected boundaries.

4. Traceability foundation is present
- LLM metadata and operation logging already capture useful context.

## 3) Design principles

1. Contract-first safety
- Output shape and hard constraints are treated as protected assets.
- Experimental text can evolve without changing protected contract blocks.

2. Explicit boundaries
- Every prompt block declares policy: `locked`, `editable`, `runtime`, or `mode`.
- Only `editable` blocks are candidate UI edits.

3. Layered composition
- A step prompt is assembled from named blocks, not a single monolith string.
- Blocks are reusable across steps and modes.

4. Default simple path
- Baseline pipeline remains one major generation step plus existing local cleanup.
- Optional steps are additive and behind toggles.

5. Step-local model routing
- Each step can declare preferred model route/profile.
- Fallback behavior is predictable and centralized.

6. Migration without downtime
- Introduce schema/registry first with behavior parity.
- Enable new pieces incrementally, with quick rollback to current flow.

## 4) Proposed conceptual architecture

## 4.1 Prompt asset model (lightweight)

Introduce a small in-repo prompt schema (Python dataclasses/dicts; no new dependency):

```python
PromptBlock:
  id: str
  policy: "locked" | "editable" | "runtime" | "mode"
  version: str
  text: str
  checksum: str

PromptStepSpec:
  id: str
  operation: str
  system_blocks: list[str]
  user_blocks: list[str]
  runtime_slots: list[str]
  output_contract_block: str | None
  model_profile: str

PipelineProfile:
  id: str
  steps: list[str]   # ordered step ids
  mode_map: dict[str, str]  # API mode -> mode block id
```

Notes:
- `checksum` is computed in CI/tests for `locked` blocks to detect accidental edits.
- Existing `PROMPT_VERSIONS` remains, but versioning moves to per-block/per-step semantics.

## 4.2 Block categories

1. Locked calibrated blocks (repo-only)
- JSON/output contract instructions
- forbidden fields / strict key rules
- non-negotiable safety constraints tied to post-processing

2. Editable quality blocks
- tone/voice phrasing
- rewrite examples
- style guidance that does not alter JSON contract

3. Mode blocks (two isolated instruction sets)
- `light_touch`
- `full_rewrite` (default)

4. Runtime blocks
- `{job_intelligence}`
- `{master_resume}`
- `{response_contract}`
- `{output_language}`

## 4.3 Data flow (input to final output)

```mermaid
flowchart LR
  A[User input + resume + JD] --> B[JD intelligence step]
  B --> C[Prompt composer by step spec]
  C --> D[Main tailoring generation]
  D --> E[Optional critique/reflect steps]
  E --> F[Final synthesis step (locked contract)]
  F --> G[Existing local preservation + verification + diff]
  G --> H[Final resume JSON]
```

Important: in baseline rollout, `E` is disabled and `F` is the existing generation step behavior to keep parity.

## 5) Modes redesign (reduce to two)

### New modes
- `full_rewrite` (default): strong alignment and rewriting within truthful scope.
- `light_touch`: conservative edits, minimal rewrite footprint.

### Backward compatibility
- Accept legacy `nudge|keywords|full` from API/UI for transition window.
- Map legacy values:
  - `nudge` -> `light_touch`
  - `keywords` -> `light_touch` (or temporary alias configurable; default to `light_touch`)
  - `full` -> `full_rewrite`
- Persist and return only new mode IDs after migration phase completes.

### Why this helps
- Removes ambiguous middle behavior.
- Encourages clear expectations and easier testing.
- Makes prompt content fully isolated per mode rather than tiny snippets around shared copy.

## 6) Extension points (add/remove/reorder safely)

## 6.1 Step adapters

A step adapter is a small implementation unit with:
- `build_inputs(context) -> dict`
- `run_llm(step_spec, model_profile, payload)`
- `validate_output(schema_name)`
- `merge_into_context(context, output)`

Initial adapters:
- `jd_intelligence_adapter` (existing behavior)
- `tailoring_generation_adapter` (existing compact JSON output)
- `critique_adapter` (optional, non-final)
- `finalize_adapter` (locked final contract output)

## 6.2 Reordering rules

- Only steps marked `optional=true` can be inserted/removed without code changes.
- Pipeline profile controls order; default profile remains current behavior.
- Final step that emits resume JSON must always include locked contract block.

## 6.3 Guardrails for extension safety

- Schema validation on every step output.
- Contract check before final resume leaves LLM stage.
- Operation metadata includes `pipeline_profile`, `step_id`, `block_versions`.

## 7) Model routing plan (per-step)

## 7.1 Proposed model profile map

Define model profiles in config (repo defaults + runtime overrides):
- `jd_extract_fast`
- `tailor_primary`
- `critique_optional`
- `finalize_strict`

Each profile resolves to:
- route: `cliproxyapi` or `direct_api`
- model alias/name
- temperature / max tokens / retry hints

## 7.2 Routing policy

1. Prefer `cliproxyapi` for all steps when configured.
2. Allow per-step override to direct API only when explicitly set.
3. If step profile unavailable, fallback to `tailor_primary`.
4. Log resolved route/model per step in metadata.

## 7.3 Scope control (what to defer)

Implement now:
- per-step profile selection in orchestrator
- profile->route resolution using existing `LLMConfig` shape

Defer (if scope grows):
- UI for editing every step profile
- dynamic auto-routing by latency/cost
- multi-model voting/ensemble flows

## 8) UX and operational implications

## 8.1 Editable vs protected surfaces

UI-editable (safe-to-experiment):
- mode-specific content wording (`light_touch` / `full_rewrite`)
- style/examples blocks

Repo-only protected:
- locked contract blocks
- strict output keys/shape instructions
- runtime slot definitions
- step ordering defaults

## 8.2 Catalog readability improvements

- Prompt catalog groups by pipeline step first, then block policy.
- Every block shows: `id`, `policy`, `version`, `last_changed`.
- Add “why locked” note for protected blocks to prevent accidental edits.

## 8.3 Human workflow simplification

- Single place to find main tailoring pipeline prompt assets.
- Clear edit path: “change wording” vs “change contract.”
- Faster experiments with lower risk of JSON breakage.

## 9) Versioning and safeguards

1. Dual version tracks
- `content_version` for editable blocks.
- `contract_version` for locked blocks/step specs.

2. Checksum guard
- CI/test computes checksum for locked blocks.
- Any locked-block text change requires explicit contract version bump.

3. Golden tests
- Snapshot tests for final assembled prompts for both modes.
- Contract compliance tests against representative resumes/JDs.

4. Runtime metadata
- Persist `pipeline_profile`, `step_id`, `mode_id`, `contract_version`, `content_version` in LLM call metadata.

## 10) Migration plan (incremental, no big-bang)

## Phase A - Structure only (no behavior change)
- Extract current tailoring prompt pieces into block registry.
- Compose prompts from blocks but keep final assembled text equivalent.
- Add tests proving byte-level or semantically equivalent assembly.

Exit criteria:
- same output contract behavior
- same preview/confirm flows

## Phase B - Two-mode transition
- Introduce `light_touch` and `full_rewrite` blocks.
- Add legacy mode mapping and API compatibility.
- Update UI dropdown labels/options.

Exit criteria:
- both modes stable
- no JSON contract regressions in regression suite

## Phase C - Optional step scaffolding
- Add pipeline profile and adapter interfaces.
- Keep optional steps disabled by default.

Exit criteria:
- current baseline profile remains default
- no performance regression on baseline

## Phase D - Optional critique pilot
- Enable one optional `critique_adapter` behind feature flag.
- Feed critique notes into final step only; final output still contract-locked.

Exit criteria:
- measurable quality gain in manual eval
- no increase in JSON break/fallback rate beyond threshold

## Rollback strategy
- One config switch returns to baseline single-step profile.
- Locked blocks and current orchestration path remain available during full migration.

## 11) Risks and mitigations

1. Risk: Added complexity from pipeline abstractions
- Mitigation: keep default profile minimal; adapters are small and typed.

2. Risk: Hidden behavior drift during block extraction
- Mitigation: parity snapshots and regression fixtures before enabling new modes.

3. Risk: UI edits accidentally touching strict behavior
- Mitigation: policy-gated editing and locked checksum enforcement.

4. Risk: Per-step model mismatch increases failures
- Mitigation: fallback profile + route logging + staged rollout.

5. Risk: Legacy clients still sending old mode IDs
- Mitigation: compatibility mapping with deprecation window and telemetry.

## 12) Concrete deliverables for this phase

1. Prompt schema/registry for tailoring pipeline blocks and step specs.
2. Two-mode isolated prompt content (`light_touch`, `full_rewrite`) with default selection.
3. Locked vs editable policy enforcement (catalog + tests/checksums).
4. Pipeline profile scaffold with per-step model profile resolution (cliproxy-first).
5. Migration toggles and compatibility mapping for legacy mode IDs.
6. Updated docs:
- `docs/prompts/llm-prompt-composition.md` (new layering model)
- prompt catalog docs (policy/ownership rules)

## 13) Non-goals for Phase 3.7.1

- Enrichment prompt redesign.
- New external prompt management service.
- Full UI authoring studio for all prompt blocks.
- Automated multi-model ensemble or judge system as default runtime.
