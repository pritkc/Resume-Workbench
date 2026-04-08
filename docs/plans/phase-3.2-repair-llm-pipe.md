# Phase 3.2 — Repair The LLM Tailoring Pipe

## Goal

Fix the refactored tailoring pipeline so meaningful LLM bullet rewrites actually survive validation, persistence, diffing, and render output.

This note is based on the failed live run:

- `resume_id`: `3ed603c4-82a1-43a9-a64d-4b22df2bd7b6`
- `job_id`: `1cf4e7d9-d4c6-4677-9c9e-544c6c13ade2`
- preview trace: `d372bb8d-1940-408e-86c2-853e9b8bee1d`
- preview generation run: `d8fafbec-ed17-4414-a439-4ad493cee65e`
- confirmed resume: `6579a2eb-70da-4753-b694-0f499a47b4b3`

## What We Observed

### 1. The LLM did return meaningful tailoring

The `llm_calls` record for `resume_generate_full` returned a new summary and materially rewritten bullets. Example from the live response:

- New summary opening with `3+ years in Software Engineering...`
- New Humana bullet: `Collaborated with cross-functional engineering and business stakeholders...`
- Added Humana bullet: `Participated in the full Software Development Lifecycle...`
- New GoFundMe bullets with stronger JD alignment

So this was **not primarily a weak-model-output problem**.

### 2. The stored tailored resume lost most of that output

The final stored/rendered resume kept the new summary, but the experience bullets were almost entirely the original bullets plus a few local word substitutions:

- `stakeholders` -> `team members`
- `utilized` -> `used`
- `Orchestrated` -> `coordinated`

The rendered markdown artifact confirms that the final PayPal resume is basically the original experience content with light cleanup, not the LLM’s returned rewrites.

### 3. Diff metadata looked “non-empty” but was misleading

The generation run recorded:

- `diff_summary.total_changes = 5`
- `diff_summary.descriptions_modified = 4`

That made the pipeline look healthy, but those changes were mostly from local cleanup, not from the LLM’s intended bullet rewrites.

## Root Cause

### Primary root cause: `description` gets overwritten by legacy `highlights`

The tailoring pipeline reuses the shared resume schema instead of a strict LLM-only schema:

- [`apps/backend/app/services/tailoring/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/models.py#L29) uses `Experience` and `Project` directly inside `TailoringResumePayload`
- [`apps/backend/app/services/tailoring/prompting.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/prompting.py#L84) sends `resume_payload.model_dump()` to the model
- [`apps/backend/app/services/tailoring/contracts.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/contracts.py#L109) marks only `description` as editable, while `highlights` remains part of the payload and becomes implicitly immutable

That becomes fatal in the shared `Experience` normalizer:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L336)

Specifically:

- if `highlights` exists, it is preferred as the canonical bullet source
- `description` is then rebuilt from `summary + highlights`
- any rewritten `description` coming back from the LLM is effectively discarded if stale `highlights` also came back

In this run, the LLM returned both:

- a rewritten `description`
- the original `highlights`

After `TailoringResumePayload.model_validate(result)` in [`apps/backend/app/services/tailoring/orchestration.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/orchestration.py#L93), the rewritten `description` was collapsed back to the old highlights before we persisted or rendered anything.

### Secondary root cause: downstream code still prefers `highlights`

Even after the bad normalization, later steps keep reinforcing the legacy field:

- diffing prefers `highlights` over `description` in [`apps/backend/app/services/tailoring/diffing.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/diffing.py#L208)
- render artifacts are generated from the already-collapsed stored payload, so the final YAML/Markdown/PDF all reflect the old bullets

So once the collapse happens, the rest of the pipeline has no chance to recover.

### Secondary issue: local cleanup creates fake signs of success

`finalize_tailored_resume()` runs local cleanup after rehydration:

- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L282)

That cleanup includes `remove_ai_phrases()`:

- [`apps/backend/app/services/refiner.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/refiner.py#L208)

This is why we still saw a few bullet diffs:

- they were mostly cleanup substitutions on the old bullets
- one replacement also lowercased the first word (`Orchestrated` -> `coordinated`) because replacements are case-insensitive but not case-preserving

This made the run look “changed” while the real LLM rewrites were already lost.

## Why The Current Design Is Fragile

The refactor currently mixes two incompatible goals:

1. A strict LLM-editable payload
2. Legacy compatibility fields like `highlights`

That creates an aliasing bug:

- prompt asks model to edit `description`
- schema still includes `highlights`
- validator treats `highlights` as canonical
- diff/render also keep reading `highlights`

So the pipeline is not truly operating on one canonical text field.

## Repair Plan

### Phase A — Stop dropping LLM bullet edits

1. Introduce dedicated tailoring-only entry models.

Create `TailoringExperience` and `TailoringProject` models that contain only the fields the LLM should see/edit.

For work/project entries this should be:

- identity fields
- dates
- `summary`
- `description`

Do **not** include `highlights` in the tailoring prompt contract or LLM response model.

2. Make the tailoring response schema canonical.

The tailoring pipeline should treat `description` as the single source of truth.

Rules:

- LLM input: no `highlights`
- response contract: no `highlights`
- response validation: reject or strip `highlights`
- persistence: derive any compatibility aliases only after canonical storage is finalized

3. Add a conflict detector before persistence.

If raw LLM output contains both `description` and `highlights` and they differ:

- log a structured warning
- store the raw mismatch in `generation_runs.result_payload`
- optionally fail closed in preview if the conflict rate is above threshold

This would have made the PayPal failure obvious immediately.

### Phase B — Unify downstream consumers around canonical text

4. Normalize once, then derive compatibility fields.

After the LLM result is validated:

- persist canonical `description`
- derive `highlights` from canonical text only for legacy compatibility
- never let `highlights` overwrite `description`

5. Update diffing to read canonical text first.

[`apps/backend/app/services/tailoring/diffing.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/diffing.py#L208) should not prefer `highlights` when the tailoring flow is already canonicalized.

Preferred behavior:

- use `description`
- fall back to `highlights` only for old resumes or old stored data

6. Verify render inputs from the canonical payload.

Add a pre-render assertion that the bullets entering RenderCV match the canonical tailored `description` values we expect to persist.

### Phase C — Make failures visible instead of silent

7. Store raw tailoring output snapshots in generation runs.

Persist a compact but real snapshot of:

- raw `resume_generate_full` JSON
- normalized tailoring payload
- finalized stored payload

Then expose these three layers in observability so we can answer:

- what the model returned
- what validation kept
- what cleanup changed

8. Add “change-collapse” telemetry.

Track counts across stages:

- raw LLM bullet changes
- post-validation bullet changes
- post-cleanup bullet changes
- rendered bullet changes

Alert when:

- raw changes > 0
- final rendered changes are near zero

That exact signature matches this incident.

### Phase D — Tighten cleanup so it does not mask failures

9. Restrict `remove_ai_phrases()` to a safer scope.

It should not be allowed to create the illusion of a successful tailoring pass.

Safer options:

- only run on bullets actually changed by the LLM
- or run after canonical diff accounting, with its changes separately labeled as cleanup-only

10. Preserve case during replacements.

The current cleanup can degrade text quality (`Orchestrated` -> `coordinated`).
Case-preserving replacements should be implemented if cleanup remains enabled.

## Test Plan

### Must-add regression tests

1. Tailoring response conflict test

Input a raw LLM response where:

- `description` contains new tailored bullets
- `highlights` contains the old bullets

Assert:

- final stored payload keeps the new `description`
- compatibility `highlights` are derived from that canonical description

2. End-to-end preview persistence test

Run the preview pipeline with a mocked `resume_generate_full` response that adds:

- a new summary
- one rewritten bullet
- one extra bullet in `full` mode

Assert:

- preview `resume_preview`
- persisted generation run payload
- rendered YAML snapshot

all contain the same bullets.

3. Diff integrity test

Assert that when raw LLM output changes bullets materially, the final diff summary reflects those changes and not only cleanup substitutions.

4. Cleanup isolation test

Assert that cleanup-only edits are labeled separately and cannot masquerade as LLM tailoring success.

### Coverage gaps that let this through

Current tests heavily validate/expect `highlights` as a first-class field, for example:

- [`apps/backend/tests/integration/test_resume_api.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/integration/test_resume_api.py#L96)
- [`apps/backend/tests/unit/test_rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/unit/test_rendercv_adapter.py#L323)

But we do not currently have a regression test for:

- raw LLM response contains both `description` and `highlights`
- shared schema normalization silently drops the edited `description`

That exact missing test is the hole this run fell through.

## Recommended Execution Order

1. Introduce dedicated tailoring-only models without `highlights`
2. Update response contract/prompt assembly to only expose canonical editable fields
3. Add raw-vs-normalized-vs-final observability in `generation_runs`
4. Update diff/render paths to prefer canonical `description`
5. Add the regression tests above
6. Tighten cleanup behavior and case preservation

## Success Criteria

The fix is done when all of the following are true:

- the LLM’s rewritten bullets survive validation into stored `processed_data`
- preview diff reflects actual LLM edits, not mostly cleanup noise
- rendered YAML/Markdown/PDF contain the same tailored bullets we saw in the raw LLM output
- observability can show where text changed across each stage
- a replay of the PayPal run produces materially tailored bullets in the final resume

## Bottom Line

This issue is **primarily a schema/canonicalization bug in our pipeline**, not a model-quality failure.

The model returned useful tailoring.
We dropped it because the refactored pipe still carries legacy alias fields (`highlights`) and lets them overwrite the canonical editable field (`description`).
