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
├── extract_job_keywords() if missing/stale
├── _generate_tailored_resume_data()
│   ├── generate_resume_diffs() -> LLM
│   ├── apply_diffs()
│   ├── verify_diff_result()
│   └── fallback improve_resume() -> LLM if diff mode fails
├── refine_resume() -> mixed LLM + local passes
├── generate title / cover letter / outreach
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
├── llm_trace_scope(trace_id=request_id, request_scope="resumes.improve_confirm")
├── regenerate title / cover letter / outreach as needed
├── create tailored resume
├── create legacy improvement generation_run
├── create or update application_pack
├── create confirm generation_run
├── render_resume_bundle() -> final artifacts
└── return tailored resume id + artifacts
```

## Direct Improve

```text
POST /api/v1/resumes/improve
├── fetch resume + job
├── llm_trace_scope(trace_id=request_id, request_scope="resumes.improve")
├── extract_job_keywords() -> LLM
├── diff-first tailoring with full-output fallback
├── refine_resume()
├── generate title / cover letter / outreach
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
├── filter by trace_id / request_scope / operation / success
└── return raw call rows or aggregate summaries
```
