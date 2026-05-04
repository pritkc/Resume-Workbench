# Phase 3.14.3 — Feedback Run 4 Workplan

Test run: `docs/plans/test_runs/fbb69720-bcb3-4541-951f-c7b2a44841a4`
JD: SAP Process Analyst (stretch/pivot role — candidate is a data/software engineer)

---

## Root Cause Summary

**Bullet leakage (code bug):** `apply_compact_diff` in `preservation.py` calls `split_experience_bullets_for_llm_indexing(entry)` AFTER it has already updated `entry["techStack"]` to the new value from the diff. The split function checks `description[0] == tech_stacks`. When the tech stack changes, `description[0]` (the old tech stack string, stored as the first description item in legacy resumes) no longer matches the new value, so the prefix is NOT stripped. Result: `desc` has N+1 items, LLM writes N bullets, last original bullet leaks through unchanged. Affects every experience entry where tech_stacks changes.

**JD fabrication (prompt):** LLM is treating `resume_technical_keywords` as a license to add any JD tool to the resume — SAP, Miro, Power BI were added to tech_stacks, bullets, and skills despite being absent from the original. The cleanup catches fabricated skills but not fabricated tech_stacks or bullet content.

**JD saturation (prompt):** Every bullet, title, and skill was rewritten to mirror the JD. User wants max 1-2 bullets per role aligned to JD themes; the rest should represent the candidate's authentic work.

**Basic tools appearing everywhere (prompt):** Excel, JIRA, Miro appearing in tech_stacks headers and bullet text. User wants these never mentioned.

---

## Code Change

### `apps/backend/app/services/tailoring/preservation.py` — `apply_compact_diff`

**1.**
- Target: inside the `for entry_idx_str, entry_diff in section_diff.items()` loop, at the point where `split_experience_bullets_for_llm_indexing(entry)` is called (currently line ~386, after both position and tech_stacks updates)
- Fix: move the `split_experience_bullets_for_llm_indexing(entry)` call to BEFORE the tech_stacks update. Pre-compute `prefix, desc` on the original entry, then reference that result when applying bullets.

Old order (condensed):
```
entry = entries[entry_idx]
update position → entry
update tech_stacks → entry["techStack"]  ← entry is now mutated
...
if bullets_diff:
    prefix, desc = split_experience_bullets_for_llm_indexing(entry)  ← uses NEW tech_stacks; breaks legacy prefix detection
```

New order:
```
entry = entries[entry_idx]
if diff_key == "experience":
    _pre_prefix, _pre_desc = split_experience_bullets_for_llm_indexing(entry)  ← called on ORIGINAL entry
update position → entry
update tech_stacks → entry["techStack"]
...
if bullets_diff:
    if diff_key == "experience":
        prefix, desc = _pre_prefix, list(_pre_desc)  ← use pre-computed split
    else:
        prefix = []
        desc = list(TailoringProject.from_resume_entry(entry).description)
```

- Why: the split compares `description[0]` against the tech_stacks string. If tech_stacks changes before the split, the prefix is not detected, `desc` grows by 1, and the last original bullet leaks. Pre-computing before any mutation fixes this for all entries regardless of whether tech_stacks changes.

---

## Prompt Changes

### `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`

**2.**
- Add as a new block at the top of `--- SIGNAL & ATS ---`, before TWENTY-SECOND SKIM:

```
FABRICATION GUARD:
- Never introduce a tool, platform, or system that is not already present in the original resume's skills, tech_stacks lines, or bullet text — regardless of JD requirements.
- If a JD keyword (e.g., SAP, Miro, Power BI, Salesforce) is absent from the original resume, it must not appear anywhere in the output: not in tech_stacks, bullets, skills, or bold_keywords.
- This applies even when the JD lists it as a hard requirement. The candidate's actual skills are the constraint; fabrication cannot bridge a genuine gap.
```

- Why: SAP, Miro, Power BI were added throughout the output despite the candidate having none of these. The cleanup removes them from skills but not from tech_stacks or bullets. This rule prevents insertion at the source.

**3.**
- Old (SIGNAL & ATS): `JD is a lens, not a script: translate the candidate into a broader impressive profile where JD alignment is a subset.`
- New:
```
JD SATURATION LIMIT:
- At most 1-2 bullets per experience entry should directly reference JD-specific themes or terminology. The remaining bullets must represent the candidate's authentic work in their natural engineering language.
- The resume should read as a strong engineer who happens to fit this role — not as someone who built their career around this exact JD. A hiring manager reading the full resume should see depth beyond the JD requirements.
- JD alignment is the lens for ordering and emphasis, not the content of every sentence.
```

- Why: every bullet was rewritten to mirror the JD (SAP process analysis, Miro workflows, Power BI dashboards). User wants the majority of bullets to reflect who the candidate actually is; 1-2 per role show JD fit.

**4.**
- Add as a new rule at the bottom of `--- SIGNAL & ATS ---`:
```
BASIC TOOLS:
- Never include commodity office tools in any section: Excel, Word, PowerPoint, Google Sheets, Outlook, Slack, Teams, JIRA, Confluence, Notion.
- These must not appear in tech_stacks headers, bullet text, skills values, or bold_keywords — even if the JD requires them. They waste space and signal a weak technical profile.
```

- Why: Excel appeared in tech_stacks for 4 roles, in 2 project tech_stacks, and in bold_keywords. JIRA appeared in skills. User explicitly requested these never appear.

**5.**
- Old (SUMMARY rule): `One sentence only, target 120-155 characters; must fit in 1-2 resume lines after rendering.`
- New: `One sentence only, target 120-155 characters. The summary reflects the candidate's actual engineering domain and identity — not the JD's role label. If the JD is a pivot role (business analyst, process analyst, ops), write the sentence from the candidate's engineering perspective showing transferable depth, not as a rebranded version of the JD title.`
- Why: output was "Process analyst and data specialist optimizing enterprise workflows, SAP systems..." — fully rebranded as the JD persona, erasing the candidate's engineering identity.

**6.**
- Old (BOLD_KEYWORDS rule): `BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms from final resume content`
- New: `BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms that (a) appear in the final resume and (b) are present in the original resume's actual skills or evidenced tech. Do not bold-keyword fabricated or injected tools.`
- Why: bold_keywords had "Excel", "Miro", "Process Mapping", "Workflow Visualization", "Global Trade", "Supply Chain" — none evidenced in the original resume. These are not stripped by cleanup and appear as misleading highlights.

---

### `apps/backend/app/prompts/text/tailor_resume_full/user.txt`

**7.**
- Old (ATS keyword usage in JD INTELLIGENCE block): `ATS keyword list (exact forms, exact capitalization): $extract_jd_intel_output.resume_technical_keywords`
- New: `ATS keyword list — place only keywords already evidenced in the original resume; skip any keyword not in the candidate's actual background: $extract_jd_intel_output.resume_technical_keywords`
- Why: `resume_technical_keywords` contained SAP, Excel, Miro, Power BI. The LLM treated these as instructions to insert them, rather than checking whether the candidate actually has those skills.

**8.**
- Old (EDIT SCOPE Skills line): `- Skills: restructure into exactly 5 groups; preserve impressive superset skills after JD-critical groups`
- New: `- Skills: restructure into exactly 5 groups; JD-evidenced skills lead each group, but the section must show the full engineering profile — not a JD mirror. Never add skills absent from the original.`
- Why: reinforces #2 (FABRICATION GUARD) at the scope level, and keeps the "superset" framing visible for the LLM.

---

### `apps/backend/app/prompts/text/tailor_resume_full/system.txt`

**9.**
- Old (PROCESS step 2): `Map each competency to the strongest resume evidence or a reasonable new claim the user can later prove.`
- New: `Map each competency to existing resume evidence only. Do not introduce tools, platforms, or credentials not already present. If the candidate lacks a JD requirement entirely, represent the closest honest evidence — do not fabricate coverage.`
- Why: closes the door on the LLM's "I'll add SAP because it's required" reasoning, at the planning step before any output is written.

---

## Notes

- Code change (#1) is a prerequisite for bullet-count correctness regardless of JD. Prompt changes (#2–9) address the JD fabrication and saturation separately.
- The skills cleanup code (`fix_alignment_violations`) is working correctly — it caught and removed SAP, Miro, Power BI, Excel, Process Mapping from the skills section. The gap is that it doesn't cover tech_stacks headers and bullet text. Changes #2 and #7 close that gap on the prompt side.
- No changes to extract_jd_intel prompts needed; the keywords it extracts (SAP, Miro) are accurate for the JD. The problem is how the tailoring prompt uses them.
- BASIC TOOLS (#4) is a permanent rule. FABRICATION GUARD (#2) is also permanent. JD SATURATION LIMIT (#3) is the core philosophy change the user is asking for and applies to all future runs.
