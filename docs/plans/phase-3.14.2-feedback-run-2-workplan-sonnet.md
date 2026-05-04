# Phase 3.14.2 — Feedback Run 2 Workplan

Test run: `docs/plans/test_runs/1d54a17c-f50d-4f5a-9e72-8448fbb63b39`

---

## Confirmed Output Problems

1. Role title regressed (exp[0]): input "Software Engineer, Data Infrastructure & Analytics" → output "Software Engineer, Backend & AI Infrastructure" — wrong direction for a data engineering JD.
2. Kafka invented in bullet: exp[0] bullet[1] — Kafka was in `tech_stacks` but not in the source bullet; LLM upgraded it into "Kafka-based pipelines" without evidence.
3. Summary too long + jargon: "scalable" (banned), "actionable intelligence" (jargon), second sentence runs three visual lines.
4. Bold keywords contain non-technical prose: "Data Engineer", "data infrastructure", "actionable intelligence", "data-driven decisions", "hyperlocal", "marketplace" — not ATS tool names.
5. Project bullet compression: 3-bullet projects collapsed to 1 bullet each, violating the shape guard.
6. "Go" invented in skills: not present in original resume or evidenced in bullets.
7. "quantitative analysis" listed as a skill value: descriptive phrase, not a tool.
8. JD verbatim mirroring: input bullets already copied JD phrases literally ("code-first orchestration frameworks", "deep-dive quantitative analysis", "semantic layer to facilitate self-service analytics for stakeholders"); LLM preserved and extended this pattern.

---

## Numbered Changes

### `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`

**1.**
- Old: `BOLD_KEYWORDS: array of exactly 15 strings from final resume content, chosen for JD alignment`
- New: `BOLD_KEYWORDS: array of exactly 10 strings — tool names, framework names, and specific technical terms only (e.g. Python, ETL/ELT, Apache Airflow, BigQuery, dbt). No prose phrases, no domain words, no job titles, no adjectives. Every entry must be a concrete named technology or technical term a recruiter scanner would match.`
- Why: output had "Data Engineer", "actionable intelligence", "hyperlocal" — none of these are ATS tool tokens. Count reduced from 15; user confirmed "should be limited, not a long line."

**2.**
- Old: `- Two sentences max. Lead with technical domain, then strongest signal and role intent.`
- New: `- Two sentences max, 30 words total. Lead with technical domain and primary tool cluster; close with the strongest differentiator or vertical. No adjective openers, no "X years of experience", no vague qualifiers.`
- Why: output summary was verbose (three visual lines). Word cap forces compression. Keeps the two-sentence rule but adds hard upper bound.

**3.**
- Old (in JARGON list): `synergy, robust, scalable, holistic, proactive, cutting-edge, state-of-the-art, dynamic, innovative, visionary, seamless, game-changer, thought leader, best-in-class, impactful`
- New: same list, no change to the line itself — but add a line immediately below:
  `Apply JARGON and PHRASES bans to summary, role titles, and bullets equally.`
- Why: BANNED PATTERNS section was implicitly bullets-only. Summary still produced "scalable" and "actionable intelligence." Explicit scope makes it clear the ban is global.

**4.**
- Add new rule under SIGNAL & ATS section after the ATS block:
  `JD ALIGNMENT STYLE: Map the candidate's real work to JD themes through shared domain vocabulary, not verbatim phrase borrowing. The reader should recognize fit from what was built and how — not from seeing JD sentences reflected back. If a bullet reads like a paraphrased JD responsibility, rewrite it around the candidate's actual mechanism and outcome.`
- Why: both input and output had bullets that read like JD paraphrases ("code-first orchestration frameworks", "deep-dive quantitative analysis"). User explicitly wants broader framing — manager should feel the candidate has done comparable/greater work, not that they copied the job post.

**5.**
- Add under BULLET POLICY (OUTPUT CONTRACT section), as a hard rule after the existing bullet lines:
  `Project bullet count is locked: emit the same number of bullets as the source project. If source has 3 bullets, output must have "0", "1", and "2" — never combine or drop. Violation renders the output malformed.`
- Why: the existing shape guard in user.txt was ignored; this needs to be inside the OUTPUT CONTRACT where the LLM processes it as a hard format rule, not a soft guard.

**6.**
- Add under SKILLS block:
  `Emit only skills present in the original resume's skills groups or directly evidenced in a tech_stacks line. Do not add skills the original does not contain. Skill values must be specific tool or technology names — not descriptive phrases (e.g. "PostgreSQL" yes, "quantitative analysis" no).`
- Why: "Go" was added without any evidence. "quantitative analysis" appeared as a skill value. Both are prohibited by this rule.

**7.**
- Add under TECHNICAL CALIBRATION:
  `Do not promote tools from tech_stacks into bullet text unless the source bullet already names that tool or the bullet's described action logically requires it. A tool being in the header does not mean every bullet used it.`
- Why: "Kafka-based pipelines" was written because Kafka was in tech_stacks, but the source bullet only said "APIs and logs." This invents specificity the candidate may not be able to defend.

---

### `apps/backend/app/prompts/text/tailor_resume_full/user.txt`

**8.**
- Old (FULL-RUN SHAPE GUARDS): `Position qualifiers must follow the JD's target role domain; avoid generic AI/backend labels unless the source evidence and JD both justify them.`
- New: `Position qualifiers must reinforce the JD's primary domain (e.g., for a data engineering JD, qualifiers must name data/analytics scope — not backend, AI, or infra unless both the JD and source bullets explicitly justify it). When in doubt, keep the existing qualifier or omit rather than adding an off-domain label.`
- Why: exp[0] title was changed from "Data Infrastructure & Analytics" to "Backend & AI Infrastructure" — a regression away from the JD's data engineering focus. The old rule was too soft ("avoid unless justified"); this makes the default lean toward preservation.

**9.**
- Old (EDIT SCOPE Projects line): `- Projects: rewrite all; keep the same bullet count as each source project unless RESPONSE CONTRACT says a different count`
- New: `- Projects: light-touch rewrite only — preserve core content and structure, adjust framing and vocabulary for JD context. Do not change the technical claim, mechanism, or outcome; only re-angle how they are described. Keep exact bullet count.`
- Why: user's current custom need is to retain projects close to original. Also addresses the compression issue (3→1 bullets). "Rewrite all" gave the LLM too much latitude.

---

### `apps/backend/app/prompts/text/tailor_resume_full/system.txt`

**10.**
- Add to PROCESS step 2 (after "Map each theme to the strongest honest evidence in the resume."):
  `Do not borrow JD vocabulary to describe the candidate's work. Translate — identify what the candidate built that serves the same function, and describe it in the candidate's own engineering terms.`
- Why: reinforces the anti-mirroring principle at the thinking/planning stage, before any output is written.

---

## Notes

- **Custom project retention** (changes 8–9) is temporary. User may update EDIT SCOPE directly between runs. The plan here establishes "light-touch rewrite" as the baseline — override with "deep rewrite" in PRIMARY RUN RULES if needed for a specific application.
- Bold keyword count reduced 15→10 based on user preference ("limited, not a long line"). Can be adjusted.
- All changes are to prompt `.txt` files and system.txt — no code changes required.
