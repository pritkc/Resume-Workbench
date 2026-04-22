# Phase 6 Global Test Cases

Updated: 2026-04-01

## Automated Regression Gate

Run these before shipping:

1. `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
2. `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
3. `npm test`
4. `npx next build --webpack`

## End-to-End Acceptance Cases

1. Master resume upload
- Upload a PDF or DOCX master resume.
- Confirm `processing_status` reaches `ready`.
- Open the builder and confirm the structured form is editable.

2. RenderCV builder preview
- Open a saved resume in `/builder?id=<resume_id>`.
- Change theme, density, accent color, and margins.
- Confirm the RenderCV preview refreshes and shows PNG plus PDF artifact links.
- Save the resume and confirm the preview refreshes without errors.

3. Job description tailoring pack
- Paste a realistic JD in `/tailor`.
- Generate a preview application pack.
- Confirm the diff modal opens and includes RenderCV preview artifacts.
- Confirm the page-level application pack panel shows cover letter and outreach content.

4. Tailored fork confirmation
- Confirm the diff.
- Verify a tailored resume fork is created.
- Verify the app navigates to `/resumes/<tailored_resume_id>`.
- Verify the tailored resume keeps `application_pack_id`, `generation_run_id`, and theme settings.

5. Resume viewer artifact path
- Open the tailored resume viewer.
- Confirm the page renders the RenderCV preview panel rather than the old React resume renderer.
- Download the resume PDF and verify the file opens correctly.

6. Cover letter and outreach preservation
- In the builder, switch to cover letter and outreach tabs.
- Verify both documents are present after a confirmed application pack run.
- Edit both fields and save without breaking the resume preview path.

7. Artifact download path
- Open preview or final PDF artifact links from the application pack panel or resume viewer.
- Confirm `/api/v1/artifacts/<artifact_id>` returns the expected file.

8. Resume history sanity check
- Create at least one tailored fork from the same master resume.
- Confirm `/dashboard` and `/resumes/<id>` continue to load both master and tailored resumes.

## Cleanup Verification

1. Confirm `/print/resumes/<id>` no longer exists.
2. Confirm active pages `/tailor`, `/builder`, and `/resumes/[id]` do not import the legacy template settings flow.
3. Confirm cover letter print and download flow still works.
