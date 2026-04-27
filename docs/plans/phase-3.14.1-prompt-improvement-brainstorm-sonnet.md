# Phase 3.14.1 — Prompt Improvement Brainstorm

**Scope:** `extract_jd_intel`, `tailor_resume_full`, `critique_resume`, `cover_letter`, `answer_questions`  
**Excluded from this pass:** `parse_resume`, `enrichment/*`, `rewrite_resume`, `tailor_resume_lite`  
**Date:** 2026-04-26  
**Author:** Claude Sonnet 4.6 (analysis)

---

## Executive Summary

The prompts cover the main workflows well and have clear writing standards. However, there are five recurring problems across the set:

1. **Anemic system prompts** — `cover_letter` and `answer_questions` put nearly all instructions in the user prompt. This inverts the proper system/user split.
2. **Internal redundancy in `tailor_resume_full`** — the APPROACH block and TAILORING MODE block repeat 4+ instructions verbatim, wasting tokens and risking contradictory interpretations.
3. **Missing original-resume context in `critique_resume`** — the model can't distinguish scope inflation added during tailoring from scope that was always in the candidate's resume.
4. **Stubbed-out language support** — `del language` in `generate_cover_letter_and_outreach` silently drops multilingual support; no prompt handles non-English output.
5. **No type-aware question handling in `answer_questions`** — behavioral, factual, legal, and creative questions are all treated the same way.

---

## 1. `extract_jd_intel`

**Files:** `text/extract_jd_intel/system.txt`, `text/extract_jd_intel/user.txt`

### 1.1 Redundancy

The system.txt is a subset of the rules already written in user.txt. Specifically, the following rules appear in both files:

- `role.title: strip company name, location, employment type...`
- `location: return only City, ST...`
- `company.product_context: infer from...`
- `responsibility_themes: distill into themes...`
- `ats_keywords: include every technical and domain term...`
- `bold_keywords: the highest-signal keywords...`
- `calibration.seniority_expectations: interpret what scope...`
- `Use null for missing scalars, [] for missing arrays`

The system.txt is a verbatim extraction from the bottom of user.txt. This means the model receives the same rules twice — once as system context and again in the user message. **Recommendation:** System.txt should carry only the persona and non-negotiable constraints (e.g., "output valid JSON only, no prose"). The rules belong in user.txt (where the schema lives).

### 1.2 Schema Issues

**`seniority` enum is incomplete.** The enum is `junior | mid | senior | staff | principal | lead` but common JD levels like `director`, `vp`, `manager`, `c-level`, `associate`, and `executive` are missing. A "Director of Engineering" role will likely get labeled `senior` or `lead`, losing signal.

**`requirements.years` example is confusing.** The schema shows `"years": 5` as an example integer. The LLM may pattern-match on this and output `5` for any role that doesn't state years explicitly. The schema should show `"years": 3` or use `null` as the example and explicitly say "integer or null".

**`location` is US-only.** The app supports ES/ZH/JA and may serve non-US users. The instruction to return only `City, ST` format will fail silently for roles in Toronto, London, Berlin, or Tokyo. For international JDs the field goes empty, losing useful signal. **Recommendation:** Either extend the format to handle international (e.g., `"City, Country"` for non-US), or add a `location_raw` field for the unprocessed value.

**`company.scale_signals` has no max count.** The model could return dozens of items. A limit of 5 is sensible.

**`ats_keywords` has no count guidance.** "Be thorough" can yield 5 or 80 keywords. A range like "20–50" would normalize output across JD styles.

**`responsibility_themes` says "5-8" but there is no enforcement instruction.** The model may return 3 for simple JDs or 12 for complex ones. Explicit count or instruction to consolidate would help.

### 1.3 Missing Guardrails

**No hallucination guard for `product_context`.** "Infer from team/division description what they build" invites fabrication when the JD is vague. Should instruct: "If inference is uncertain, use the company name + division. Do not speculate beyond what the JD states."

**No instruction for incomplete or noisy JDs.** Many real JDs are marketing copy, LinkedIn reposts, or truncated. No guidance exists for what to do when the JD is clearly a boilerplate or lacks technical content.

**No instruction for non-tech roles.** A sales, marketing, operations, or finance JD will be processed by the same prompt. The technical fields (`primary_stack`, `infrastructure`, `paradigms`) will be empty or nonsensical. There is no instruction like "leave technical fields empty for non-engineering roles."

### 1.4 Missing Elements

- No guidance on distinguishing hard requirements (`must_have`) from soft ones (`preferred`) when the JD blends them in prose form.
- The `calibration.team_context` field ("IC, tech lead, cross-team, org-wide") has no description of what options are valid, making outputs inconsistent.
- The `function` field ("full-stack, backend, data engineering, devops, etc.") would benefit from an exhaustive enum to avoid free-form invention.

---

## 2. `tailor_resume_full`

**Files:** `text/tailor_resume_full/system.txt`, `text/output_file_schema_rules/resume_diff_output.txt`, `text/tailor_resume_full/user.txt`

### 2.1 Internal Redundancy (Critical)

The system.txt has two sections — **APPROACH** and **TAILORING MODE: Full edit** — that repeat nearly the same instructions:

| Instruction | In APPROACH | In TAILORING MODE |
|---|---|---|
| Replace least relevant bullets | "You may replace the least relevant bullets..." | "Replace the least applicable bullets..." |
| Enhance titles | "Titles may be enhanced: add platform, domain..." | "Enhance titles with platform, domain, or scope context..." |
| Calibrate to experience level | "Calibrate scope to experience level: early career..." | "Calibrate scope to experience level: early career..." (word-for-word) |
| For projects, relate to company domain | "For projects, naturally relate them to..." | "For projects, relate them to the company's products..." |

This is word-for-word duplication of 4 instructions. It wastes tokens (which matters for budget and context window) and risks confusing the model when the two instances have slight wording differences.

**Recommendation:** APPROACH should state the strategic goal ("what") at high level. TAILORING MODE should contain all implementation rules ("how"). Remove duplicates from APPROACH.

### 2.2 Missing Writing Standards

**Banned word list is incomplete.** The list covers corporate jargon ("spearheaded", "leveraged") but misses the most common bad resume words:
- `proven track record` / `track record of`
- `results-driven` / `results-oriented`
- `team player` / `collaborative`
- `passionate about`
- `dynamic` / `innovative` / `visionary`
- `self-starter`
- `detail-oriented` / `detail-driven`
- `go-getter`
- `thought leader`
- `game-changer`

**No instruction against trailing prepositional phrases.** A common LLM failure is sentences like "Built microservices deployed on Kubernetes in order to improve reliability" — the "in order to" clause is weak and redundant. The existing rule covers "enhancing system reliability" but not the `in order to` / `as part of an effort to` pattern.

**No instruction about bullet length.** Bullets can range from 6 words to 4 sentences. There is no guidance on ideal length (typically 1-2 lines / 12-25 words).

### 2.3 Missing Guardrails

**No protection for non-rewritable fields.** The prompt can technically rewrite experience dates, company names, or education — things that must never be changed. The output schema (`resume_diff_output.txt`) does say `Do NOT emit: id, company, location, dates...` but this is the output schema, not the writing instructions. A model that ignores schema constraints would produce falsified content with no safety net.

**No guardrail on bullet count changes.** The diff format allows adding and replacing bullets by index, but gives no instruction on whether the model may change the total number of bullets per role. A model could provide 8 bullets for a 2-entry role or drop to 1. The prompt should specify: "Do not change the total bullet count per role unless replacing."

**No instruction for career changers or very short tenures.** A candidate with 2 years of experience switching from marketing to software engineering has a special challenge. The prompt should acknowledge: "If the candidate's background is in a different domain, focus on transferable skills and avoid overstretching scope claims."

**No instruction for what to do when the JD is highly specialized** (niche hardware, rare domain expertise) and the resume has zero overlap. Currently the model would either hallucinate relevance or produce weak bullets.

### 2.4 Response Contract Context

The `$response_contract` variable is injected into the user prompt with no explanation label. The model receives a raw JSON blob with no header or context. This should be labeled:

```
RESPONSE CONTRACT (allowed fields and structure for this resume):
$response_contract
```

Without a label, a model that has never been tuned on this system's format may misinterpret the response contract as part of the resume data.

### 2.5 ATS Optimization Gaps

**No instruction against keyword stuffing in the profile summary.** The summary is where keyword stuffing is most tempting and most visible to hiring managers. The current instruction says "place the highest-priority keywords early in bullets and in the profile summary" without adding "but don't make the summary a keyword list."

**No instruction on keyword case sensitivity.** ATS systems often distinguish "JavaScript" from "javascript". The instruction says use exact forms ("Spring Boot" not "Spring framework") but does not say "preserve the capitalization from the JD exactly."

---

## 3. `critique_resume`

**Files:** `text/critique_resume/system.txt`, `text/critique_resume/user.txt`

### 3.1 Missing Critical Context

**The original resume is not available.** The critique model receives only the tailored diff and the JD intelligence. It cannot:
- Distinguish scope claims that were already in the original resume (candidate's authentic language) from scope claims added during tailoring (potential hallucinations).
- Tell whether a "senior architect" bullet existed before tailoring or was added.
- Evaluate whether changed metrics are reasonable for the original tenure.

**Recommendation:** Pass the original resume as an additional context block. This could be gated behind a flag since it increases token cost.

### 3.2 Persona Is Too Narrow

"Senior hiring manager at a top tech company" is inappropriate for:
- Design roles (needs a design-literate reviewer)
- Product management (PM reviewers have different red flags)
- Data science / ML (different standards for claims about model performance)
- Operations, finance, marketing (non-tech roles)
- Government/academic positions (different conventions entirely)

**Recommendation:** Make the persona role-adaptive: "You are a senior hiring manager reviewing a candidate for a [role.function] role at [company.domain]." This requires injecting JD-derived context into the system prompt.

### 3.3 Severity Definitions Missing

The output schema includes `"severity": "high|medium|low"` but there are no definitions:
- **High:** What makes a red flag high-severity? Fabrication? Scope 3x what's credible?
- **Medium:** Vague but not credible? Missing keywords?
- **Low:** Style issues? Minor wordsmithing?

Without definitions, severity is assigned randomly across calls, making the downstream UI misleading.

### 3.4 Suggestions Field Underspecified

```json
"suggestions": ["Actionable suggestion 1"]
```

There is no guidance on:
- How many suggestions (3? 10?)
- Whether suggestions should reference a specific location
- Whether suggestions should include example rewrites or just describe the problem
- Whether suggestions should avoid recommending invented content

### 3.5 Missing Guardrail: No Hallucination in Suggestions

The model could suggest "Add a bullet about leading a team of 8 engineers" even if no such evidence exists. The prompt should include: "Suggestions must be grounded in the candidate's actual background. Do not suggest adding content that isn't supported by the supplied context."

### 3.6 Location Notation Not Documented for Non-Bullet Fields

The prompt gives `"experience.0.bullets.2"` as an example location, but gives no examples for:
- `summary` section
- `skills` section
- `projects.0.name`
- `experience.0.position` (title)

The critique model won't know whether `summary` or `skills.0.values.2` are valid location strings.

---

## 4. `cover_letter`

**Files:** `text/cover_letter/system.txt`, `text/cover_letter/user.txt`

### 4.1 Inverted System/User Split

The system.txt is a single sentence:
> "You write concise, professional cover letters and outreach messages grounded only in provided context. Output plain text only using the exact wrapper tags for the cover letter and outreach message. No markdown, no placeholders, no extra commentary."

Nearly all substance is in user.txt. This is backwards. System prompts should carry:
- Persona and role
- Non-negotiable output constraints (format, no markdown)
- Style and tone defaults
- Grounding rules (no invented content)

User prompts should carry data (JD, resume, job_target) and task-specific format instructions. **Recommendation:** Move grounding rules, style guidance, and the "facts only" instruction to the system prompt. Leave data blocks and wrapper format in user.

### 4.2 Language Support Is Silently Dropped

The service calls `del language` immediately:

```python
async def generate_cover_letter_and_outreach(
    resume_data, job_description, language="en"
):
    del language  # ← language is silently discarded
```

For a multilingual app (en/es/zh/ja), this means all cover letters and outreach messages are always generated in English regardless of the user's locale. The prompt itself has no language instruction at all. This is a significant UX gap for non-English speakers.

### 4.3 Missing Edge Case Handling

**Unknown company name.** If `$job_target` has `"company": ""`, the cover letter will awkwardly reference "the company." No instruction exists for this case. Should default to referencing the role instead: "your [role] team."

**Unknown recipient.** The prompt says "if recipient name is unknown, do not invent one" — but doesn't say what salutation to use instead. The model may default to "Dear Hiring Manager" (formal/cold), "Hello" (casual), or skip salutation entirely. Should specify a preferred default.

**Generic/vague JD.** The instruction "Anchor paragraph 1 in one concrete JD detail" fails when the JD is all corporate boilerplate with no concrete detail. No fallback guidance.

**Very junior / no experience candidates.** With only 6 months of experience, a 3-paragraph cover letter that "includes 1-2 profile-grounded facts" has very little to work with. No guidance for this case.

### 4.4 Output Quality Guardrails

**No instruction against template voice at the word level.** The prompt says "no template voice" but doesn't give examples of what template voice looks like: "I am writing to express my interest...", "I believe I would be an excellent fit...", "As demonstrated by my experience in...", "I look forward to hearing from you."

**No outreach message subject line guidance.** The prompt says "no subject line" but a LinkedIn InMail or email outreach often needs one. This is a missing feature gap worth noting.

**No guidance on how to handle the `$job_target` when it's empty.** If role/company/location are all empty strings, the prompt doesn't describe how to degrade gracefully.

### 4.5 Cover Letter vs. Cold Outreach Conflation

The prompt generates both in one pass, which is efficient but creates a persona conflict:
- Cover letters are formal application documents
- Outreach messages are personal, peer-to-peer communications

The two have conflicting style defaults (formal vs. casual). The current instructions handle this by separate REQUIREMENTS blocks but the single system prompt says "professional" which biases both toward formality. The outreach message should be explicitly told it's more conversational.

---

## 5. `answer_questions`

**Files:** `text/answer_questions/system.txt`, `text/answer_questions/user.txt`

### 5.1 Inverted System/User Split (Same as cover_letter)

The system.txt is one sentence:
> "You answer job-application custom questions using only supplied context. Output JSON only. No markdown."

All substance is in user.txt. Same recommendation as cover_letter: move grounding rules, style defaults, and output format constraints to system.

### 5.2 No Question Type Detection

All questions are treated uniformly as "professional, concise, confident" factual answers. But application questions fall into distinct types that require different approaches:

| Question Type | Example | Required Approach |
|---|---|---|
| **Factual/technical** | "How many years of Python?" | Specific, direct, cite evidence |
| **Behavioral/STAR** | "Tell me about a time you led a project under pressure" | STAR format (Situation, Task, Action, Result) |
| **Motivational** | "Why do you want to work here?" | Needs genuine connection to company/role |
| **Hypothetical** | "How would you handle X scenario?" | Structured reasoning |
| **Legal/EEOC** | "Are you authorized to work in the US?" | One-word answer only; do NOT elaborate |
| **Salary/comp** | "What is your expected salary?" | The prompt cannot answer this; should flag to user |
| **Essay/personal statement** | "Describe yourself in 200 words" | Longer format, narrative |
| **Disqualifying** | "Do you have X certification?" | Must not fabricate; should warn if not present |

The current prompt gives no instructions for any of these type distinctions. A behavioral question answered as a bullet-point factual response is a missed opportunity. A salary question answered with a dollar amount could harm the candidate.

**Recommendation:** Add a question-type classification step or type-aware instructions.

### 5.3 Tailored Resume Context Mismatch

The prompt variable is named `$tailored_resume_context` and the `VARIABLES` dict describes it as "Tailored resume JSON." However, the service sends:

```python
tailored_resume_context=json.dumps(
    _resume_context_payload(resume_data),  # ← base resume, not tailored
    ...
)
```

`_resume_context_payload(resume_data)` builds context from the stored `resume_data` (master resume), not from any tailored output. The variable name and description are misleading. This should either be renamed to `$resume_context` or the service should pass the actual tailored resume when available.

### 5.4 Confidence Level Definitions Missing

The output schema specifies `"confidence": "high|medium|low"` with no definitions. The model assigns confidence arbitrarily. Useful definitions:

- **high:** Answer is directly supported by explicit context (dates, job titles, projects with matching tech).
- **medium:** Answer requires reasonable inference from context (e.g., scale/impact not explicitly stated but implied).
- **low:** Weak context match; answer is best-effort; candidate should review and edit.

### 5.5 Answer Length Guidance Is Underspecified

"Typically 2-5 sentences" is the only length guide, with "unless the question requires more detail" as the escape hatch. This is too vague:
- "Tell me about yourself" → needs 4-6 sentences minimum
- "Are you authorized to work in the US?" → needs 1 word
- "Describe a complex technical challenge you solved, in detail" → needs 5-8 sentences and structure

**Recommendation:** Classify question length as `short` (1-2 sentences), `standard` (3-5 sentences), or `extended` (6-10 sentences) and guide the model to pick based on question complexity.

### 5.6 Missing Guardrails

**No instruction to avoid fabricating credentials, certifications, or specific metrics.** The grounding rules say "Do not invent employers, dates, certifications, credentials, metrics, or legal claims" which is correct, but there's no instruction about what to do instead — should the model skip mentioning the missing credential? Add a warning? State it differently?

**No instruction on how to handle questions about things the candidate explicitly doesn't have.** "Do you have a Master's degree?" when the candidate has only a Bachelor's — should the model answer "No, but..." or just say no? No guidance.

**No batch-level coherence instruction.** When answering 10+ questions in one call, the model may:
- Repeat the same credential or project in multiple answers
- Be inconsistent in how it describes the same experience
- Use different names for the same employer

The prompt should instruct: "Maintain consistency across all answers. Do not repeat the same credential, project, or metric across multiple answers unless it's directly relevant to each question."

---

## 6. Cross-Cutting Issues

### 6.1 System Prompt Design Pattern Is Inconsistent

| Prompt | System prompt length | Substance in system vs. user |
|---|---|---|
| `extract_jd_intel` | 12 lines | Correct: persona + constraints in system; schema + rules in user |
| `tailor_resume_full` | 38 lines | Good: detailed craft in system; data in user |
| `critique_resume` | 28 lines | Mixed: schema + rules both in system; data in user (correct) |
| `cover_letter` | 3 lines | Wrong: almost everything in user |
| `answer_questions` | 1 line | Wrong: everything in user |

The inconsistency means cover_letter and answer_questions lose the benefit of system-prompt caching and persona priming.

### 6.2 No Language / Locale Support

The app has i18n for 5 languages (en, es, zh, ja, pt-BR). None of the active prompts support generating output in the user's locale:
- `tailor_resume_full` writes in English regardless
- `cover_letter` generates English text regardless (`del language`)
- `answer_questions` always writes in English

For Spanish or Chinese-speaking candidates applying to local jobs, this is a significant gap. A simple `OUTPUT LANGUAGE: {language_name}` instruction injected from `_constants.get_language_name(code)` at build time would solve this for all prompts.

### 6.3 No Chain-of-Thought in Complex Prompts

`tailor_resume_full` and `critique_resume` are the most complex tasks. Neither prompt instructs the model to reason before outputting. For the tailoring prompt, a brief "First, identify the 3 most important themes from the JD intelligence. Then map each theme to the strongest evidence in the resume. Then rewrite." would produce more deliberate, coherent tailoring.

For the critique prompt, "First, list every keyword from bold_keywords. Then check which are present in the diff. Then check for scope inflation. Then output JSON." would reduce missed keywords.

### 6.4 Token Economy Awareness

None of the prompts mention output length constraints relative to the model's context window. For a resume with 15 roles and 50 bullets, a full tailoring pass could generate a very large JSON diff. No guidance on prioritization when context is limited:
- How many experience entries to rewrite if the resume is very long?
- Should projects be deprioritized if the candidate has many roles?

### 6.5 Monotone Banned Word List Approach

The banned word list in `tailor_resume_full` is a static list. Models frequently generate synonyms or paraphrases of banned words. "Leverage" is banned but "harness" is not. "Orchestrated" is banned but "coordinated" is not (and "coordinated" is almost equally weak). A principle-based approach would be more robust: "avoid management-speak, avoid claims of non-observable impact, avoid passive constructions."

### 6.6 `critique_resume` Does Not Know About Response Contract

The critique model sees the tailored diff but doesn't know the `response_contract` constraints (which sections are allowed, what bullet indices are valid). This means the critique model might:
- Reference a section that doesn't exist in this resume (e.g., suggest adding `certifications` to a resume that has no such section in the response contract)
- Reference a bullet index that's out of range for a role

Passing the response contract (or a summary of it) to the critique step would prevent this.

---

## 7. Priority Matrix

| Issue | Prompt | Impact | Effort | Priority |
|---|---|---|---|---|
| System/user split in `cover_letter` and `answer_questions` | Both | High | Low | P1 |
| Internal redundancy in `tailor_resume_full` system.txt | tailor_resume_full | Medium | Low | P1 |
| Banned word list expansion | tailor_resume_full | Medium | Low | P1 |
| Missing original resume in `critique_resume` | critique_resume | High | Medium | P1 |
| Severity definitions in `critique_resume` | critique_resume | Medium | Low | P1 |
| Question type detection in `answer_questions` | answer_questions | High | Medium | P2 |
| `$tailored_resume_context` variable name mismatch | answer_questions | Medium | Low | P2 |
| Language support (`del language` removal + prompts) | All | High | Medium | P2 |
| Response contract label in `tailor_resume_full` user.txt | tailor_resume_full | Low | Low | P2 |
| seniority enum expansion in `extract_jd_intel` | extract_jd_intel | Medium | Low | P2 |
| Confidence + severity definitions | critique, answer_questions | Medium | Low | P2 |
| International location support | extract_jd_intel | Medium | Medium | P3 |
| Chain-of-thought in tailor + critique | Both | Medium | Low | P3 |
| `critique_resume` persona role-adaptation | critique_resume | Medium | Medium | P3 |
| Batch coherence instruction in `answer_questions` | answer_questions | Medium | Low | P3 |
| Token economy / prioritization guidance | tailor_resume_full | Low | Low | P3 |

---

## 8. Specific Rewrite Suggestions

### 8.1 `extract_jd_intel/system.txt` — Proposed Replacement

```
You are a job description analyst. Extract structured intelligence for resume tailoring.
Output valid JSON only — no prose, no markdown, no commentary.
Do not invent or speculate beyond what is stated or clearly implied by the job description.
If a field cannot be reliably inferred, use null (scalars) or [] (arrays).
```

All rules currently in system.txt should live exclusively in user.txt (they already do). Remove the duplication.

### 8.2 `tailor_resume_full/system.txt` — Deduplicated APPROACH block

Remove from APPROACH the following (they belong only in TAILORING MODE):
- "You may replace the least relevant bullets with content that naturally supports the role"
- "Titles may be enhanced: add platform, domain, team, or functional scope..."
- "For projects, naturally relate them to the company's products or domain..."

The calibration sentence in APPROACH ("Metrics only where credible...") can stay as a writing standard. The seniority calibration sentence appears in both APPROACH and TAILORING MODE — keep it in TAILORING MODE only.

**Add to banned words:**
```
- Banned phrases: proven track record, results-driven, results-oriented, team player, passionate about, dynamic, innovative, self-starter, detail-oriented, go-getter, thought leader, game-changer, forward-thinking, cutting edge (already banned as "cutting-edge"), visionary, collaborative
```

### 8.3 `cover_letter/system.txt` — Proposed Replacement

```
You write cover letters and outreach messages for job applicants.
Work only from the provided job target, job description, and candidate profile.
Do not invent names, employers, dates, metrics, credentials, or any fact not present in the supplied context.
If the recipient name is unknown, do not address anyone by name — begin the cover letter with the opening sentence of paragraph 1.
Output plain text only using the exact wrapper tags: <<COVER_LETTER>>, <<END_COVER_LETTER>>, <<OUTREACH_MESSAGE>>, <<END_OUTREACH_MESSAGE>>.
Do not use markdown, JSON, subject lines, salutation blocks, or signature blocks.
Do not use em dash (—) anywhere.
```

Move the grounding rules and output format from user.txt to system.txt.

### 8.4 `answer_questions/system.txt` — Proposed Replacement

```
You write honest, grounded answers to job-application questions on behalf of a candidate.
Work only from the supplied resume context, job target, and job description.
Do not invent employers, dates, certifications, credentials, metrics, or legal claims.
For questions you cannot answer from context (e.g., salary expectations, certifications not on the resume), provide the best truthful response and add a warning.
Output valid JSON only — no markdown, no extra keys, no commentary.
```

### 8.5 `answer_questions/user.txt` — Question Type Guidance Addition

Add after the STYLE block:

```
QUESTION TYPE HANDLING:
- Behavioral ("Tell me about a time..."): use STAR structure in 3-5 sentences (Situation, Action, Result)
- Motivational ("Why this role/company?"): connect one JD detail to one candidate credential
- Factual ("How many years of X?"): give direct, specific answer citing resume evidence
- Legal/EEOC ("Are you authorized to work in the US?"): one sentence only; do not elaborate
- Salary/compensation ("What is your expected salary?"): answer "I'm open to discussing compensation during the interview process." and add a warning that the candidate should personalize this
- Essay ("Describe yourself in N words"): use extended narrative (6-10 sentences); do not bullet-point
```

### 8.6 `critique_resume/system.txt` — Severity Definitions Addition

Add to the LOOK FOR section:

```
SEVERITY GUIDE:
- high: Fabricated-seeming claim (scope far exceeds plausible tenure/role), directly contradicts JD requirements, or inflates title/scope in ways a trained recruiter would immediately flag
- medium: Vague achievement without outcome, scope claim that's borderline for experience level, or significant JD keyword entirely missing
- low: Style issue, minor word choice, or improvement opportunity that doesn't affect fit perception
```

---

## 9. What's Working Well (Do Not Break)

- `tailor_resume_full` WRITING STANDARDS block is excellent: banned words, metric variety, active verbs. Keep it intact.
- `extract_jd_intel` schema is comprehensive and well-structured.
- `tailor_resume_full` ATS OPTIMIZATION section is well-conceived.
- `cover_letter` word counts (95-165 / 50-95) and paragraph counts (3 tight paragraphs) are precise and effective.
- `answer_questions` grounding rules ("no invented employers, dates, certifications") are strong.
- The override system (`prompt_overrides/`) is clean and well-designed — allows runtime customization without touching source.
- `resume_diff_output.txt` as a shared, separately-managed schema is a good architectural decision.
- The pipeline metadata (PIPELINE, PIPELINE_ORDER, RECEIVES_FROM, FEEDS_INTO) on each module is valuable for tooling and catalog UI.

---

Feedback on the the above brainstorm 

---

1.1 – Agreed with it
1.2 –
I am making this application mostly for my use, where I am targeting the new gard roles or max roles with 2+ years of experience, so do your best judgement if we need the complexity of all this seniority, since mostly I am going to feed the JD’s based on my manual prior assessment, we can still have the experience years which may help us with the later tailor part to identify the seriousness of the bullet points
We’re targeting and applying to US only 
On top of your schema suggestions, add anything else that you can think of 
1.3 – Currently targeting software engineer, AI - software engineer, data analyst/engineer, similar roles 
2.1, 2.2, 2.3, 2.4, 2.5 – Agreed on all three points 
3.1 , 3.2 , 3.3 , 3.4, 3.5, 3.6 – Agreed 
4.1 – agreed
4.2 – we’re just focused on the english at the moment, remove any variable features that may support the said other language, we can just hardcode the english at the moment 
4.3, 4.4 – agreed 
4.5 – we are seeking both under the single response to save the API token cost, since both have identical context needs. We can work something around on it to focus on both, given we don’t want to be too formal on cover letters or cold outreach, both needs a personal touch as someone is manually writing them , opposed to the generic AI-generated approach when users just paste details to any LLM and seeks a personalized response. We would want to attach a personal story which sounds natural, and distinct from the regular AI-generated repurposes that mass generates without the context rich pipeline that we have. 
5.1, …, 5.6 – agreed 
6.1 agreed 
6.2 – as mentioned in 4.2 
6.3, 6.5, 6.6 – agreed 
6.4 – take decision based on the resume I’ll submit 

* My resume sample content could be found on, just focus on the content as of now -- docs/plans/temp. both yaml files are my master resumes 
* another content improvement instructions are mentioned docs/plans/temp/1.1-jd-resume-tailor-spec.md, I want you to go through them, inherit them into our txt prompts, so make sure we don't duplicate them while adopting, I have manually referred them, and when conflict, would make them on higher priority over our existing prompts. 
* I've manually verified the existing prompts, so feel free to change/alter them as you wish 
* as mentioned on reference prompots, are aim is to get calls, it software fork is customized for my uses, so feel free to make hardcoded changes. 


