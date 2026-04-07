# Application Packs

> The current tailoring workflow is a persisted preview/confirm pipeline, not a one-shot improve call.

## What An Application Pack Is

An application pack is the saved container for one resume/job pairing during tailoring. It ties together:

- the base resume
- the uploaded job description
- the selected tailor prompt and generation run metadata
- RenderCV artifacts for preview/final output
- optional cover letter and outreach output
- target metadata like company, role, and location

The pack record lives in SQL, not in frontend state only.

## Lifecycle

### 1. Create Job + Preview Pack

Current Tailor page flow:

1. `POST /api/v1/jobs/upload`
2. `POST /api/v1/application-packs/preview`
3. user reviews diff + artifacts

Preview work in `apps/backend/app/routers/resumes.py`:

- resolves `prompt_id`
- extracts job keywords
- runs one primary full-resume tailoring call
- shapes that prompt with compact job analysis, supported keywords from the source resume, a trimmed JD excerpt, and a compact output plan
- preserves personal info, dates, skills, and custom sections
- removes unsupported additions and AI-style phrasing locally
- computes local warnings and local diff data for the review UI
- optionally generates cover letter and outreach, while deriving title locally from extracted job metadata
- creates an `application_packs` row with `status="preview_ready"`
- creates a `generation_runs` row with `run_kind="application_pack_preview"`
- renders/stores RenderCV artifacts
- stores a preview hash on the job so confirm can validate the exact reviewed payload

### 2. Confirm Pack

Current Tailor page flow after diff acceptance:

1. `POST /api/v1/application-packs/confirm`
2. backend validates the improved payload against the stored preview hash
3. backend creates the tailored resume and improvement record
4. backend updates the pack to `status="confirmed"`
5. backend creates a `generation_runs` row with `run_kind="application_pack_confirm"`
6. backend renders/stores final RenderCV artifacts for the tailored resume

If the preview hash does not match, confirm is rejected and the user must preview again.

### 3. List Packs

`GET /api/v1/application-packs`

Supports filtering by:

- `company`
- `role`
- `created_from`
- `created_to`

## LLM And Prompt Behavior

Prompt selection is part of pack creation. The active `prompt_id` comes from:

1. request payload
2. generation defaults
3. global default prompt config
4. `DEFAULT_IMPROVE_PROMPT_ID`

The preview pipeline currently touches these LLM operations:

- `job_extract_keywords`
- `resume_generate_full`
- optional `cover_letter_generate`
- optional `outreach_generate`

Preview requests use request scope `resumes.improve_preview`.

Confirm requests use request scope `resumes.improve_confirm`.

The resulting trace id is the response `request_id`, and the Tailor UI links that directly into `/llm-traces`.

## Persistence Model

Relevant tables:

- `application_packs`
- `generation_runs`
- `artifacts`
- `resumes`
- `jobs`
- `improvements`

Important links:

- `resumes.application_pack_id`
- `generation_runs.application_pack_id`
- `artifacts.application_pack_id`
- confirmed packs also point at the final tailored resume

Theme settings are stored on the pack so preview and confirm can stay aligned with the reviewed RenderCV output.

## Frontend Surface

Primary files:

- `apps/frontend/app/(default)/tailor/page.tsx`
- `apps/frontend/components/tailor/diff-preview-modal.tsx`
- `apps/frontend/components/rendercv/application-pack-panel.tsx`
- `apps/frontend/lib/api/resume.ts`

Behavior to remember:

- Tailor now previews before saving a tailored resume.
- Missing diff data triggers an explicit confirm dialog instead of silently saving.
- prompt selection, cover-letter toggle, and outreach toggle are persisted as generation defaults.
- The diff preview is computed locally from original vs tailored structured resume JSON, not authored by the LLM.

## Key Backend Files

- `apps/backend/app/routers/application_packs.py`
- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/db/models.py`
- `apps/backend/app/services/artifact_service.py`

## Agent Notes

- `POST /api/v1/resumes/improve` still exists, but it is not the full pack workflow and should not be treated as the primary user path.
- If you change pack metadata, update both SQL storage and the response payloads consumed by Tailor and the builder.
- If you touch preview/confirm behavior, update preview-hash validation carefully; it is the main guard that ensures the user confirms the reviewed payload.
