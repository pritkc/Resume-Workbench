# Custom Sections

> Custom sections still exist, but they now have to round-trip through RenderCV and survive LLM tailoring safely.

## Canonical Data Model

Custom section state lives in two places:

- `sectionMeta`
- `customSections`

`sectionMeta` controls:

- order
- visibility
- display name
- section type
- whether a section is built-in or custom

`customSections` stores the actual content keyed by the custom section key.

Supported section types:

- `personalInfo`
- `text`
- `itemList`
- `stringList`

The schema lives in `apps/backend/app/schemas/models.py`.

## Current Editor Behavior

The visual builder still supports:

- renaming sections
- reordering sections
- toggling visibility
- deleting custom sections
- adding new custom sections

Primary frontend files:

- `apps/frontend/components/builder/resume-form.tsx`
- `apps/frontend/components/builder/section-header.tsx`
- `apps/frontend/components/builder/add-section-dialog.tsx`
- `apps/frontend/lib/utils/section-helpers.ts`

Existing resumes are lazily normalized with `normalize_resume_data()` so missing `sectionMeta` and `customSections` are backfilled on read.

## RenderCV Round-Trip

Custom sections are no longer just a frontend rendering concern.

The RenderCV adapter now:

- emits custom sections into RenderCV `cv.sections`
- reconstructs custom sections when YAML is parsed back
- rebuilds `sectionMeta` for custom sections using display names and existing keys when possible

Relevant file:

- `apps/backend/app/rendering/rendercv_adapter.py`

Important implication:

- changing custom-section naming, keys, or shape can break raw-YAML round trips unless the adapter and section-meta rebuilding logic are updated together

## LLM Safety Guards

Tailoring routes explicitly protect custom sections after generation.

`apps/backend/app/routers/resumes.py` currently:

- restores custom sections that the LLM removed
- trims hallucinated extra items from `itemList` custom sections
- removes fabricated descriptions when the original custom item had an empty description
- restores month-level date strings for `itemList` custom sections if the LLM degrades them

The main guard is `_protect_custom_sections()`.

## Agent Notes

- Treat `sectionMeta.key` as the durable link between metadata and `customSections`.
- Display-name changes are allowed, but key stability matters for saves, raw YAML parsing, and LLM post-processing.
- If you introduce new custom-section behavior, update visual builder code, schema normalization, RenderCV adapter round-trip logic, and tailoring safeguards together.
