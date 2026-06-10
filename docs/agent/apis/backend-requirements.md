# Backend API Requirements

> Current route inventory for the live backend.

## Base URL

```text
http://localhost:8000/api/v1
```

## Authentication

None. This is still a local-first single-user app surface.

## Route Groups

### Health

- `GET /health`
- `GET /status`

### Config

- `GET /config/llm-api-key`
- `PUT /config/llm-api-key`
- `POST /config/llm-test`
- `POST /config/cliproxy-models`
- `GET /config/features`
- `PUT /config/features`
- `GET /config/generation-defaults`
- `PUT /config/generation-defaults`
- `GET /config/language`
- `PUT /config/language`
- `GET /config/prompts`
- `PUT /config/prompts`
- `GET /config/prompts/catalog`
- `GET /config/prompts/catalog/master-resume-preview`
- `GET /config/prompts/catalog/response-contract-preview`
- `GET /config/critique`
- `PUT /config/critique`
- `GET /config/model-overrides`
- `PUT /config/model-overrides`
- `PUT /config/prompts/{step_name}/instructions`
- `DELETE /config/prompts/{step_name}/instructions`
- `PUT /config/prompts/{step_name}/rules`
- `DELETE /config/prompts/{step_name}/rules`
- `GET /config/prompts/{step_name}/composer`
- `PUT /config/prompts/{step_name}/composer`
- `DELETE /config/prompts/{step_name}/composer`
- `PUT /config/shared-rules/{rules_name}`
- `DELETE /config/shared-rules/{rules_name}`
- `GET /config/api-keys`
- `POST /config/api-keys`
- `DELETE /config/api-keys`
- `DELETE /config/api-keys/{provider}`
- `POST /config/reset`

### Jobs

- `POST /jobs/upload`
- `GET /jobs/{job_id}`

### Resumes

- `POST /resumes/upload`
- `GET /resumes?resume_id=...`
- `GET /resumes/list`
- `POST /resumes/draft/normalize`
- `POST /resumes/draft/render-preview`
- `POST /resumes/improve/confirm`
- `POST /resumes/improve` (deprecated one-shot path)
- `GET /resumes/active`
- `PUT /resumes/{resume_id}/active`
- `PUT /resumes/{resume_id}/pin`
- `POST /resumes/{resume_id}/duplicate`
- `PATCH /resumes/{resume_id}`
- `PATCH /resumes/{resume_id}/draft`
- `POST /resumes/{resume_id}/pdf`
- `GET /resumes/{resume_id}/pdf`
- `POST /resumes/{resume_id}/render-preview`
- `GET /resumes/{resume_id}/render-preview`
- `DELETE /resumes/{resume_id}`
- `POST /resumes/{resume_id}/retry-processing`
- `PATCH /resumes/{resume_id}/cover-letter`
- `PATCH /resumes/{resume_id}/outreach-message`
- `PATCH /resumes/{resume_id}/title`
- `POST /resumes/{resume_id}/generate-auxiliary-package`
- `POST /resumes/{resume_id}/generate-cover-letter`
- `POST /resumes/{resume_id}/generate-outreach`
- `GET /resumes/{resume_id}/jd-tailor-diff`
- `GET /resumes/{resume_id}/job-description`
- `GET /resumes/{resume_id}/cover-letter/pdf`

### Application Packs And Artifacts

- `GET /application-packs`
- `POST /application-packs/preview`
- `POST /application-packs/confirm`
- `POST /application-packs/questions/answer`
- `POST /application-packs/questions/save`
- `GET /application-packs/questions`
- `GET /artifacts/{artifact_id}`
- `GET /themes`

### LLM Observability

- `GET /llm/calls`
- `GET /llm/calls/summary`
- `GET /llm/runs/timing`
- `GET /llm/runs/timing-detailed`

### Enrichment

- `POST /enrichment/analyze/{resume_id}`
- `POST /enrichment/enhance`
- `POST /enrichment/apply/{resume_id}`
- `POST /enrichment/regenerate`
- `POST /enrichment/apply-regenerated/{resume_id}`

## Response Shape Notes

- most structured responses include a `request_id`
- LLM-backed tailor preview/confirm/direct-improve responses use `request_id` as the trace id for observability
- application-question generation uses the question `generation_run_id` as the trace id
- resume fetch responses include:
  - `raw_resume`
  - `processed_resume`
  - optional `cover_letter`
  - optional `outreach_message`
  - optional `application_pack_id`
  - optional `theme_settings`
- draft validation failures can return structured `detail` with `section`, `line`, `column`, and `path`

## Important Status Codes

| Code | Typical meaning |
|------|-----------------|
| `400` | invalid request, preview hash mismatch, bad prompt id, invalid language |
| `404` | missing resume, job, artifact, or cover letter |
| `409` | resume missing structured data for RenderCV rendering |
| `413` | upload too large |
| `422` | upload parse failure |
| `500` | unexpected server error |
| `503` | RenderCV or Playwright rendering failure |
| `504` | tailor preview timeout |
