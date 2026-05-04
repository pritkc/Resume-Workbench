# Feedback Run 2 Workplan

1. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:66`
   Old line: `- Two sentences max. Lead with technical domain, then strongest signal and role intent.`
   New line: `- One sentence only, target 120-155 characters; must fit in 1-2 resume lines after rendering.`
   Rationale: The summary is still too long and visually becomes three lines.

2. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:67`
   Old line: `- What you do, not what you are — no adjective pileup, no credential dump, no keyword list`
   New line: `- Write one compact role thesis: domain + strongest transferable capability + outcome area; no keyword list.`
   Rationale: Keeps the summary useful without turning it into a long JD mirror.

3. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:77`
   New line: `BULLET FIT:`
   Rationale: Add a clear rendering guard before bullet writing rules.

4. Target: after new `BULLET FIT:` line
   New line: `- Each bullet must be one resume line where possible: target 105-145 characters, hard max 165 characters.`
   Rationale: First work experience bullets are too long and wrap into new visual lines.

5. Target: after new `BULLET FIT:` line
   New line: `- Use one clause plus one outcome; avoid stacking multiple clauses with semicolons.`
   Rationale: The current bullets are dense and wrap because they pack too many ideas.

6. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:24`
   Old line: `- bullets object keyed by stringified bullet index; rewrite existing indexes or add new trailing indexes where appropriate`
   New line: `- bullets object keyed by stringified bullet index; rewrite existing indexes only unless RESPONSE CONTRACT explicitly permits new trailing indexes`
   Rationale: Prevents the model from adding new work-experience lines by default.

7. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:39`
   Old line: `JD is the lens to reorder, reword, and emphasize honest overlap — not to invent new employers or history.`
   New line: `JD is a lens, not a script: translate the candidate into a broader impressive profile where JD alignment is a subset.`
   Rationale: Avoids fake-sounding copy-paste alignment while still targeting the role.

8. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:45-49`
   Old line: `ATS:`
   New line: `ATS & NATURALNESS:`
   Rationale: Makes ATS optimization subordinate to natural resume writing.

9. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:46`
   Old line: `- Use resume_technical_keywords from JD intelligence as the canonical list — exact forms, exact capitalization (e.g., "Spring Boot" not "Spring framework", "Kubernetes" not "K8s")`
   New line: `- Prefer exact ATS terms only for high-signal technologies; translate responsibility phrases into natural broader experience.`
   Rationale: Keeps terms like Python/SQL/ETL exact, but stops copying JD phrases into prose.

10. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:15`
    Old line: `BOLD_KEYWORDS: array of exactly 15 strings from final resume content, chosen for JD alignment`
    New line: `BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms from final resume content`
    Rationale: Bold keywords should be compact recruiter-scan terms, not long phrases.

11. Target: after `BOLD_KEYWORDS` line
    New line: `Use 1-3 word terms only; prefer tools, languages, platforms, data methods, and product systems; avoid sentences, soft skills, and generic domain phrases.`
    Rationale: Prevents outputs like "data-driven decisions" and "actionable intelligence".

12. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:56-61`
    Old line: `- Every skill must appear in at least one tech stack or bullet — remove orphans; no duplicates across groups`
    New line: `- Skills should preserve impressive superset capability; JD-critical skills come first, but adjacent strong skills stay when credible.`
    Rationale: The skills section should make the candidate look broader than the JD, not smaller.

13. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:10`
    Old line: `- Skills: restructure into exactly 5 groups`
    New line: `- Skills: restructure into exactly 5 groups; preserve impressive superset skills after JD-critical groups`
    Rationale: Makes the user preference explicit in the full-run input.

14. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:12`
    Old line: `- Projects: rewrite all; keep the same bullet count as each source project unless RESPONSE CONTRACT says a different count`
    New line: `- Projects: retain the closest two projects; lightly reframe wording/context for the JD, keep names and core substance stable`
    Rationale: Matches current temporary need: keep the two closest projects mostly intact.

15. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:13`
    Old line: `- Titles: scope-enhance all experience entries`
    New line: `- Titles: add only broad truthful scope qualifiers; do not copy JD titles or secondary role labels`
    Rationale: Prevents overdoing copied role subtitles like exact "Data Infrastructure & Analytics".

16. Target: `apps/backend/app/prompts/text/tailor_resume_full/system.txt:8-10`
    Old line: `1. Identify the 3–5 most important themes from the JD intelligence.`
    New line: `1. Identify the 3–5 broader competencies behind the JD, not just the JD's exact wording.`
    Rationale: Forces translation into a stronger superset profile.

17. Target: `apps/backend/app/prompts/text/tailor_resume_full/system.txt:9`
    Old line: `2. Map each theme to the strongest honest evidence in the resume.`
    New line: `2. Map each competency to the strongest resume evidence or a reasonable new claim the user can later prove.`
    Rationale: Supports the revised goal: write new stronger content when the user is expected to substantiate it later.

18. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt:100-103`
    Old line: `DEFENSIBILITY:`
    New line: `CLAIM POLICY:`
    Rationale: "Defensibility" currently over-constrains the model toward only existing evidence.

19. Target: under `CLAIM POLICY:`
    Old line: `- Defensible softer claim beats a sharp claim the candidate cannot support`
    New line: `- Prefer strong plausible claims that fit the candidate trajectory; avoid impossible claims, but do not require exact source wording.`
    Rationale: Allows stronger resume generation while avoiding absurd inventions.

20. Target: `apps/backend/app/services/tailoring/contracts.py:40-42`
    Old line: `"Preserve project bullet count in full runs; do not compress several project bullets into one.",`
    New line: `"Preserve project bullet count in full runs; retain closest two projects with only light JD-aware reframing.",`
    Rationale: Reinforces the project rule in the LLM-visible response contract.

21. Target: `apps/backend/app/services/tailoring/contracts.py:40-42`
    New line: `"Keep summaries and bullets render-fit: summary 120-155 chars, bullets 105-145 chars where possible.",`
    Rationale: Adds the visual fit rule to the compact contract, not only the long schema.

22. Target: tests
    New line: `Add prompt tests that assert summary length guidance, bullet length guidance, no default new trailing bullet indexes, 8-12 bold keywords, and "closest two projects" language.`
    Rationale: Harnesses the exact failures from this run so future prompt edits do not regress.

23. Target: tests
    New line: `Add a fixture using this run's first work experience and assert no prompt instruction permits new bullet indexes unless contract says so.`
    Rationale: Directly covers the work-experience new-line/new-bullet issue.

24. Target: tests
    New line: `Add a lint test that rejects bold keyword instructions allowing phrases longer than 3 words.`
    Rationale: Keeps bolding focused on scan-friendly ATS terms.
