# Phase 3.14.4 — Final Feedback Workplan

Test run: `docs/plans/test_runs/2ae93156-1336-4750-b250-81d9a8436775`
JD: SAP Process Analyst (stretch pivot). Bullet leakage is resolved. Primary open issues below.

---

## Confirmed Issues in PDF

- Summary rebrand: "Data and process analyst optimizing enterprise workflows, SAP integrations..." — candidate identity erased
- Fabricated tools still in tech_stacks and bullets: Miro (Humana bullet 1, GoFundMe stack), Power BI (LogLens project stack and bullet)
- Base title mutation: "Data Intern" → "Data Analyst Intern" — "Analyst" added inside the base title
- Project tech_stacks contain paradigms: "Process Optimization" (ClaimSight), "Data Analysis" (FundFlow)
- JD-flavored parentheticals in project names: "(Compliance Workflow)", "(Data Analysis)"
- Skills shows 4 groups in PDF (cleanup strips fabricated group every run) instead of 5
- Missing punctuation in two Humana bullets (semicolons dropped mid-sentence)
- Every bullet still JD-aligned despite 1-2 limit in EDIT SCOPE — contradiction with line 19 of user.txt
- Verbose metric notation wastes space: "~5 hours/week", "~6 hours/week to ~45 minutes", "45+ minutes to ~12 minutes"
- ATS keywords from JD placed everywhere regardless of original evidence (Miro, SAP, Power BI)

---

## Root Cause: The Internal Contradiction

`user.txt` line 19 says: **"every bullet connects to at least one"** rewrite angle.

This overrides the 1-2 bullet limit stated in EDITORIAL SEQUENCE, EDIT SCOPE, and JD ALIGNMENT STYLE. The LLM resolves conflicts by following the instruction closest to the data — which is line 19, right next to the rewrite angle list. Everything else in the prompts that limits JD saturation is rendered ineffective by this single line.

---

## Numbered Changelist

---

### `apps/backend/app/services/tailoring/preservation.py` — `apply_compact_diff`

**1. Bullet leakage fix — pre-compute split before tech_stacks update**
- Old: `split_experience_bullets_for_llm_indexing(entry)` called after `entry["techStack"]` is set to the new diff value
- New: call `split_experience_bullets_for_llm_indexing(entry)` immediately after `entry = entries[entry_idx]`, before any field updates; store result as `_pre_prefix, _pre_desc`; in the bullets block, use `prefix, desc = _pre_prefix, list(_pre_desc)` instead of re-calling
- Why: when tech_stacks changes, the new value doesn't match description[0] (the old stack string in legacy entries), so the prefix isn't stripped; desc grows by 1; last original bullet leaks. Pre-computing before mutation fixes this permanently.

---

### `apps/backend/app/prompts/text/tailor_resume_full/system.txt`

**2. Add CANDIDATE POSITIONING block after ROLE & GOAL**
- Old: _(no such block)_
- New:
```
CANDIDATE POSITIONING:
The original resume is a superset (B) of what any individual JD (A) requires. The tailored output must present B in a way that surfaces A-aligned evidence near the top of each section — without replacing B with A. A hiring manager reading the final resume should think: "this person can do what the JD asks, and has done more." The resume must not mirror the JD; it must read like a strong engineer who naturally fits this role. Fabricated credentials and JD-copied language are both detectable and will cause rejection.
```
- Why: establishes the superset philosophy explicitly at the top level so the LLM carries it through all subsequent reasoning steps.

**3. PROCESS step 2 — remove fabrication license**
- Old: `Map each competency to the strongest resume evidence or a reasonable new claim the user can later prove.`
- New: `Map each competency to the strongest existing resume evidence. If the candidate lacks a JD competency entirely, skip it — do not invent coverage.`
- Why: "new claim the user can later prove" is the primary license for inventing SAP, Miro, Power BI experience. Removing it closes the gap.

**4. PROCESS step 3 — decouple "strongest" from JD-matching**
- Old: `Rewrite, leading each role with its strongest matching bullet.`
- New: `Lead each role with its single strongest bullet overall — the most concrete, most impressive, most technically specific. JD alignment in hero position is a bonus, not a requirement.`
- Why: "strongest matching bullet" means strongest JD-matching bullet, which forces the hero slot to always be JD-aligned and sets the tone for the whole role.

---

### `apps/backend/app/prompts/text/tailor_resume_full/user.txt`

**5. Remove the internal contradiction in the rewrite angles label (CRITICAL)**
- Old: `Rewrite angles (one per role; every bullet connects to at least one): $extract_jd_intel_output.responsibility_themes`
- New: `Rewrite angles — use these to identify which 1-2 bullets per role most naturally map to JD themes; rewrite those selected bullets only; leave other bullets unchanged or lightly polished: $extract_jd_intel_output.responsibility_themes`
- Why: "every bullet connects to at least one" directly contradicts the 1-2 bullet limit in EDITORIAL SEQUENCE, EDIT SCOPE, and JD ALIGNMENT STYLE. The LLM follows this instruction because it sits adjacent to the actual data. This is the single most important fix.

**6. ATS keyword label — clarify constraint**
- Old: `ATS keyword list (translation candidates, not mandatory insertions):    $extract_jd_intel_output.resume_technical_keywords`
- New: `JD terms — place only those already evidenced in the original resume; skip any term not in the candidate's background: $extract_jd_intel_output.resume_technical_keywords`
- Why: "ATS keyword list" signals mandatory use. The label needs to signal a filter, not an injection list.

**7. Tech stacks EDIT SCOPE — prefer reorder over replace**
- Old: `- Tech stacks: emit tech_stacks for every changed experience and project entry; keep only evidenced tools, ordered by JD relevance`
- New: `- Tech stacks: prefer reordering the original tech stack (JD-cited evidenced tools first) over replacing it. Add a JD-cited tool only when it appears elsewhere in the original resume. Never add a tool absent from the original. Tech stack values must be named tools, languages, or platforms only — not paradigms or methodologies.`
- Why: current rule causes complete tech stack replacement. "Process Optimization", "Data Analysis" appeared as tech stack values. Both problems addressed here.

**8. Project bullets shape guard — resolve omit vs count conflict**
- Old line 32: `- Omit unchanged bullet indexes; do not emit all bullets just to show work was considered.`
- Old line 33: `- Do not compress project bullets: if a project has 3 source bullets, return bullets "0", "1", and "2" as separate lines, not one combined paragraph.`
- New (merge both into one coherent rule):
```
- For experience: omit unchanged bullet indexes — only emit the 1-2 JD-aligned rewrites.
- For projects: always emit all bullet indexes, including unchanged ones. If source has 3 bullets, output must include "0", "1", and "2". Project bullets are few and must not be compressed.
```
- Why: the two rules conflict — "omit unchanged" vs "emit all". For experience it's correct to omit (only 1-2 rewrites). For projects with 1-3 bullets, emitting all is required to prevent compression.

---

### `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`

**9. Add FABRICATION GUARD block at top of SIGNAL & ATS section**
- Old: _(no such block)_
- New (add before TWENTY-SECOND SKIM):
```
FABRICATION GUARD:
- A tool, platform, or credential absent from the original resume must not appear anywhere in the output — not in tech_stacks, bullets, skills, or bold_keywords — regardless of JD requirements.
- If the JD requires a skill the candidate genuinely lacks (SAP, Miro, Power BI), represent the closest honest evidence in engineering terms. Do not fabricate coverage.
- Exception: the Sudathi/logistics role may reference SAP ERP in passing if the original bullet already names it as the integration target.
```
- Why: SAP, Miro, Power BI are being inserted throughout every run despite absence from the original resume. The cleanup code strips fabricated skills but cannot strip fabricated tech_stacks or bullet text. This guard stops fabrication at the source.

**10. ATS & NATURALNESS — replace "weave throughout" with targeted placement**
- Old: `- Weave keywords throughout: summary, tech stack lines, bullets, skills, project descriptions`
- New: `- Place keywords where the candidate's original evidence naturally supports them. Do not force a keyword into every section. A keyword appearing once in the right context outperforms the same keyword appearing six times in forced contexts.`
- Why: "weave throughout" is the instruction that sends keywords into every bullet, every tech stack, every project. This is precisely the "everything matches the JD" pattern hiring managers now filter for.

**11. ATS & NATURALNESS — add gap skill prohibition**
- Old: _(no explicit rule about skills absent from original)_
- New (add after the "weave throughout" replacement):
`- Do not use a JD keyword that is absent from the original resume — in any section. Absence means the candidate lacks it; inserting it is fabrication.`
- Why: makes the fabrication guard explicit at the ATS layer where keyword placement decisions are made.

**12. ROLE TITLE — make base title prohibition specific**
- Old: `- Never rename the base title`
- New: `- Never rename or extend the base title. "Data Intern" → "Data Analyst Intern" is prohibited (adds words inside the base title). Only a comma-separated scope qualifier may be appended after the full original title text.`
- Why: "Data Intern" was changed to "Data Analyst Intern" — "Analyst" was inserted into the base title. The current rule says "never rename" but the LLM interpreted adding a word as "enhancing" rather than renaming.

**13. SKILLS — add explicit no-fabrication rule**
- Old: `- Skill values must be specific tool, product, method, or technology names — not descriptive phrases.`
- New: `- Skill values must be specific tool, product, method, or technology names — not descriptive phrases. Never add a skill value absent from the original resume, regardless of JD requirements.`
- Why: skills are currently the entry point for fabricated credentials (SAP, Miro, Power BI, Process Mapping, Workflow Visualization, Data Analysis all appeared as skills despite being absent from original).

**14. Add compact metric notation rule under WRITING RULES → BULLETS**
- Old: _(no metric format rule)_
- New (add after the existing BULLETS metric rule):
`- Use compact metric notation: "5h/wk" not "~5 hours/week"; "45min" not "~45 minutes"; "~12min" not "~12 minutes"; "$10K" not "$10,000". Save the freed space for additional technical content.`
- Why: user explicitly flagged "~6 hours/week, 45+ minutes to ~12 minutes. they're full names taking unwanted spaces." Compact notation adds one line of technical content per role.

**15. SUMMARY — anchor to candidate identity more forcefully**
- Old: `- Summary must position the candidate broadly; do not lead with the JD title when the source resume shows a stronger wider profile.`
- New: `- Summary must open from the candidate's engineering identity (their actual tech domain and strongest tool cluster), not the JD's role label. If the candidate is a data engineer applying for a process analyst role, the summary says "data engineer" or "software engineer" — not "process analyst." JD alignment in the summary appears only in the second half as a domain or outcome phrase.`
- Why: output was "Data and process analyst optimizing enterprise workflows, SAP integrations..." — full persona replacement. The current rule said "do not lead with JD title" but "process analyst" appeared as the very first words.

**16. Add PROJECT NAMES rule under FIELD CONTRACTS → EDITABLE**
- Old: `- projects: name (enhancement only), tech_stacks, bullets`
- New: `- projects: name (minor reframing only — never add JD-flavored parentheticals like "(Process Automation)" or "(Data Analysis)"; the original name is the brand), tech_stacks, bullets`
- Why: "ClaimSight (Compliance Workflow)", "FundFlow (Data Analysis)", "LogLens (Workflow Visualization)" all had JD-flavored parentheticals added to the project names. These read as ATS stuffing and make the projects look fabricated.

**17. Add bullet punctuation rule under WRITING RULES → BULLETS**
- Old: _(no rule about complete sentence structure)_
- New (add after the BULLETS structure rule):
`- Every bullet must be grammatically complete. When using a semicolon, both clauses must be independent and parseable. Do not drop the semicolon when combining two clauses (e.g., "into PostgreSQL claims analytics moved" is a merge error — include the semicolon).`
- Why: Humana bullets 2 and 5 had semicolons dropped mid-sentence in the rewrite pass, producing ungrammatical output.

---

## Observations / Edge Cases Not Yet Addressed

**Critique + rewrite pass (second LLM pass):** The `respose.txt` file captures the primary tailoring output. The PDF reflects the rewrite pass output — which is also capable of introducing fabrications and JD saturation. The critique prompt (`apps/backend/app/prompts/text/critique_resume/`) and rewrite prompt (`rewrite_resume/`) inherit the same issues but are not currently governed by the fabrication guard or saturation limit. If changes 3–17 are applied to the primary pass only, the rewrite pass can undo them. Recommend adding a compact `CANDIDATE POSITIONING` note and `FABRICATION GUARD` to the rewrite prompt system message.

**Bold keywords cleanup gap (code):** Bold keywords are not validated against the final resume by cleanup code. Fabricated bold keywords (SAP, Miro, Power BI, Process Mapping) persist through to the PDF even after the cleanup strips them from skills. Either: (a) validate bold_keywords in `preservation.py` against `_all_skill_values(result)` after cleanup, filtering out terms not in the final resume text; or (b) the prompt-side fabrication guard (change 9) prevents them from being generated in the first place. Option (b) is preferred — option (a) is a safety net.

**Story stability across runs:** The user's deepest concern is not having to re-prepare interview stories each time. The changes above (especially #5 "leave other bullets unchanged") directly address this. Worth verifying in the next test run by checking how many of the original bullet texts survive word-for-word vs. how many were rewritten.

**Skills group count:** Skills shows 4 groups every run because the cleanup strips the fabricated 5th group. If fabrication is prevented at the prompt level (changes 9, 11, 13), the LLM will generate 5 groups from the candidate's actual tools and all 5 will survive cleanup.
