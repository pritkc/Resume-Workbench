# Phase 3.2 — Repair And Stabilize The LLM Tailoring Pipe

## Objective

Repair the tailoring system so LLM changes survive prompt generation, validation, storage, diffing, and RenderCV output.

This plan is based on the failed live run:

- `resume_id`: `3ed603c4-82a1-43a9-a64d-4b22df2bd7b6`
- `job_id`: `1cf4e7d9-d4c6-4677-9c9e-544c6c13ade2`
- preview trace: `d372bb8d-1940-408e-86c2-853e9b8bee1d`
- preview generation run: `d8fafbec-ed17-4414-a439-4ad493cee65e`
- confirmed resume: `6579a2eb-70da-4753-b694-0f499a47b4b3`

## Non-Negotiable Decisions

### 0. Stable system wins over a bad refactor

If the refactored flow keeps fighting correctness, we simplify it or roll pieces back. We will not preserve refactor shape at the cost of losing user-facing resume edits.

Primary code paths involved:

- [`apps/backend/app/services/tailoring/orchestration.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/orchestration.py#L30)
- [`apps/backend/app/services/tailoring/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/models.py#L20)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L258)

### 1. One canonical schema, aligned to backend RenderCV-ready resume data

The backend `ResumeData` shape is the source of truth. We will accept legacy aliases on read, but normalize immediately and never let aliases drive canonical behavior.

Primary schema and render references:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L715)
- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L481)

### 2. Prefer straightforward system stages over many micro-fix helpers

The target shape is:

1. normalize input once
2. build one canonical LLM payload
3. capture one explicit change manifest
4. apply changes deterministically
5. derive compatibility aliases once
6. render from canonical data

We should not keep adding small corrective helpers that each mutate resume text differently.

### 3. Prompting and diffing must agree on indexed paths

The model must tell us exactly what changed by stable field path, and the backend must verify and capture those paths directly.

Relevant existing change-path schema:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L1332)
- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L863)

### 4. We must isolate subsystem work on the UI

The UI should show, separately:

- what the LLM proposed
- what the backend accepted
- what safeguards rejected
- what cleanup changed
- what numeric claims were corrected or rejected
- what finally rendered

That is the only way to know which layer actually did the work.

### 5. `skills` stays editable by the LLM

`skills` must go through the tailoring prompt and be allowed to regroup and rewrite labels cleanly, while still preventing invented skill values.

Current contract and preservation references:

- [`apps/backend/app/services/tailoring/contracts.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/contracts.py#L79)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L143)

### 6. JD location wins when present

If the JD provides a location and we successfully extract it, the final tailored resume should use that location in `personalInfo.location`. If the JD does not provide one, keep the master resume location.

Current conflict point:

- [`apps/backend/app/services/tailoring/analysis.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/analysis.py#L131)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L46)

## Confirmed Current Failures

### 1. LLM bullet rewrites are dropped during validation

The refactored tailoring payload still uses shared `Experience` and `Project` models:

- [`apps/backend/app/services/tailoring/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/models.py#L29)

Those shared models still treat `highlights` as an active compatibility field:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L336)
- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L480)

That means a response containing new `description` plus stale `highlights` gets collapsed back to the old bullet list during:

- [`apps/backend/app/services/tailoring/orchestration.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/orchestration.py#L85)

### 2. Downstream diff/render logic still prefers legacy fields

Diffing reads `highlights` before `description`:

- [`apps/backend/app/services/tailoring/diffing.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/diffing.py#L186)

RenderCV still reads `highlights` preferentially in multiple places:

- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L359)
- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L401)

So even after the first bad collapse, the rest of the system keeps reinforcing the wrong field.

### 3. The prompt contract does not make `skills` explicit enough

`skills` is present, but the contract is too soft. It says the section is an object and may regroup, but it does not give the model an explicit editable shape with path-level expectations the same way descriptions do.

- [`apps/backend/app/services/tailoring/contracts.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/contracts.py#L88)
- [`apps/backend/app/services/tailoring/prompting.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/prompting.py#L54)
- [`apps/backend/app/prompts/templates.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/prompts/templates.py#L151)

### 4. Location updates are blocked by personal-info preservation

The prompt intentionally excludes `personalInfo`, but the backend later restores the entire original personal-info block wholesale:

- [`apps/backend/app/services/tailoring/prompting.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/prompting.py#L54)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L46)

That means even when JD extraction finds a better target location, the final tailored resume cannot reflect it.

### 5. Cleanup work creates fake signs of success

Local cleanup still edits text after the model stage:

- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L225)
- [`apps/backend/app/services/refiner.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/refiner.py#L208)

Those edits can make a run look active even when the real LLM rewrite was lost.

### 6. Numeric-claim checks are too late and not attributable

We do have metric detection:

- [`apps/backend/app/services/tailoring/verification.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/verification.py#L11)

But it only emits warnings after the fact. It does not isolate:

- which numbers the LLM introduced
- which were rejected
- which were corrected by the backend
- which reached the final render

## Canonical Schema Decision

### Canonical top-level resume shape

The tailoring and render pipeline should operate on the normalized `ResumeData` shape:

- `personalInfo`
- `summary`
- `workExperience`
- `education`
- `personalProjects`
- `skills`
- `customSections`
- `sectionMeta`

Reference:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L715)

### Canonical editable fields for tailoring

Only these fields should be LLM-editable in Phase 3.2:

- `summary`
- `workExperience[*].summary`
- `workExperience[*].description[*]`
- `personalProjects[*].summary`
- `personalProjects[*].description[*]`
- `skills.groups[*].label`
- `skills.groups[*].values[*]`
- allowed `customSections` content fields based on section type

### Server-owned fields

These must remain backend-owned:

- `personalInfo`, except deterministic `personalInfo.location` override from JD
- `education`
- `sectionMeta`
- entry identity fields such as company, title/position, institution, names, dates, URLs

### Legacy aliases accepted on read only

We should normalize these once and never rely on them downstream:

- `additional` -> `skills`
- `startDate` -> `start_date`
- `endDate` -> `end_date`
- `photoUrl` -> `photo`
- `profile_links` -> `profileLinks`
- `social_networks` -> `socialNetworks`
- `custom_connections` -> `customConnections`
- work-entry `title` / `position` duality normalized once
- `highlights` retained only as a derived compatibility alias for legacy input or render compatibility

Primary normalization references:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L300)
- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L850)

## Technical Repair Flow

### Phase A — Stabilize the current flow before adding more intelligence

#### 1. Replace shared tailoring entry models with dedicated canonical LLM models

Create dedicated tailoring-only models for:

- work experience
- personal projects
- skills groups
- editable custom-section item content

These models must not include `highlights` as an editable or prompt-visible field.

This directly removes the main collapse point caused by shared normalization:

- [`apps/backend/app/services/tailoring/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/models.py#L29)
- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L336)

#### 2. If needed, temporarily bias preview/confirm to the simpler stable path

If the refactored schema still causes ambiguity during rollout, temporarily keep preview and confirm on the simpler stable canonical path while new validation and tests land. The priority is stable output, not preserving the refactor’s current shape.

Relevant preview/confirm flow:

- [`apps/backend/app/routers/resumes.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/resumes.py#L1661)
- [`apps/backend/app/routers/resumes.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/resumes.py#L1824)
- [`apps/backend/app/routers/application_packs.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/routers/application_packs.py#L33)

### Phase B — Unify naming conventions once and for all

#### 3. Declare one canonical internal naming standard

Inside backend and storage, use only the normalized ResumeData field names. RenderCV-specific translation should happen only at the adapter boundary, not leak back into tailoring logic.

The concrete rule is:

- canonical storage and business logic use normalized backend names
- RenderCV adapter translates from canonical backend data to RenderCV output
- legacy aliases are read-compatible only

#### 4. Do a repo-wide alias cleanup where the wrong names still drive logic

This should be a deliberate mass cleanup across:

- schema normalization
- tailoring payload construction
- prompt assembly
- diffing
- preservation
- RenderCV adapter reads
- router serialization
- tests and fixtures

Primary files to align:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py)
- [`apps/backend/app/services/tailoring/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/models.py)
- [`apps/backend/app/services/tailoring/contracts.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/contracts.py)
- [`apps/backend/app/services/tailoring/diffing.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/diffing.py)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py)
- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py)

#### 5. Make `highlights` derived-only

`description` becomes the only canonical bullet field for tailoring and diffing.

Rules:

- prompt input: no `highlights`
- prompt output: no `highlights`
- storage: canonical `description`
- render compatibility: derive `highlights` from canonical `description` only once
- old records may still be read via `highlights`, but never allowed to overwrite canonical `description`

### Phase C — Make the prompt and change capture path robust

#### 6. Move from “best-effort full payload” to “payload plus indexed change manifest”

Use the existing path-based change schema as the center of the new contract:

- [`apps/backend/app/schemas/models.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/schemas/models.py#L1332)

The v2 response contract should require:

1. a canonical tailored payload for the editable sections
2. a `changes` manifest with stable indexed paths
3. each change to include current-value verification and reason

This gives us a direct bridge from prompt output to backend diff capture and UI attribution.

#### 7. Restrict change paths to an allowed canonical set

Allowed path families should include:

- `summary`
- `workExperience[i].summary`
- `workExperience[i].description[j]`
- `personalProjects[i].summary`
- `personalProjects[i].description[j]`
- `skills.groups`
- `customSections.<key>.text`
- `customSections.<key>.items[i].description[j]`

Disallowed path families should include:

- `personalInfo.*`, except server-owned deterministic location override
- `education.*`
- `sectionMeta.*`
- identity/date/company/name/url fields

#### 8. Validate the manifest before applying any text

For each LLM change:

1. path must be valid
2. action must be allowed for that path
3. `original` must match the current canonical resume value
4. numeric claims must be checked before acceptance
5. unsupported skills must be rejected

If a change fails validation, it should be rejected explicitly and reported in run metadata and UI.

### Phase D — Make skills a first-class editable section

#### 9. Expand the `skills` contract from vague object to explicit editable structure

The response contract should tell the model that `skills.groups[*].label` and `skills.groups[*].values` are editable and regroupable, while all skill values must still come from the master resume.

Current weak contract reference:

- [`apps/backend/app/services/tailoring/contracts.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/contracts.py#L88)

#### 10. Preserve skill truthfulness without blocking valid regrouping

The backend should:

1. extract the full master skill set once
2. allow regrouping, relabeling, reordering, and subset emphasis
3. reject new skill values not present in the master
4. report dropped master skills separately
5. keep skills visible in the LLM contract, not grouped with excluded sections like education or personal info

#### 11. Diff and UI must show skill-specific work

We need clear counts for:

- skill values regrouped
- skill values added by LLM and accepted
- skill values rejected as unsupported
- skill groups relabeled

This should no longer be hidden inside a generic “additional group changed” bucket.

### Phase E — Make location deterministic and system-owned

#### 12. Apply target location server-side after personal-info preservation

The LLM should not own `personalInfo`, but the backend should still set `personalInfo.location` from the JD when available.

The deterministic rule is:

1. extract JD location via keyword analysis
2. normalize it
3. if non-empty, write it to `personalInfo.location`
4. if empty, keep the master resume location

This should happen after preserving the rest of `personalInfo`, not before.

Relevant code points:

- [`apps/backend/app/services/tailoring/analysis.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/analysis.py#L131)
- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L46)

#### 13. Store the location source for UI clarity

Record one of:

- `jd`
- `master`
- `none`

The UI can then show whether the final location came from the job target or from the master resume.

### Phase F — Separate LLM edits from system corrections

#### 14. Add stage-by-stage change accounting

Each generation run should store distinct buckets:

- `llm_proposed_changes`
- `llm_accepted_changes`
- `llm_rejected_changes`
- `system_location_override`
- `system_skill_restorations`
- `system_cleanup_changes`
- `numeric_claim_rejections`
- `final_render_changes`

This should live alongside the stored generation-run payloads, not be inferred later from loose logs.

#### 15. Isolate numeric claims as a dedicated high-risk stream

For every accepted or rejected text change, detect and store numeric claims such as:

- years
- percentages
- multipliers
- dollar amounts
- counts

We already detect some of this in verification:

- [`apps/backend/app/services/tailoring/verification.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/verification.py#L11)

Phase 3.2 should move this from a late warning into a first-class accounting stream:

- numbers proposed by the LLM
- numbers accepted
- numbers rejected
- numbers corrected by system rules
- numbers present in final render

#### 16. Show these buckets directly on the UI

The preview and confirm UI should visibly separate:

- LLM edits
- backend safety restores
- cleanup-only edits
- numeric-risk actions
- final rendered changes

This is the key requirement for knowing which system actually worked how much.

### Phase G — Render only from canonical finalized data

#### 17. Make RenderCV consume canonical data, not guess between aliases

The adapter should read canonical finalized resume data first and only use legacy aliases for old records that have not been migrated.

Current ambiguity points:

- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L359)
- [`apps/backend/app/rendering/rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/rendering/rendercv_adapter.py#L401)

#### 18. Add a pre-render consistency assertion

Before rendering:

1. compare finalized canonical payload to the render input payload
2. assert that canonical descriptions and skills match
3. fail fast if the render layer reintroduces stale aliases

### Phase H — Keep cleanup narrow and honest

#### 19. Cleanup must never masquerade as LLM tailoring

If `remove_ai_phrases()` stays, its edits must be tracked separately from LLM edits and never counted as proof that the model tailored the resume.

Current cleanup entry point:

- [`apps/backend/app/services/tailoring/preservation.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/app/services/tailoring/preservation.py#L225)

#### 20. Cleanup should operate only after manifest accounting

The order should be:

1. validate and apply LLM changes
2. record accepted/rejected edits
3. run minimal cleanup
4. record cleanup-only edits separately

That keeps attribution correct and avoids fake-success diff summaries.

## Test Plan

### A. Must-add unit tests

#### 1. Canonical model tests

Add tests proving:

- tailoring payload models reject or strip `highlights`
- canonical `description` survives validation
- legacy aliases normalize once and do not overwrite canonical fields

Best homes:

- [`apps/backend/tests/service/test_improver.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/service/test_improver.py)
- new `apps/backend/tests/unit/test_tailoring_models.py`

#### 2. Prompt contract tests

Add tests proving:

- `skills` is explicitly editable in the response contract
- `education`, `sectionMeta`, and `personalInfo` are excluded from LLM output
- the change-manifest contract includes indexed paths
- JD location is provided as context but not as an LLM-owned personal-info field

Relevant existing prompt tests:

- [`apps/backend/tests/service/test_improver.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/service/test_improver.py#L89)

#### 3. Change-manifest validation tests

Add tests for:

- valid indexed path accepted
- wrong path rejected
- `original` mismatch rejected
- forbidden identity-field path rejected
- unsupported skill value rejected
- numeric invention rejected or flagged

Recommended new file:

- `apps/backend/tests/unit/test_tailoring_manifest.py`

#### 4. Diff integrity tests

Add tests proving:

- diffing prefers canonical `description`
- skill regrouping is reported cleanly
- cleanup-only edits do not inflate LLM change counts
- numeric claim changes are counted separately

Existing file to extend:

- [`apps/backend/tests/unit/test_resume_diff.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/unit/test_resume_diff.py)

#### 5. Location override tests

Add tests proving:

- JD location overrides `personalInfo.location`
- master location remains when JD location is missing
- no other personal-info fields are changed by that override

Recommended new file:

- `apps/backend/tests/unit/test_tailoring_location.py`

### B. Must-add integration tests

#### 6. Preview pipeline round-trip test

Mock a tailoring result that:

- rewrites one work bullet
- adds one supported bullet in full mode
- regroups skills
- includes a JD location

Assert that:

- preview response contains those exact accepted changes
- generation-run metadata stores LLM, system, cleanup, and render buckets separately
- rendered YAML reflects the same final canonical text

Relevant existing integration suite:

- [`apps/backend/tests/integration/test_application_packs_api.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/integration/test_application_packs_api.py)

#### 7. Confirm pipeline persistence test

Assert that preview-to-confirm round-trip preserves:

- accepted bullet text
- accepted skill regrouping
- JD location override
- change-accounting metadata

Relevant existing flow:

- [`apps/backend/tests/integration/test_application_packs_api.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/integration/test_application_packs_api.py#L270)

#### 8. Render consistency test

Assert that the finalized canonical payload and RenderCV input are text-identical for:

- summaries
- descriptions
- skills
- location

Relevant render test suites:

- [`apps/backend/tests/unit/test_rendercv_adapter.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/unit/test_rendercv_adapter.py)
- [`apps/backend/tests/unit/test_rendercv_engine.py`](/Users/pritchakalasiya/Development/resume-workk/apps/backend/tests/unit/test_rendercv_engine.py)

#### 9. Regression test for the exact PayPal failure shape

Mock raw LLM output where:

- `description` contains materially rewritten bullets
- `highlights` contains the old bullets
- cleanup would also make a few word substitutions

Assert:

- canonical stored resume keeps the new `description`
- derived `highlights` come from canonical `description`
- reported LLM edits are not replaced by cleanup edits
- final rendered output matches accepted LLM bullets

### C. Migration and backward-compatibility tests

#### 10. Legacy resume read-compatibility test

Old stored resumes that only have `highlights` or `additional` should still load, normalize, and render correctly after the cleanup.

#### 11. Mixed-alias resume test

Fixtures using `startDate`, `endDate`, `additional`, `title`, and `highlights` together should normalize to one canonical internal shape and render identically after migration.

## Delivery Order

### Step 1

Stop `highlights` from overwriting canonical `description`.

### Step 2

Unify naming across backend logic and RenderCV boundaries.

### Step 3

Ship indexed change manifest capture with strict validation.

### Step 4

Make `skills` fully first-class in prompt, diff, and UI accounting.

### Step 5

Apply deterministic JD location override.

### Step 6

Ship stage-by-stage UI accounting, including numeric-claim isolation.

### Step 7

Lock it down with unit, integration, and backward-compatibility tests.

## Expected End State

When this phase is done:

- the LLM can no longer silently lose bullet rewrites because of `highlights`
- backend naming is unified around one canonical schema
- skills are actually editable by the LLM and safely validated
- JD location correctly updates the final resume when available
- numeric-risk edits are isolated and visible
- the UI clearly shows which layer changed what
- preview, confirm, storage, diffing, and RenderCV all agree on the same final text
