# Phase 3.15.5 Token Budget Calibration

## Purpose

Use the captured test run at `docs/plans/test_runs/0a7bf7b4-18c6-4559-a916-bd183957d962` as the first empirical calibration point for prompt input size, model output size, and runtime `max_tokens` budgets.

This is a planning report only. It lists the changes I would implement after approval.

## Source Data

Captured files:

| Operation folder | Prompt | Response |
|---|---:|---:|
| `extract_jd_intel_output` | `prompt.txt` | `respose.txt` |
| `resume_generate_full` | `prompt.txt` | `respose.txt` |
| `CL` | `prompt.txt` | `respose.txt` |

Notes:

- The response filename is spelled `respose.txt` in the test run. I used it as-is.
- Token estimates below use the same rough estimator as `app/llm.py`: `ceil(characters / 4)`.
- Provider-reported token usage may differ from this estimate, but this keeps the report aligned with our current trace fallback.
- Data-quality caveat: the `extract_jd_intel_output/prompt.txt` appears to contain a Neighbor Data Engineer JD, while `extract_jd_intel_output/respose.txt`, `resume_generate_full`, and `CL` are Starbucks QA-oriented. I would not use this folder to judge semantic correctness across steps. It is still useful for size and budget calibration.

## Raw Size Measurements

| Operation | Prompt bytes | Prompt est. tokens | Response bytes | Response est. tokens | Current output cap |
|---|---:|---:|---:|---:|---:|
| `extract_jd_intel_output` | 8,475 | 2,119 | 3,916 | 979 | 4,096 |
| `resume_generate_full` | 23,444 | 5,861 | 11,235 | 2,809 | 15,000 |
| `cover_letter_outreach_generate` (`CL`) | 19,798 | 4,950 | 1,294 | 324 | 2,600, retry 3,200 |

JSON response compacting estimate:

| Operation | Captured response bytes | Minified JSON bytes | Minified est. tokens | Avoidable formatting overhead |
|---|---:|---:|---:|---:|
| `extract_jd_intel_output` | 3,916 | 3,328 | 832 | 588 bytes |
| `resume_generate_full` | 11,235 | 9,061 | 2,266 | 2,170 bytes |

The model still returned fenced, pretty-printed JSON for both JSON operations. Our parser can recover from that, but the model spent extra output tokens even though the prompt requested minified JSON and no fences.

## Input Composition Findings

### `resume_generate_full`

Prompt composition from the captured file:

| Prompt section | Bytes | Est. tokens | Share of prompt |
|---|---:|---:|---:|
| System and run-specific instructions before JD blob | about 2,161 | about 541 | about 9% |
| `EXTRACTED JD INTELLIGENCE` | 5,085 | 1,272 | about 22% |
| `ORIGINAL RESUME` | 6,102 | 1,526 | about 26% |
| `RESPONSE CONTRACT` | 341 | 86 | about 1% |
| `OUTPUT SCHEMA` / shared rules | 9,747 | 2,437 | about 42% |
| Total | 23,436 | 5,859 | 100% |

Takeaways:

- The primary tailoring prompt is not close to modern context limits in this sample.
- The shared schema/rules block is the largest single input component.
- The output cap is much larger than the observed output. The captured response used only about 19% of the 15,000-token cap, or about 15% after minifying.
- Because full mode requires a complete TailoredCell grid, output still scales with number of experience entries, project entries, bullet counts, and skill values. We should reduce the default cap carefully, preferably with an adaptive cap instead of a fixed hard cut.

### `cover_letter_outreach_generate`

Prompt composition from the captured file:

| Prompt section | Bytes | Est. tokens | Share of prompt |
|---|---:|---:|---:|
| System/user instructions outside sections | about 1,482 | about 371 | about 7% |
| `JOB TARGET` | 115 | 29 | under 1% |
| `JOB DESCRIPTION` | 2,233 | 559 | about 11% |
| `CANDIDATE PROFILE` | 1,367 | 342 | about 7% |
| `TAILORED RESUME` | 11,622 | 2,906 | about 59% |
| Cover/outreach rules | 2,955 | 739 | about 15% |
| Total | 19,774 | 4,944 | 100% |

Takeaways:

- The auxiliary prompt is the most obvious input-budget problem.
- It currently includes both a compact `CANDIDATE PROFILE` and a large `TAILORED RESUME`.
- The `TAILORED RESUME` block alone is roughly 59% of the prompt and includes duplicated `description`/`highlights`, `sectionMeta`, and personal contact fields.
- This contradicts the intended architecture of "compact candidate-profile payloads" for auxiliary text generation.
- The output is tiny relative to its budget: about 324 estimated tokens against a 2,600-token cap. The requested content is only a 150-word cover letter plus a 60-word outreach message.

### `extract_jd_intel_output`

Takeaways:

- The output cap of 4,096 is conservative but reasonable for now.
- The captured response used about 24% of the cap, or about 20% after minifying.
- Because JD lengths and company detail vary widely, I would not lower this cap from one mixed test run. I would keep it at 4,096 until we have at least 10 representative traces.

## Recommended Runtime Changes

### P0 - Fix auxiliary input shape

Files likely touched:

- `apps/backend/app/services/cover_letter.py`
- `apps/backend/app/services/message_profiles.py`
- `apps/backend/app/prompts/text/cover_letter/user.txt`
- `docs/agent/llm-call-model-selection-brief.md`
- `docs/agent/llm-prompt-inventory.md`
- `docs/agent/architecture/backend-guide.md`

Change:

- Stop passing the full normalized tailored resume JSON to the cover/outreach prompt.
- Replace `TAILORED RESUME` with a bounded evidence payload, for example `RESUME EVIDENCE`.
- Keep the existing compact `CANDIDATE PROFILE`, but enrich it slightly if needed:
  - top 2-3 tailored work entries
  - top 1-2 project entries
  - max 2 highlights per selected entry
  - tech stack per selected entry capped to a short string
  - selected role/company/location/title metadata
  - no `personalInfo` contact details
  - no `sectionMeta`
  - no duplicated `description` plus `highlights`

Target budget:

- Current CL prompt: about 4,950 estimated input tokens.
- Target CL prompt after change: about 2,000-2,800 estimated input tokens.
- Keep JD slice at 2,200 chars for now.
- Keep evidence payload capped at about 4,000-5,000 chars.

Why:

- This is the largest clear waste in the run.
- It lowers cost and latency.
- It reduces accidental leakage of contact details into an unnecessary prompt.
- It makes docs and implementation match the intended "compact auxiliary payload" architecture.

### P1 - Lower auxiliary output cap

Files likely touched:

- `apps/backend/app/services/cover_letter.py`
- tests for cover/outreach generation, if present

Current:

- `COMBINED_MESSAGE_MAX_TOKENS = 2600`
- `retry_max_tokens = 3200`
- Captured output estimate: about 324 tokens.

Proposed:

- Initial max: `1200`
- Retry max: `1800`
- Keep retries at `2`

Why:

- The requested output is bounded by prompt rules: 150-word cover letter plus 60-word outreach.
- 1,200 output tokens gives more than 3x observed output headroom.
- Retry still has enough space if a provider is verbose.

### P1 - Add adaptive tailoring output caps

Files likely touched:

- `apps/backend/app/services/tailoring/llm_calls.py`
- `apps/backend/app/services/tailoring/orchestration.py`
- possibly `apps/backend/app/services/tailoring/contracts.py`
- unit tests around prompt contracts / max token metadata

Current:

- `resume_generate_full`: fixed `max_tokens=15000`
- `rewrite_resume`: fixed `max_tokens=15000`
- Captured `resume_generate_full` response estimate: about 2,809 tokens, about 2,266 if minified.

Proposed:

- Use an adaptive cap from the response contract, with conservative floors and ceilings.
- Suggested first version:
  - lite: floor 4,096, normal ceiling 6,000
  - full: floor 6,000, normal ceiling 9,000
  - huge contracts: allow up to 15,000
  - rewrite: use same cap as primary full for the same contract
- Store the chosen cap and contract counts in LLM metadata:
  - experience entry count
  - experience bullet count
  - project entry count
  - project bullet count
  - skill group count
  - skill value count
  - computed output cap

Why:

- One fixed 15,000 cap inflates timeout calculations and makes near-limit warnings less meaningful.
- The sample output is far below 15,000.
- A contract-derived cap protects larger resumes without over-budgeting normal ones.

### P1 - Align LLM timeouts with outer workflow timeouts

Files likely touched:

- `apps/backend/app/llm.py`
- `apps/backend/app/services/tailoring/llm_calls.py`
- `apps/backend/app/services/tailoring/orchestration.py`

Current:

- `complete_json()` timeout scales from `max_tokens`.
- For `max_tokens=15000`, direct-provider JSON timeout is about 659 seconds.
- Tailor preview has an outer `asyncio.wait_for(..., timeout=240)`.

Proposed:

- Add an optional per-call timeout override to `complete_json()`.
- Use per-operation timeouts that fit inside the preview wall clock:
  - `extract_jd_intel_output`: 90-120 seconds
  - `resume_generate_full`: 170-200 seconds
  - `critique_resume`: 90 seconds
  - `rewrite_resume`: 170-200 seconds
- Keep outer preview at 240 seconds unless we decide product UX should tolerate longer waits.

Why:

- The inner timeout currently advertises more time than the route can actually give it.
- Lower/adaptive output caps help, but due the baseline scaling formula, `resume_generate_full` can still exceed the route budget unless we add call-level overrides.

### P2 - Tighten JSON response formatting instructions and telemetry

Files likely touched:

- `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`
- `apps/backend/app/prompts/text/extract_jd_intel/system.txt`
- `apps/backend/app/llm.py`

Change:

- Keep parser tolerance for fenced JSON.
- Add trace metadata for:
  - raw response chars
  - compacted JSON chars, when parseable
  - formatting overhead ratio
  - response had code fence: true/false
- Optional prompt wording update: "Pretty-printed JSON and fenced JSON waste budget. Return minified JSON only."

Why:

- The model ignored the no-fence/minified instruction in this run.
- We should measure before trying to tune prompt wording repeatedly.

### P2 - Update planning docs after code changes

Files likely touched:

- `docs/agent/llm-call-model-selection-brief.md`
- `docs/agent/llm-integration.md`
- `docs/agent/llm-prompt-inventory.md`
- `docs/agent/architecture/backend-guide.md`

Planned doc changes:

- Replace auxiliary "compact profile only" wording with the exact new evidence payload.
- Record new max token defaults.
- Add a small empirical baseline table seeded by this test run.
- Note that `extract_jd_intel_output` stays at 4,096 until more traces exist.

## Recommended Budget Table After Approval

| Operation | Current cap | Proposed cap | Rationale |
|---|---:|---:|---|
| `extract_jd_intel_output` | 4,096 | keep 4,096 for now | One mixed run is not enough to lower; output can grow with JD complexity. |
| `resume_generate_full` full mode | 15,000 | adaptive, usually 9,000 | Sample used about 2.8k estimated tokens pretty-printed; keep huge-resume escape hatch. |
| `resume_generate_full` lite mode | 15,000 | adaptive, usually 4,096-6,000 | Lite is partial diff-capable and should not need full-mode ceiling. |
| `rewrite_resume` | 15,000 | adaptive, usually same as full primary | Output shape is the same compact diff. |
| `critique_resume` | 4,096 | keep 4,096 until captured | No sample in this folder. |
| `cover_letter_outreach_generate` | 2,600, retry 3,200 | 1,200, retry 1,800 | Sample used about 324 estimated output tokens. |

## Acceptance Criteria For Implementation

1. Cover/outreach prompt no longer includes full normalized resume JSON.
2. Cover/outreach prompt metadata shows prompt input size near or below 2,800 estimated tokens for a resume like this test run.
3. Cover/outreach output still parses with wrapper tags and saves both fields.
4. `resume_generate_full` and `rewrite_resume` record computed output caps in trace metadata.
5. Tailoring still succeeds for this captured shape with full envelope output.
6. Existing JSON parsing remains tolerant of fenced/pretty JSON.
7. Docs reflect the new budgets and payloads after the implementation.

## What I Would Not Change Yet

- I would not lower `extract_jd_intel_output` from 4,096 based on this single mixed run.
- I would not reduce `critique_resume` until we capture a real critique response.
- I would not remove the shared tailoring schema/rules block yet. It is large, but it encodes safety and structure; output caps and auxiliary payload cleanup are better first moves.
- I would not increase the 240-second preview timeout until we have post-cap latency traces. The better first move is reducing prompt/cap waste.

## Open Questions For Approval

1. Should the auxiliary prompt be allowed to see any full resume data at all, or should it only see bounded evidence snippets?
2. Do you want normal full tailoring to target a 9,000 output cap, or a more conservative 10,000 cap for the first rollout?
3. Should we treat fenced JSON as a soft telemetry warning only, or should repeated fenced output trigger prompt retry with stricter budget wording?
4. Should token/cost budget summaries become part of the `/run-timing` or `/llm-traces` UI so future calibration does not require manual file inspection?
