# Application Packs

> The current tailoring workflow is a persisted preview/confirm pipeline, not a one-shot improve call.

## What An Application Pack Is

An application pack is the saved container for one resume/job pairing during tailoring. It ties together:

- the base resume
- the uploaded job description
- the selected tailor prompt and generation run metadata
- RenderCV artifacts for preview/final output
- optional persisted cover letter and outreach output generated later from the builder
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
- runs **JD intelligence** extraction when cache is empty or stale; result is a **JSON object** on the job (`job_keywords`) — shape is defined by shipped **`extract_jd_intel`** prompts and optional `enrich_jd_intel_blob` fills
- runs one primary tailoring call (`resume_generate_full`) that returns a compact addressed diff, even for `lite` mode
- validates the compact diff for observability and stores any envelope validation issues on the latest matching LLM trace row
- optionally runs `critique_resume` + `rewrite_resume` in `full` mode when `/api/v1/config/critique` is enabled
- assembles the prompt with that blob (including **`$extract_jd_intel_output`** and optional dot paths in user templates — see `apps/backend/app/prompts/text/README.md`), compact resume, and response contract
- **Supported-keyword** style checks use strings harvested from list values anywhere in the blob
- applies the compact diff locally to the original resume, with a legacy full-body fallback for old model output
- preserves personal info, dates, skills, and custom sections
- rebuilds `sectionMeta` locally after tailoring
- removes unsupported additions and AI-style phrasing locally
- filters low-signal terms, enforces original description counts, and verifies claims locally
- computes local warnings, diff data, `change_manifest`, `change_breakdown`, `skills_observability`, and `bold_keywords` for the review UI and confirm storage
- derives title locally from extracted job metadata
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

Confirm does not re-run tailoring and the current Tailor page sends `include_cover_letter=false` and `include_outreach_message=false`. Cover letter and outreach are generated later from the builder through explicit endpoints.

### 3. Generate Auxiliary Documents

After confirmation, the builder can call:

1. `POST /api/v1/resumes/{resume_id}/generate-auxiliary-package`
2. `POST /api/v1/resumes/{resume_id}/generate-cover-letter`
3. `POST /api/v1/resumes/{resume_id}/generate-outreach`

All three load the tailored resume's job context from the improvement record, call `generate_cover_letter_and_outreach()` once, and persist both outputs on the tailored resume. The single-field endpoints return only the requested field but still save both.

### 4. List Packs

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

- `extract_jd_intel_output`
- `resume_generate_full`
- optional `critique_resume`
- optional `rewrite_resume`

Auxiliary text generation is not part of pack preview/confirm. When triggered later, the auxiliary text prompts do not receive the full stored resume JSON anymore. They receive:

- local `job_target` metadata (`role`, `company`, `location`)
- a trimmed job-description excerpt
- a compact candidate profile built from the resume

Preview requests use request scope `resumes.improve_preview`.

Confirm requests do not currently run LLM calls or set a trace scope; they persist generation-run metadata and RenderCV artifacts.

For preview, the trace id is the response `request_id`, and the Tailor UI links that directly into `/llm-traces`.

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
- prompt selection is persisted as a generation default. Cover-letter/outreach generation is a builder action after confirmation.
- The diff preview is computed locally from original vs tailored structured resume JSON, not authored by the LLM.
- The compact LLM output can still contribute manifest rationales via per-cell `why` strings.

## Key Backend Files

- `apps/backend/app/routers/application_packs.py`
- `apps/backend/app/routers/resumes.py`
- `apps/backend/app/db/models.py`
- `apps/backend/app/services/artifact_service.py`
- `apps/backend/app/services/tailoring/`
- `apps/backend/app/services/cover_letter.py`

## Agent Notes

- `POST /api/v1/resumes/improve` still exists, but it is not the full pack workflow and should not be treated as the primary user path.
- If you change pack metadata, update both SQL storage and the response payloads consumed by Tailor and the builder.
- If you touch preview/confirm behavior, update preview-hash validation carefully; it is the main guard that ensures the user confirms the reviewed payload.
