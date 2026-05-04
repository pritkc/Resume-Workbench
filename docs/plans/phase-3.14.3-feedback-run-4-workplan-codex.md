# Phase 3.14.3 Feedback Run 4 Workplan

Run: `docs/plans/test_runs/fbb69720-bcb3-4541-951f-c7b2a44841a4`

1. Target: `apps/backend/app/services/tailoring/preservation.py:358-366`
   Old line: apply `tech_stacks` to `entry["techStack"]` before splitting old bullets.
   New line: calculate `prefix, desc` from a pre-mutation copy of the original entry before applying `position`, `name`, or `tech_stacks`.
   Rationale: The PDF gained extra old tail bullets because the new tech stack broke the old stack-line splitter.

2. Target: `apps/backend/tests/unit/test_compact_diff.py`
   New line: add a regression where stored `description` starts with the old `techStack`, the diff changes `tech_stacks`, and all bullet indexes are rewritten; assert no old tail bullet remains.
   Rationale: Reproduces the exact PDF leak: JSON had 5 bullets, rendered PDF showed 6.

3. Target: `apps/backend/app/services/tailoring/preservation.py:412-415`
   Old line: `if bullet_idx >= len(desc): while len(desc) <= bullet_idx: desc.append("")`
   New line: `if bullet_idx >= len(desc): log and skip the bullet`
   Rationale: Prompt says no new bullet indexes, but the applicator still silently appends them.

4. Target: `apps/backend/tests/unit/test_compact_diff.py:82-87`
   Old line: `test_bullet_append_at_new_trailing_index`
   New line: replace with `test_out_of_range_experience_bullet_index_is_skipped`
   Rationale: Current test harness blesses the same behavior we want to forbid.

5. Target: `apps/backend/tests/unit/test_compact_diff.py:160-166`
   Old line: `test_trailing_bullet_index_extends_description`
   New line: replace with a test that index `5` leaves the original bullet list unchanged.
   Rationale: Prevents future reintroduction of hidden bullet appends.

6. Target: `apps/backend/app/services/tailoring/validation.py:54-60`
   Old line: validate only that bullet keys are integers.
   New line: also reject `experience[{key}].bullets[{bkey}]` when `bkey >= contract.experience_bullet_counts[idx]`.
   Rationale: Contract already knows valid bullet count; validation should enforce it.

7. Target: `apps/backend/app/services/tailoring/validation.py:82-88`
   Old line: validate only that project bullet keys are integers.
   New line: also reject `projects[{key}].bullets[{bkey}]` when `bkey >= contract.project_bullet_counts[idx]`.
   Rationale: Locks project bullet counts in code, not only prompt text.

8. Target: `apps/backend/tests/unit/test_tailoring_validation.py:129-134`
   Old line: `test_bullet_index_beyond_contract_count_allowed`
   New line: `test_bullet_index_beyond_contract_count_rejected`
   Rationale: Aligns validation tests with the no-new-bullets rule.

9. Target: `apps/backend/tests/unit/test_tailoring_validation.py:160-164`
   Old line: `test_project_bullet_beyond_count_allowed`
   New line: `test_project_bullet_beyond_count_rejected`
   Rationale: Same structural guard for projects.

10. Target: `apps/backend/app/services/tailoring/preservation.py` near `finalize_tailored_resume`
    New line: add `_enforce_description_counts(original_data, result)` after cleanup and before return.
    Rationale: Catches bullet count drift from compact, legacy full-body, cleanup, or schema rehydration paths.

11. Target: new helper `_enforce_description_counts`
    New line: for `workExperience` and `personalProjects`, compare description/highlights count excluding stack line; trim extras and restore missing original bullets to keep exact source counts.
    Rationale: Guarantees the final rendered payload cannot leak extra bullet points.

12. Target: `apps/backend/tests/unit/test_compact_diff.py` or new preservation test
    New line: add a finalization test using the run-4 shape and assert final work bullets remain `[5, 2, 3, 3]` and projects remain `[1, 1, 1]`.
    Rationale: Verifies the actual rendered-output invariant, not only the LLM JSON.

13. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:1-6`
    Old line: `1. BULLETS — deep-rewrite per WRITING RULES...`
    New line: `1. BULLETS — selective rewrite: keep most source bullets; add direct JD framing to only 1-2 bullets per experience`
    Rationale: Current output feels built only for the JD instead of a broader resume.

14. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:11`
    Old line: `- Experience: deep-rewrite the 3 most recent roles; keyword-alignment touch only on older or short-tenure roles`
    New line: `- Experience: per role, rewrite at most 1-2 bullets for direct JD alignment; keep the rest unchanged or broadened with impressive adjacent work`
    Rationale: Makes JD alignment a subset of each role, not the whole role.

15. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:12`
    Old line: `- Projects: retain the closest two projects; lightly reframe wording/context for the JD, keep names and core substance stable`
    New line: `- Projects: edit at most the closest two projects; keep names stable; use light JD context only when it naturally fits`
    Rationale: Run 4 renamed all projects around process/workflow language, which looked artificial.

16. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:31-35`
    New line: `- Omit unchanged bullet indexes; do not emit all bullets just to show work was considered.`
    Rationale: Supports selective edits and reduces JD saturation.

17. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:40`
    Old line: `JD is a lens, not a script: translate the candidate into a broader impressive profile where JD alignment is a subset.`
    New line: `JD is a lens, not the resume's center: each section should show broader capability first, with only selected JD-aligned evidence.`
    Rationale: Stronger wording for the exact fake/artificial vibe.

18. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:52-54`
    New line: `Direct JD terms should appear in no more than 1-2 bullets per experience entry; other bullets should stay original or show adjacent stronger work.`
    Rationale: Turns the user's most important ask into an explicit schema rule.

19. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:61-67`
    New line: `Skills must read as a broad professional toolkit: preserve original strong engineering/data skills, then add only a few high-signal JD-specific terms.`
    Rationale: Prevents skills from collapsing into SAP/process-only content.

20. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:71-77`
    New line: `Summary must position the candidate broadly; do not lead with the JD title when the source resume shows a stronger wider profile.`
    Rationale: Run 4 summary became a process-analyst summary rather than a software/data professional summary.

21. Target: `apps/backend/app/prompts/text/extract_jd_intel/user.txt:56`
    Old line: `Include exact high-signal ATS terms, not responsibility phrases.`
    New line: `Include exact high-signal ATS terms, not responsibility phrases or basic office tools.`
    Rationale: Excel entered the resume keyword source and then leaked everywhere.

22. Target: `apps/backend/app/prompts/text/extract_jd_intel/user.txt:57`
    Old line: `Use 1-3 word tools, languages, platforms, products, data methods, and technical domains only.`
    New line: `Use 1-3 word non-basic tools, languages, platforms, products, data methods, and technical domains only.`
    Rationale: Keeps SAP/Power BI possible but blocks Excel/MS Office-style terms.

23. Target: `apps/backend/app/prompts/text/extract_jd_intel/user.txt:57`
    New line: `Exclude basic/table-stakes tools such as Excel, Google Sheets, Microsoft Office, Word, PowerPoint, Outlook, email, Slack, and Jira from resume_technical_keywords and resume_bold_keyword_sources.`
    Rationale: Basic tools should not consume resume space even when listed in the JD.

24. Target: `apps/backend/app/services/tailoring/jd_intel_blob.py`
    New line: add `_BASIC_RESUME_TERMS` and `filter_resume_keyword_sources(blob)` to strip basic terms from `resume_technical_keywords` and `resume_bold_keyword_sources`.
    Rationale: Prompt guidance alone failed; sanitize the source blob before it reaches tailoring.

25. Target: `apps/backend/app/services/tailoring/analysis.py:116-118`
    Old line: `enrich_jd_intel_blob(result, job_description)`
    New line: call `filter_resume_keyword_sources(result)` after enrichment.
    Rationale: Ensures stored job keywords and prompt injections start clean.

26. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `ATS & NATURALNESS`
    New line: `Do not emit basic office tools in summary, bullets, tech_stacks, skills, or bold_keywords, even if the JD asks for them.`
    Rationale: Blocks Excel-style leakage in every output surface.

27. Target: `apps/backend/app/services/tailoring/preservation.py`
    New line: add `_strip_basic_resume_terms_from_compact_output` for `skills`, `bold_keywords`, `tech_stacks`; reject bullet rewrites containing blocked basic terms.
    Rationale: Provides a final safety net if the LLM still emits basic terms.

28. Target: `apps/backend/tests/unit/test_jd_intel_blob.py`
    New line: add test where JD extraction blob contains `Excel`, `Power BI`, `SAP`; assert filter removes `Excel` but keeps `SAP` and `Power BI`.
    Rationale: Separates basic tooling from high-signal enterprise tooling.

29. Target: `apps/backend/tests/unit/test_prompt_assembly.py`
    New line: assert full prompt contains `at most 1-2 bullets per experience` and `omit unchanged bullet indexes`.
    Rationale: Harnesses selective tailoring instead of all-bullets JD rewriting.

30. Target: `apps/backend/app/services/tailoring/verification.py`
    New line: warn when more than two bullets in an experience contain direct JD-only terms or when basic blocked terms appear in final resume text.
    Rationale: Adds a QA signal for fake-looking JD saturation without blocking all strong generated content.

31. Target: new PDF/run verification helper or test utility
    New line: extract final PDF text and assert no duplicated original tail bullets, no blocked basic terms, expected bullet counts, and all rendered skill groups are visible.
    Rationale: Run 4 only exposed the leak after rendering; the harness should check rendered output too.

32. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `BOLD_KEYWORDS`
    New line: `Do not include basic tools or generic role/domain labels; choose only recruiter-scan technical terms worth bolding.`
    Rationale: Prevents `Excel`, `Data Analysis`, and generic domain phrases from being highlighted.
