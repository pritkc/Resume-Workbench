# API Flow Maps

> End-to-end request flows for the current backend.

## Resume Upload

```text
POST /api/v1/resumes/upload
├── validate file type and size
├── parse_document() -> markdown
├── db.create_resume_atomic_master(status="processing")
├── llm_trace_scope(trace_id=request_id, request_scope="resumes.upload")
├── parse_resume_to_json() -> LLM
├── db.update_resume(processed_data, processing_status)
└── return {request_id, resume_id, processing_status, is_master}
```

## Application-Pack Preview

```text
POST /api/v1/application-packs/preview
├── fetch resume + job
├── resolve prompt_id and generation flags
├── llm_trace_scope(trace_id=request_id, request_scope="resumes.improve_preview")
├── extract_job_keywords() if missing/stale  → LLM; stores JSON blob on the job (`job_keywords`)
├── _generate_tailored_resume_data()
│   ├── resume_generate_full -> LLM compact addressed diff
│   ├── validate_compact_diff() -> local observability-only validation
│   ├── optional critique_resume -> LLM when full-mode critique is enabled
│   ├── optional rewrite_resume -> LLM second-pass compact diff
│   └── apply_compact_diff() -> local full resume reconstruction
├── local cleanup
│   ├── preserve personal info / dates / additional items / custom sections
│   ├── rehydrate sectionMeta locally
│   ├── remove unsupported additions locally
│   └── remove AI-style phrasing locally
├── verify_generated_resume_result() -> local warnings
├── calculate_resume_diff() -> local diff summary + detailed changes
├── build change_manifest / change_breakdown / skills_observability
├── generate title locally
├── create application_pack + generation_run
├── render_resume_bundle() -> RenderCV artifacts
└── return preview data, artifacts, warnings, diff summary, request_id
```

## Application-Pack Confirm

```text
POST /api/v1/application-packs/confirm
├── fetch resume + job
├── canonicalize improved_data
├── validate preview hash against stored preview_hash / preview_hashes
├── derive title locally and reuse stored auxiliary text if present
├── create tailored resume
├── create legacy improvement generation_run
├── create or update application_pack
├── create confirm generation_run
├── render_resume_bundle() -> final artifacts
└── return tailored resume id + artifacts
```

## Builder Auxiliary Generation

```text
POST /api/v1/resumes/{resume_id}/generate-auxiliary-package
POST /api/v1/resumes/{resume_id}/generate-cover-letter
POST /api/v1/resumes/{resume_id}/generate-outreach
├── require a tailored resume with job context in improvements
├── load tailored resume + original job
├── generate_cover_letter_and_outreach() -> one LLM call (`cover_letter_outreach_generate`)
├── persist both cover_letter and outreach_message on the tailored resume
└── return both outputs or the requested single field
```

## Direct Improve

> **Product note:** Prefer **`POST /api/v1/application-packs/preview`** then **`POST /api/v1/application-packs/confirm`** for the main tailored-resume flow (diff review, hashes, pack records).
>
> **`POST /api/v1/resumes/improve`** is marked **`deprecated`** in OpenAPI. It remains for backward compatibility and one-shot tooling; behavior mirrors tailoring + persistence patterns used in the pack flows.

```text
POST /api/v1/resumes/improve   # deprecated: see OpenAPI /docs
├── fetch resume + job
├── llm_trace_scope(trace_id=request_id, request_scope="resumes.improve")
├── extract_job_keywords() -> LLM  (`operation`: **`extract_jd_intel_output`**; raw JSON per `extract_jd_intel` prompts; tailoring templates use `$extract_jd_intel_output` — see `prompts/text/README.md`)
├── resume_generate_full -> LLM compact addressed diff
├── optional critique_resume / rewrite_resume
├── local cleanup + verification
├── calculate_resume_diff() + change manifest
├── generate title locally
├── create tailored resume
├── create legacy improvement record
└── return tailored resume payload
```

## Draft Normalize / Save / Preview

```text
POST /api/v1/resumes/draft/normalize
PATCH /api/v1/resumes/{resume_id}/draft
POST /api/v1/resumes/draft/render-preview
├── resolve base resume + base theme settings
├── normalize structured payload or parse raw YAML sections
├── return normalized resume data + YAML sections
└── optionally render RenderCV artifacts for preview
```

## Resume PDF And Render Preview

```text
POST /api/v1/resumes/{resume_id}/pdf
GET  /api/v1/resumes/{resume_id}/pdf
POST /api/v1/resumes/{resume_id}/render-preview
GET  /api/v1/resumes/{resume_id}/render-preview
├── fetch stored structured resume
├── resolve theme settings from payload, query params, or saved state
├── render_resume_bundle()
├── persist artifacts
└── return PDF bytes or artifact summaries
```

## Cover-Letter PDF

```text
GET /api/v1/resumes/{resume_id}/cover-letter/pdf
├── fetch stored cover letter
├── build frontend print URL
├── render_resume_pdf() via Playwright
└── return PDF bytes
```

## LLM Trace Queries

```text
GET /api/v1/llm/calls
GET /api/v1/llm/calls/summary
GET /api/v1/llm/runs/timing
GET /api/v1/llm/runs/timing-detailed
├── filter by trace_id / request_scope / operation / success
└── return raw call rows, aggregate summaries, or generation-run timing
```
