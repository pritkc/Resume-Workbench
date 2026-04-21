# Additional Groups And Raw YAML

> Two important editor systems now sit on top of the RenderCV normalization pipeline.

## Deprecation note (frontend helpers)

`apps/frontend/lib/utils/additional-groups.ts` may expose **legacy helpers** marked `@deprecated` (for example label-to-id bridging). Prefer the **label-based** additional-group APIs when adding new UI. Removal is **not scheduled** until all call sites migrate—grep for `@deprecated` in that file when touching the builder.

## Additional Groups

The canonical additional-info shape is:

```json
{
  "additional": {
    "groups": [
      { "id": "technicalSkills", "label": "Technical Skills", "items": [] }
    ]
  }
}
```

Default group ids:

- `technicalSkills`
- `languages`
- `certificationsTraining`
- `awards`

Both backend and frontend normalize older payloads into this grouped shape.

## Normalization Rules

Backend:

- `apps/backend/app/services/additional_groups.py`

Frontend:

- `apps/frontend/lib/utils/additional-groups.ts`

Important behavior:

- legacy flat keys are still accepted
- empty resumes get seeded default groups
- labels and ids are normalized/deduped
- mixed inputs are coerced into clean string arrays

Tailoring protection:

- `apps/backend/app/routers/resumes.py` uses `_preserve_original_skills()`
- that calls `restore_missing_additional_items()` so the LLM cannot silently drop original additional-group content

Regenerate support:

- builder regenerate supports `additionalGroup` items
- prompt: `REGENERATE_ADDITIONAL_GROUP_PROMPT`
- operation: `enrichment_regenerate_additional_group`

## Raw YAML Editor

The builder now supports direct RenderCV YAML editing for four sections:

- `cv`
- `design`
- `locale`
- `settings`

The authoritative conversion layer is:

- `apps/backend/app/rendering/rendercv_adapter.py`

That adapter is responsible for:

- converting structured resume JSON to RenderCV payload/YAML sections
- parsing YAML sections back into structured resume JSON
- rebuilding `additional.groups`
- round-tripping custom sections and section metadata
- building theme settings from `design`/`locale`/`settings`

## Draft Endpoints

- `POST /api/v1/resumes/draft/normalize`
- `POST /api/v1/resumes/draft/render-preview`
- `PATCH /api/v1/resumes/{resume_id}/draft`

Expected flow in the builder:

1. user edits structured fields or raw YAML
2. frontend calls normalize to reconcile the draft
3. backend returns normalized JSON plus regenerated YAML sections
4. preview calls RenderCV and stores transient artifacts
5. save persists normalized JSON and theme settings

## Validation Model

YAML parse errors are structured, not just plain strings.

The backend can return:

- `section`
- `line`
- `column`
- `path`

That shape is used by the raw YAML editor to focus the offending section and cursor position.

## Frontend Surface

Primary files:

- `apps/frontend/components/builder/resume-builder.tsx`
- `apps/frontend/components/builder/raw-yaml-editor.tsx`
- `apps/frontend/lib/api/resume.ts`
- `apps/frontend/lib/utils/additional-groups.ts`

## Agent Notes

- If you add a new additional-group field or change the grouped schema, update backend normalization, frontend normalization, regenerate item builders, and relevant tests together.
- If you add new RenderCV YAML capabilities, wire them through the adapter first; the builder assumes structured JSON and raw YAML can round-trip through the same normalization layer.
- Diff/apply work may refer to paths like `additional.groups`, so prompt or diff logic must keep using the grouped shape.
