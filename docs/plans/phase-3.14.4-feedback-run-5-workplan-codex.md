# Phase 3.14.4 Feedback Run 5 Workplan

Run: `docs/plans/test_runs/2ae93156-1336-4750-b250-81d9a8436775`

Goal: final hardening pass so tailored resumes read as the candidate's broader original engineering/data profile, with the JD as a subset and priority lens, not a 1:1 JD rewrite.

Ignored on purpose: any "only use claims already present in the original resume" rule. The intended product can add strong plausible claims that fit the candidate trajectory, with the expectation that the user can prove them later.

1. Target: prompt/run provenance in `apps/backend/app/services/tailoring/prompting.py`, `apps/backend/app/services/tailoring/llm_calls.py`, `apps/backend/app/prompts/_constants.py`
   Old snippet:
   ```py
   "prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown")
   ```
   New snippet:
   ```py
   REQUIRED_TAILORING_CANARIES = (
       "translation candidates, not mandatory insertions",
       "JD is a lens, not the resume's center",
       "Do not emit basic office tools",
       "Omit unchanged bullet indexes",
   )

   validate_prompt_canaries(prompt_context.user_prompt, REQUIRED_TAILORING_CANARIES)
   "prompt_hash": sha256(prompt_context.user_prompt.encode()).hexdigest()[:12]
   ```
   Rationale: run 5 saved an older prompt even though the repo has newer rules. We need a hard fail or visible prompt hash when the backend is running stale prompt text.

2. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt:1-14`
   Old snippet:
   ```text
   1. BULLETS - selective rewrite: keep most source bullets; add direct JD framing to only 1-2 bullets per experience
   ```
   New snippet:
   ```text
   1. CAREER STORY - preserve the candidate's base resume narrative first. The JD is a subset lens, not the resume's identity.
   2. BULLETS - rewrite only the bullets needed for fit; keep at least half of each role's original stories intact or lightly polished.
   ```
   Rationale: the output still felt like "SAP Process Analyst everywhere." This makes B larger than A in the model's first decision step.

3. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` under `EDIT SCOPE`
   Old snippet:
   ```text
   - Summary: full rewrite
   - Experience: per role, rewrite at most 1-2 bullets per experience for direct JD alignment; keep the rest unchanged or broadened with impressive adjacent work
   ```
   New snippet:
   ```text
   - Summary: full rewrite, but preserve the candidate identity from ORIGINAL RESUME; never rebrand into the JD title.
   - Experience: emit only changed bullet indexes. Per role, at most 1-2 bullets may carry direct JD-specific terms; all other emitted bullets must preserve the role's existing technical story or adjacent stronger engineering work.
   - Story retention: each role should keep at least one recognizable original interview story unless the role has only one bullet.
   ```
   Rationale: the candidate should not need to prepare an entirely new story for every resume.

4. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `--- SIGNAL & ATS ---`
   Old snippet:
   ```text
   JD is a lens, not the resume's center: each section should show broader capability first, with only selected JD-aligned evidence.
   ```
   New snippet:
   ```text
   RESUME SHAPE:
   - The original resume is the superset; the JD is a subset to emphasize.
   - A hiring manager should see a software/data engineer with transferable process/SAP coverage, not a resume rebuilt around one SAP Process Analyst posting.
   - Do not make every section repeat the same JD nouns.
   ```
   Rationale: current wording is directionally right but not forceful enough for pivot JDs.

5. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `JD ALIGNMENT STYLE`
   Old snippet:
   ```text
   - Direct JD terms should appear in no more than 1-2 bullets per experience entry; other bullets should stay original or show adjacent stronger work.
   ```
   New snippet:
   ```text
   - Direct JD terms should appear in no more than 1-2 bullets per experience entry.
   - Never use the same JD-specific noun family across summary, title, stack, and most bullets in the same role.
   - Prefer transferable mechanisms over exact JD copy: "metric contracts", "pipeline validation", "regulated reporting", "integration batch runtime" beats repeated "process mapping/workflow visualization".
   ```
   Rationale: run 5 repeated process/workflow/SAP across summary, titles, stacks, bullets, projects, and skills.

6. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `SUMMARY`
   Old snippet:
   ```text
   - One sentence only, target 120-155 characters; must fit in 1-2 resume lines after rendering.
   ```
   New snippet:
   ```text
   - One sentence only, target 105-135 characters; must fit in 1-2 resume lines after rendering.
   - Start from the candidate's base identity, e.g. "Software/data engineer..." or "Data platform engineer...", not the JD role label.
   - Mention at most one JD-specific domain/tool in summary.
   ```
   Rationale: the rendered summary was two lines but over-indexed on process/SAP/global logistics and visually split words.

7. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `TECH STACK HEADER`
   Old snippet:
   ```text
   - Any header tool must appear in at least one bullet; if only in skills, omit from header
   ```
   New snippet:
   ```text
   - Any header tool must appear in original role evidence or be necessary to the rewritten action.
   - Do not add JD-only tools to tech_stacks just because the JD names them.
   - Basic/commodity tools are banned in tech_stacks: Excel, spreadsheets, Word, PowerPoint, Outlook, Slack, Teams, Jira, Confluence, Notion, Miro.
   ```
   Rationale: run 5 leaked Power BI, Miro, Excel, SAP, and JIRA into stack lines. Stack lines are high-visibility and make fabrication obvious.

8. Target: `apps/backend/app/services/tailoring/jd_intel_blob.py`
   Old snippet:
   ```py
   _BASIC_RESUME_TERMS = frozenset({"excel", "microsoft excel", "jira", ...})
   ```
   New snippet:
   ```py
   _BASIC_RESUME_TERMS = frozenset({
       "excel", "microsoft excel", "spreadsheet", "spreadsheets",
       "google sheets", "microsoft office", "word", "powerpoint",
       "outlook", "email", "slack", "teams", "jira", "confluence",
       "notion", "miro",
   })
   ```
   Rationale: Miro is a JD tool here, but on a software/data resume it reads like low-signal process-tool stuffing. "spreadsheet" also consumed space in bullets.

9. Target: `apps/backend/app/services/tailoring/jd_intel_blob.py` and `apps/backend/app/prompts/text/extract_jd_intel/user.txt`
   Old snippet:
   ```text
   resume_technical_keywords: dedupe union of required_needs...
   ```
   New snippet:
   ```text
   resume_technical_keywords: high-signal ATS terms only. Split JD terms into:
   - keyword_must_match: specific systems/products worth matching if credible
   - transferable_themes: responsibility ideas to translate naturally
   - low_signal_terms: basic tools/business phrases that must not enter the resume
   ```
   Rationale: the extractor gave the tailoring prompt a flat list containing SAP, Excel, Miro, Process Mapping, Workflow Visualization, and Data Analysis. The model treated the whole list as insertion instructions.

10. Target: `apps/backend/app/services/tailoring/validation.py`
    Old snippet:
    ```py
    # validates entry keys, locked fields, and bullet indexes only
    ```
    New snippet:
    ```py
    if changed_bullet_count(entry) > 2:
        errors.append("experience[{key}] rewrites too many bullets for full-mode story retention")
    if len(projects_changed(diff)) > 2:
        errors.append("full mode may edit at most the closest two projects")
    ```
    Rationale: prompts can ask for selective edits, but the validator should stop all-bullet rewrites and all-project rewrites from applying.

11. Target: `apps/backend/app/services/tailoring/validation.py`
    Old snippet:
    ```py
    locked = set(entry.keys()) & _LOCKED_FIELDS
    ```
    New snippet:
    ```py
    if project_name_has_jd_suffix(entry.get("name")):
        errors.append("project name adds generic JD label; keep project names stable")
    if role_title_copies_jd(entry.get("position"), contract):
        errors.append("position copies JD role label instead of adding broad scope")
    ```
    Rationale: run 5 changed project names to "Compliance Workflow", "Data Analysis", "Workflow Visualization" style labels. That reads like JD wrapping.

12. Target: new helper in `apps/backend/app/services/tailoring/verification.py`
    Old snippet:
    ```py
    warnings.extend(_warn_on_jd_saturation(original, result, job_keywords))
    ```
    New snippet:
    ```py
    warnings.extend(warn_on_jd_ngram_copy(result, job_description))
    warnings.extend(warn_on_repeated_jd_noun_families(result, job_keywords))
    ```
    Rationale: the suspicious signal is not only exact keywords; it is repeated JD phrasing across the whole resume. Add n-gram similarity and noun-family repetition checks.

13. Target: `apps/backend/app/services/tailoring/verification.py`
    Old snippet:
    ```py
    if contains_basic_resume_term(extract_resume_text(result)):
        warnings.append(...)
    ```
    New snippet:
    ```py
    if contains_basic_resume_term(extract_resume_text(result)):
        critical.append("blocked basic/process tool leaked into final resume")
    if blocked_term in tech_stacks or bold_keywords:
        critical.append("blocked term leaked into high-visibility surface")
    ```
    Rationale: blocked terms in summary, stacks, skills, projects, or bold keywords should be hard failures, not soft warnings.

14. Target: `apps/backend/app/services/tailoring/preservation.py`
    Old snippet:
    ```py
    entry["techStack"] = _strip_basic_terms_from_stack_line(ts)
    ```
    New snippet:
    ```py
    entry["techStack"] = strip_low_signal_terms_from_stack(ts, jd_only_terms=job_keywords)
    entry["description"] = rewrite_or_skip_basic_tool_bullets(entry["description"])
    ```
    Rationale: the current filter catches simple comma-separated basic tools, but run 5 shows leakage through bullets and project names too. Preservation should sanitize every output surface.

15. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `SKILLS`
    Old snippet:
    ```text
    - Exactly 5 groups - split broad categories to reach 5; merge thin ones to avoid padding
    ```
    New snippet:
    ```text
    - Target 4-5 dense groups; never pad to 5 if a stronger grouped skill section fits better.
    - Preserve original strong group families first: Languages, Data, Cloud/DevOps, Frameworks.
    - Add at most 1-2 JD-specific values across the whole skills section unless already present in the original.
    ```
    Rationale: the final PDF rendered 4 groups anyway, and the LLM response created JD-mirror groups like Process & Analysis and Enterprise Systems.

16. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `BOLD_KEYWORDS`
    Old snippet:
    ```text
    BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms from final resume content
    ```
    New snippet:
    ```text
    BOLD_KEYWORDS: array of 6-10 short high-visibility technical ATS terms from final resume content.
    Use only technical recruiter-scan terms: Python, SQL, Kafka, PostgreSQL, Airflow, dbt, SAP ERP.
    Exclude basic tools, generic domains, role labels, and responsibility phrases.
    ```
    Rationale: run 5 bold sources included Excel, Miro, Process Mapping, Workflow Visualization, Data Analysis, Global Trade, and Supply Chain. These are not the kind of bold terms we want.

17. Target: metric/style rules in `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`
    Old snippet:
    ```text
    Vary metrics across bullets: time saved, latency, throughput...
    ```
    New snippet:
    ```text
    Use compact time units in bullets: h/wk, min, ms, sec.
    Prefer "~6h/wk -> ~45m" over "from ~6 hours/week to ~45 minutes".
    Prefer "45m -> ~12m" over "45+ minutes to ~12 minutes".
    ```
    Rationale: the PDF wastes space on full unit names. Compact units recover room for technical wins without shortening substance.

18. Target: local post-processing helper, likely `apps/backend/app/services/tailoring/preservation.py`
    Old snippet:
    ```py
    # no metric unit normalization
    ```
    New snippet:
    ```py
    text = normalize_metric_units(text)
    # "~6 hours/week" -> "~6h/wk", "45+ minutes" -> "45+ min", "~12 minutes" -> "~12 min"
    ```
    Rationale: model prompt guidance alone may be inconsistent; deterministic normalization is safer.

19. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `BULLETS`
    Old snippet:
    ```text
    - Structure: strong verb -> how (tool/scope) -> outcome with signal of impact. One idea per line, 1-2 lines max.
    ```
    New snippet:
    ```text
    - Keep technical density; do not make bullets short or thin.
    - Remove filler business nouns before removing technical detail.
    - Every rewritten bullet must remain interview-defensible from the candidate's broader story.
    ```
    Rationale: earlier length caps made bullets too short, but run 5 still wastes words on process/stakeholder phrasing.

20. Target: new lint helper in `apps/backend/app/services/tailoring/verification.py`
    Old snippet:
    ```py
    # no grammar/punctuation lint for rendered bullet text
    ```
    New snippet:
    ```py
    warnings.extend(warn_on_missing_clause_punctuation(result))
    warnings.extend(warn_on_repeated_openers_or_domains(result))
    ```
    Rationale: PDF bullets had grammar breaks like "PostgreSQL claims analytics moved..." and "Python and SQL a multi-day...". These make AI output feel unreviewed.

21. Target: PDF/render QA harness, new test utility under `apps/backend/tests/unit` or `apps/backend/tests/integration`
    Old snippet:
    ```py
    # tests validate JSON and render engine separately, but not final PDF text for tailoring leakage
    ```
    New snippet:
    ```py
    extracted = pdftotext(rendered_pdf)
    assert_no_blocked_terms(extracted)
    assert_expected_bullet_counts(extracted, [5, 2, 3, 3], [1, 1, 1])
    assert_summary_lines(extracted, max_lines=2)
    assert_not_jd_mirror(extracted, job_description)
    ```
    Rationale: run 4 and run 5 issues were visible only after rendered output. The harness should inspect the final PDF text.

22. Target: `apps/backend/app/rendering/rendercv_adapter.py` and bold keyword metadata flow
    Old snippet:
    ```py
    bold_keywords = _resolve_bold_keywords(theme)
    ```
    New snippet:
    ```py
    bold_keywords = filter_render_bold_keywords(
        _resolve_bold_keywords(theme),
        final_resume_text=extract_resume_text(resume),
        blocked_terms=BASIC_RESUME_TERMS,
    )
    ```
    Rationale: even if LLM output is filtered, rendering metadata can still carry bad bold sources unless the adapter filters them too.

23. Target: pipeline error handling in `apps/backend/app/services/tailoring/orchestration.py`
    Old snippet:
    ```py
    warnings.extend(verify_generated_resume_result(...))
    ```
    New snippet:
    ```py
    quality = verify_generated_resume_result(...)
    if quality.has_critical_failures:
        repaired = repair_tailoring_output(...)
        quality = verify_generated_resume_result(..., repaired)
    ```
    Rationale: basic-tool leakage, stale prompt, extra bullets, and JD-mirror saturation should trigger repair or rejection before a user downloads a suspicious resume.

24. Target: response contract in `apps/backend/app/services/tailoring/contracts.py`
    Old snippet:
    ```json
    "experience": {"entries": [...], "bullet_counts": [...]}
    ```
    New snippet:
    ```json
    "experience": {
      "entries": [...],
      "bullet_counts": [...],
      "direct_jd_bullet_budget": [2, 1, 1, 1],
      "preserve_story_min": [3, 1, 2, 2]
    },
    "projects": {
      "entries": [...],
      "bullet_counts": [...],
      "max_changed_entries": 2,
      "rename_allowed": false
    }
    ```
    Rationale: make edit budgets machine-readable so prompt, validation, and repair share the same constraints.

25. Target: retry hint in `apps/backend/app/services/tailoring/prompting.py:61-69`
    Old snippet:
    ```py
    "summary: one sentence. experience/projects: object keyed by 0-based entry index..."
    ```
    New snippet:
    ```py
    "Keep the original resume as the superset; JD terms are translation candidates, not mandatory insertions. "
    "Omit unchanged bullets. At most 1-2 direct JD bullets per role. "
    "Do not emit basic tools or generic process labels anywhere."
    ```
    Rationale: if the model retries after invalid JSON, the retry hint currently drops the most important anti-JD-mirror rules.

26. Target: docs/run review checklist, new helper under `docs/plans/test_runs/README.md` or test utility
    Old snippet:
    ```text
    # manual run review is ad hoc
    ```
    New snippet:
    ```text
    Final-run checklist:
    - Prompt contains current canaries
    - JSON output has no blocked terms
    - PDF text has no blocked terms
    - No section reads like JD copy
    - Project names stable
    - Metrics use compact units
    - At least one original story remains per role
    ```
    Rationale: this is the final feedback loop; future runs need a fast repeatable review checklist.

## Cross-model addendum after Composer/Sonnet rain check

Adopted from `phase-3.14.4-feedback-run-5-workplan-composer.md` and `phase-3.14.4-feedback-run-5-workplan-sonnet.md` where compatible with our goal. Ignored: their drift toward "only use what is already in the original resume" as a global rule. We still allow strong plausible broader claims, but named vendor/product/customer claims need tighter handling because they create obvious interview risk.

27. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` under `EXTRACTED JD INTELLIGENCE`
    Old snippet:
    ```text
    Rewrite angles (one per role; every bullet connects to at least one): $extract_jd_intel_output.responsibility_themes
    ```
    New snippet:
    ```text
    JD coverage themes (competency hooks, not resume copy): $extract_jd_intel_output.responsibility_themes
    Use these to select the 1-2 bullets per role that most naturally map to JD themes. Do not force every bullet to connect, and do not paraphrase these themes into summary, titles, skills, or bullets.
    ```
    Rationale: this is the strongest contradiction found by both models. "Every bullet connects" overrides our selective rewrite rule and creates the exact JD-mirror resume we are avoiding.

28. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` under `EXTRACTED JD INTELLIGENCE`
    Old snippet:
    ```text
    ATS keyword list (translation candidates, not mandatory insertions):    $extract_jd_intel_output.resume_technical_keywords
    Domain/product terms (weave into summary and bullets naturally):       $extract_jd_intel_output.resume_domain_keywords
    ```
    New snippet:
    ```text
    JD terms (translation candidates, not mandatory insertions):           $extract_jd_intel_output.resume_technical_keywords
    Domain/product context (coverage signals, not phrases to weave):       $extract_jd_intel_output.resume_domain_keywords
    Use these to check coverage and prioritize wording. A term belongs in the resume only when it fits the candidate's broader story, not because the JD said it.
    ```
    Rationale: "ATS keyword list" and "weave" still sound like insertion commands. The new label keeps ATS coverage while reducing forced phrase placement.

29. Target: `apps/backend/app/prompts/text/extract_jd_intel/user.txt` rule for `responsibility_themes`
    Old snippet:
    ```text
    - responsibility_themes: exactly 6 action-oriented hooks written as "[verb] [specific what]" fragments the resume must demonstrate — not single-word theme labels. Each hook names a concrete capability or outcome the role requires.
    ```
    New snippet:
    ```text
    - responsibility_themes: exactly 6 neutral competency hooks (verb + object), deduped from the JD. Phrase each as a capability category, not a copy-paste responsibility line. Downstream prompts must treat these as a coverage checklist, not prose to reuse.
    ```
    Rationale: the extractor can poison the rewrite if it preserves JD sentence structure. Neutral hooks support translation instead of copying.

30. Target: `apps/backend/app/prompts/text/extract_jd_intel/user.txt` rule for `resume_domain_keywords`
    Old snippet:
    ```text
    - resume_domain_keywords: industry, product, regulatory, and business terms to mirror. Dedupe.
    ```
    New snippet:
    ```text
    - resume_domain_keywords: industry, product, regulatory, and business terms the JD cares about; dedupe. These are context for tailoring, not mandatory mirror phrases. Downstream prompts must not repeat them across summary, stacks, skills, and bullets unless the candidate's work clearly touches that context.
    ```
    Rationale: "mirror" is the wrong verb. It encourages repeated GTO/SAP/process language across the full resume.

31. Target: `apps/backend/app/prompts/text/tailor_resume_full/system.txt` process step 2 and `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `CLAIM POLICY`
    Old snippet:
    ```text
    Map each competency to the strongest resume evidence or a reasonable new claim the user can later prove.
    ```
    New snippet:
    ```text
    Map each competency to the strongest resume evidence first; add broader adjacent framing only when it fits the candidate trajectory and remains interview-defensible. Do not add new named vendor products, customer systems, employers, certifications, or proprietary platforms as "reasonable" claims unless the original resume or user-provided context supports them.
    ```
    Rationale: this keeps our intended plausible-claim lane open, but blocks high-risk inventions like SAP/Miro/Power BI appearing as if they were used in a specific role.

32. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `ATS & NATURALNESS`
    Old snippet:
    ```text
    - Weave keywords throughout: summary, tech stack lines, bullets, skills, project descriptions
    ```
    New snippet:
    ```text
    - Place keywords only where the candidate's story naturally supports them. A keyword appearing once in the right context is better than the same keyword repeated across summary, stacks, bullets, skills, and projects.
    ```
    Rationale: "weave throughout" is a global stuffing command. Targeted placement is more credible to recruiters and still enough for ATS.

33. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` and `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` tech stack rules
    Old snippet:
    ```text
    - Tech stacks: emit tech_stacks for every changed experience and project entry; keep only evidenced tools, ordered by JD relevance
    ```
    New snippet:
    ```text
    - Tech stacks: prefer reordering the original stack over replacing it. Add a JD-cited tool only when supported by the original resume, user-provided context, or the rewritten action. Tech stack values must be named tools, languages, platforms, or frameworks only; never paradigms or methodologies like "Process Optimization" or "Data Analysis".
    ```
    Rationale: run 5 showed both vendor insertion and methodology-as-stack leakage. Stack lines are high visibility and must look factual.

34. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `ROLE TITLE`
    Old snippet:
    ```text
    - Never rename the base title
    ```
    New snippet:
    ```text
    - Never rename or extend the base title. "Data Intern" -> "Data Analyst Intern" is prohibited because it inserts words inside the original title. Only append a comma-separated scope qualifier after the full original title text, and omit it when it sounds like the JD role label.
    ```
    Rationale: title mutation is easy for a human reviewer to notice and makes the resume feel manufactured.

35. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `EDITABLE per entry`
    Old snippet:
    ```text
    - projects: name (enhancement only), tech_stacks, bullets
    ```
    New snippet:
    ```text
    - projects: name (minor reframing only; never add JD-flavored parentheticals like "(Process Automation)", "(Compliance Workflow)", or "(Data Analysis)"), tech_stacks, bullets
    ```
    Rationale: project names are the brand/story anchor. JD parentheticals look like ATS stuffing and create new stories to defend.

36. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `PORTFOLIO PROJECTS` and `TECHNICAL CALIBRATION`
    Old snippet:
    ```text
    - Do not promote tools from tech_stacks into bullet text unless the source bullet already names that tool or the action logically requires it.
    ```
    New snippet:
    ```text
    - Do not promote tools from tech_stacks into bullet text unless the source bullet already names that tool or the action logically requires it.
    - Do not substitute one vendor/UI/BI surface for another to match the JD. If the source says Streamlit, keep Streamlit; do not retarget it to Power BI, Tableau, SAP, Salesforce, or similar JD-listed tools unless source or user context supports that exact tool.
    ```
    Rationale: tool substitution is a clear hallucination pattern and will be caught in interviews.

37. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` under `EDIT SCOPE` and response contract budgets
    Old snippet:
    ```text
    - Experience: emit only changed bullet indexes. At most 1-2 bullets per experience may carry direct JD-specific terms...
    ```
    New snippet:
    ```text
    - Experience: emit only changed bullet indexes. At most 1-2 bullets per experience may carry direct JD-specific terms; for roles with 2 or fewer bullets, touch at most one bullet.
    ```
    Rationale: otherwise short internships or small roles can still become 100% JD rewrite despite the general 1-2 limit.

38. Target: `apps/backend/app/prompts/text/tailor_resume_full/user.txt` under `FULL-RUN SHAPE GUARDS`
    Old snippet:
    ```text
    - Omit unchanged bullet indexes; do not emit all bullets just to show work was considered.
    - Do not compress project bullets: if a project has 3 source bullets, return bullets "0", "1", and "2" as separate lines, not one combined paragraph.
    ```
    New snippet:
    ```text
    - Experience: omit unchanged bullet indexes; only emit the selected rewrites.
    - Projects: preserve source bullet count and shape for every edited project. If a project has 3 source bullets, return "0", "1", and "2" as separate lines, including lightly unchanged bullets when needed to prevent compression.
    ```
    Rationale: the current two rules conflict. Experience wants sparse diffs; projects need shape preservation because they have fewer bullets and are visually easier to distort.

39. Target: critique/rewrite pass prompts, likely `apps/backend/app/prompts/text/critique_resume/*` and `apps/backend/app/prompts/text/rewrite_resume/*`
    Old snippet:
    ```text
    # primary tailoring prompt has anti-JD-mirror and fabrication guards, secondary pass may not
    ```
    New snippet:
    ```text
    Add compact secondary-pass guards:
    - Preserve original resume as the candidate superset; JD is only a prioritization lens.
    - Do not introduce named vendor products, tools, project labels, or role titles not supported by the current resume/user context.
    - Do not increase JD noun repetition, project renaming, bullet count, or basic-tool leakage while improving wording.
    ```
    Rationale: the PDF can reflect a post-tailoring rewrite pass, so the second pass must not undo the primary prompt's constraints.

40. Target: `apps/backend/app/rendering/rendercv_adapter.py` and final metadata cleanup
    Old snippet:
    ```py
    bold_keywords = filter_render_bold_keywords(..., blocked_terms=BASIC_RESUME_TERMS)
    ```
    New snippet:
    ```py
    bold_keywords = filter_render_bold_keywords(
        ...,
        final_resume_text=extract_resume_text(resume),
        blocked_terms=BASIC_RESUME_TERMS | LOW_SIGNAL_JD_TERMS,
        require_present_in_final_text=True,
    )
    ```
    Rationale: prompt-side filtering is not enough. Render-time bold metadata should not highlight terms that are absent, basic, low-signal, or only present because of JD leakage.

41. Target: `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` under `BULLETS`
    Old snippet:
    ```text
    - Vary closers: semicolons with independent clauses, short second sentences, or dashes...
    ```
    New snippet:
    ```text
    - Vary closers: semicolons with independent clauses, short second sentences, or dashes...
    - Every bullet must be grammatically complete after punctuation changes. When using a semicolon, both clauses must be independent and parseable; do not drop punctuation while merging clauses.
    ```
    Rationale: the rendered PDF showed broken clauses. This is a small wording rule with high perceived-quality impact.

42. Target: next-run success criteria/checklist
    Old snippet:
    ```text
    - No section reads like JD copy
    - At least one original story remains per role
    ```
    New snippet:
    ```text
    - "Every bullet connects" and "weave throughout" no longer appear in any live prompt.
    - Responsibility themes are neutral coverage hooks, not JD sentence fragments.
    - No named vendor/tool substitution appears in bullets, stacks, project names, skills, or bold keywords.
    - Short roles with <=2 bullets have at least one untouched recognizable story.
    - Secondary critique/rewrite prompts preserve the same anti-mirror constraints as the primary pass.
    ```
    Rationale: these are the exact failure paths the other model plans surfaced that were not fully captured in the original Codex plan.
