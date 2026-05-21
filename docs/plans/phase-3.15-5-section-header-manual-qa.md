# Phase 3.15-5 Section-Header Manual QA

## Goal

Check that resume generation still behaves the same for users, while the new section-header LLM format works behind the scenes.

## Main Flow To Test

1. Open the tailor page.
2. Paste a job description.
3. Click generate immediately after pasting.
4. Review the resume preview.
5. Confirm changes.
6. Open the final generated preview/artifact.

## What Should Feel The Same

1. The generate button flow should still work from paste to preview.
2. The preview should still show the same resume sections as before.
3. The diff/change review UI should still work.
4. Confirm should save the improved resume without a 400 error.
5. RenderCV artifact generation should behave the same.
6. No frontend/API shape should look different.

## What Is New Behind The Scenes

1. The LLM now returns section-header text instead of JSON for main resume tailoring.
2. Backend parses that text back into the existing compact diff format.
3. Missing or unchanged fields are filled as `[RETAIN]`.
4. JD extraction also uses section headers, then stores the result in a wrapper inside `job_keywords`.
5. Cover letter parsing now supports the new section-header format, while old formats still work.
6. Critique/rewrite is skipped for section-header v1 if it is enabled.

## Things To Notice In Resume Preview

1. Summary should be tailored and should not disappear.
2. Experience entries should stay in the right order.
3. Project entries should stay in the right order.
4. Skills should stay grouped correctly.
5. Bold keywords should still appear where expected.
6. Unchanged content should remain unchanged.
7. No fields should show raw parser text like `WHY:`, `=== SUMMARY ===`, or `[RETAIN]`.
8. No section should be duplicated.
9. No section should be silently removed.

## Things To Notice In Confirm Flow

1. Confirm should work after preview.
2. Location updates from the JD should no longer fail confirm.
3. If location changes, it should be because the JD clearly has a target location.
4. Personal info fields other than allowed fields should not unexpectedly change.
5. After confirm, the final preview should match what was approved.

## JD Extraction Checks

1. Job title/company/location should still be detected when present.
2. JD intelligence should still affect tailoring quality.
3. Important JD signals should appear in the generated resume.
4. JD text with unusual headings should still generate a usable preview.
5. Legacy saved jobs should still work.

## Cover Letter Checks

1. Cover letter generation should still produce a cover letter.
2. Outreach message should still appear when requested.
3. Older JSON/tagged cover letter responses should still parse if encountered.

## Edge Cases To Try

1. Very short JD.
2. Very long JD.
3. JD with no company name.
4. JD with no location.
5. JD with remote/hybrid/on-site location language.
6. JD pasted and generate clicked immediately.
7. Resume section with many skills.
8. Resume with project sections present.
9. Resume with project sections absent.
10. Generate twice with different JDs in the same session.

## Signs Something Is Wrong

1. Preview fails after generation.
2. Confirm fails with `Invalid improved resume data`.
3. Final preview differs from approved preview.
4. Resume shows section markers like `=== EXPERIENCE 1 ===`.
5. Resume shows `[RETAIN]` as visible text.
6. Experience/project content moves to the wrong section.
7. Skills count or grouping looks broken.
8. Location changes when the JD did not provide a location.
9. Old saved jobs no longer generate correctly.

## Backend Checks Already Passed

1. `uv run ruff check app tests`
2. `uv run pytest -q`
3. Full backend suite passed: `524 passed`.

