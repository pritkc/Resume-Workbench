# JD Match

> JD Match is a builder-side comparison view for saved tailored resumes. It is not an LLM feature.

## Current Behavior

The builder shows a JD Match tab only when it can load the original job description for the current resume.

Backend endpoint:

- `GET /api/v1/resumes/{resume_id}/job-description`

That endpoint only works when:

- the resume is tailored (`parent_id` exists)
- an improvement record still links the resume to a stored job description

If an older tailored resume predates job tracking or the link is missing, the endpoint returns an error and JD Match is unavailable.

## UI Behavior

The view shows:

- the original job description
- the current resume with matched keywords highlighted
- simple keyword/match statistics

Matching is client-side and case-insensitive. No LLM call is involved.

## Key Files

- `apps/frontend/lib/utils/keyword-matcher.ts`
- `apps/frontend/components/builder/jd-comparison-view.tsx`
- `apps/frontend/components/builder/jd-display.tsx`
- `apps/frontend/components/builder/highlighted-resume-view.tsx`
- `apps/backend/app/routers/resumes.py`

## Agent Notes

- If you change how tailored resumes are linked to jobs, update `get_job_description_for_resume()` and the builder gating logic together.
- JD Match is derived from persisted job content plus client-side keyword matching, so prompt/config changes should not affect it directly.
