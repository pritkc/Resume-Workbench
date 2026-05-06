# Phase 3.14.4 — Feedback Run 5 Workplan (Composer)

**Test run:** `docs/plans/test_runs/2ae93156-1336-4750-b250-81d9a8436775`  
**Artifacts reviewed:** `extract_jd_intel_output/prompt.txt`, `extract_jd_intel_output/respose.txt`, `resume_generate_full/prompt.txt`, `resume_generate_full/respose.txt`, generated PDF `prit_chakalasiya_HKGX6X.pdf` (via model output cross-check).  
**Living prompts reviewed:** `apps/backend/app/prompts/text/tailor_resume_full/{system,user}.txt`, `apps/backend/app/prompts/text/extract_jd_intel/{system,user}.txt`, `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`.

---

## 1. Hiring-manager lens (May 2025–2026 AI-resume surge)

**What reads as “LLM + pasted JD” today**

- The entire surface area of the resume converges on the same noun families the JD repeats (here: SAP, Miro, process mapping, workflow, GTO, supply chain) across summary, qualifiers, stacks, bullets, projects, skills, and bold keywords.
- Bullets read like **paraphrased responsibilities** from the posting rather than **specific mechanisms** the candidate owned (systems named, constraints, what broke, what shipped).
- **Tool and employer substitutions** that a 10-second screen would catch: e.g. implying SAP in a role that never mentioned it, or swapping one BI surface for another to tick a JD box.

**What we want instead (your B ⊃ A model)**

- **B** = the candidate’s evidenced engineering/data story and toolchains. **A** = JD must-haves and themes. **A should be coverable as a subset of B**, with emphasis in **recent** roles—not a rebrand of the whole resume into the JD title.
- ATS still needs **honest** keyword presence: synonyms, adjacent tooling, regulated-domain context, and **transferable** process language—not verbatim JD responsibility strings in every section.

**Run 5 concrete red flags in the model output**

| Signal | Example from `resume_generate_full/respose.txt` | Why it fails the bar |
|--------|--------------------------------------------------|----------------------|
| JD-as-identity | Summary opens as “Data and process analyst…” while the base resume is software/data engineering | Rebrand away from B toward A |
| Fabricated employer stack | Sudathi bullet: “…enterprise **SAP** environments” with no SAP in source | Interview / background-check risk; classic AI hallucination |
| Tool swap for ATS | LogLens bullet replaces Streamlit with **Power BI** | Factual inconsistency with source; interviewer triage |
| Same JD hook everywhere | `responsibility_themes` echoed via “Mapped … in **Miro**”, skills row “Process Mapping / Workflow Visualization”, bold “Global Trade Operations” | 1:1 JD mirror; triggers “low effort tailor” rejection |
| Wasted vertical space | Long time metrics (“~6 hours/week to ~45 minutes”) unchanged from source in spirit but repeated across runs | User asked to tighten phrasing where possible |

---

## 2. Weak points and edge cases we have been under-specifying

1. **Pivot JD vs source domain** — When the JD is process/ERP-heavy and the resume is SWE/data, we lack a hard rule: **never introduce named enterprise products (SAP, Workday, ServiceNow, …) unless they appear in the original resume or are trivially true from public job context** (usually they are not).
2. **“Rewrite angles” line** — Injecting `$extract_jd_intel_output.responsibility_themes` under the label *Rewrite angles (one per role; every bullet connects to at least one)* **forces** connection to near-verbatim JD lines → opposite of “translate competencies.”
3. **Extractor `resume_domain_keywords`** — “mirror” in `extract_jd_intel/user.txt` plus tailoring “weave domain terms” **rewards** repeating GTO/med devices across bold + summary + bullets for a candidate who never worked GTO.
4. **Claim policy tension** — `resume_diff_output.txt` allows “reasonable new claims”; for **named third-party products and customer systems**, that is too loose; it conflicts with authenticity goals.
5. **Skills section** — Allowing multi-word JD phrases as `values` (“Process Mapping”, “Workflow Visualization”) creates a **second prose channel** that mirrors the JD even when bullets are partially restrained.
6. **Editorial sequence** — Putting **SUMMARY last** in the numbered sequence but the contract saying “fit-check rewrite first” is ambiguous; models may still **summarize toward the JD title** after overfitting bullets.
7. **Bold keywords** — “Global Trade Operations”, “Supply Chain” slip through as “technical”; they are **posting-specific org/domain** labels, not candidate-evidenced tools.
8. **Metric verbosity** — No guidance to compress **well-known time-save patterns** (e.g. “~6h/wk → ~45m”) without losing truth.
9. **Edge: internship / short tenure** — “At most 1–2 JD bullets per role” still allows **100% rewrite** of a 2–3 bullet internship; story retention should scale with bullet count.
10. **Stale prompt at runtime** — If production ever serves an older composed prompt, reviewers cannot trust artifact PDFs; hash/canary checks (see Codex workplan item 1) remain valid complementary **engineering** guardrails, not a substitute for prompt semantics.

---

## 3. Numbered changelist (old → new → rationale)

Each item is intended as an independent patch; order by risk (accuracy first, then naturalness, then density).

---

**1. Target:** `apps/backend/app/prompts/text/tailor_resume_full/user.txt` (block under `EXTRACTED JD INTELLIGENCE`)

**Old snippet (conceptual):**

```text
  Rewrite angles (one per role; every bullet connects to at least one): $extract_jd_intel_output.responsibility_themes
```

**New snippet:**

```text
  JD coverage themes (competency hooks, not resume copy): $extract_jd_intel_output.responsibility_themes
  Use these only to check that transferable work exists somewhere on the resume; do not paraphrase them into bullets, summary, or titles. Express fit with the candidate's own systems, tools, and outcomes.
```

**Rationale:** The current label + “every bullet connects” **encourages** 1:1 JD mirroring. We need coverage without echoing JD sentence structure.

---

**2. Target:** `apps/backend/app/prompts/text/extract_jd_intel/user.txt` (`resume_domain_keywords` rule)

**Old snippet:**

```text
- resume_domain_keywords: industry, product, regulatory, and business terms to mirror. Dedupe.
```

**New snippet:**

```text
- resume_domain_keywords: industry, product, regulatory, and business terms the JD cares about; dedupe. These are context for tailoring, not mandatory mirror phrases — downstream prompts must not repeat them across summary, stacks, skills, and bullets unless the candidate's work clearly touched that context.
```

**Rationale:** “Mirror” primes the rewriter to **paste** GTO / med devices language everywhere.

---

**3. Target:** `apps/backend/app/prompts/text/extract_jd_intel/user.txt` (`responsibility_themes` rule)

**Old snippet:**

```text
- responsibility_themes: exactly 6 action-oriented hooks written as "[verb] [specific what]" fragments the resume must demonstrate — not single-word theme labels. Each hook names a concrete capability or outcome the role requires.
```

**New snippet:**

```text
- responsibility_themes: exactly 6 neutral competency hooks (verb + object), deduped from the JD — not copy-paste JD responsibility lines. Phrase each as a capability category (e.g. "analyze operational data for process decisions") rather than employer-specific wording. Downstream must treat these as a coverage checklist, not prose to reuse.
```

**Rationale:** Themes that are **too close** to the JD text become the **rewrite angles** leak vector.

---

**4. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`--- ACCURACY & CALIBRATION ---` → `CLAIM POLICY`)

**Old snippet:**

```text
CLAIM POLICY:
- Prefer strong plausible claims that fit the candidate trajectory; avoid impossible claims, but do not require exact source wording.
```

**New snippet:**

```text
CLAIM POLICY:
- Prefer strong plausible claims that fit the candidate trajectory; avoid impossible claims, but do not require exact source wording.
- Never introduce a named enterprise platform, ERP, or vendor product (e.g. SAP, Workday, Salesforce) into bullets, stacks, projects, or skills unless that exact name (or unambiguous synonym used in-source) already appears in the ORIGINAL RESUME for that time period. Transferable fit must use honest adjacent language (API integrations, batch jobs, data validation, operational reporting) instead of inventing stacks.
```

**Rationale:** Run 5 **invented SAP** on Sudathi; this is the highest-severity failure mode for trust and interviews.

---

**5. Target:** same file (`TECHNICAL CALIBRATION`)

**Old snippet:**

```text
- Do not promote tools from tech_stacks into bullet text unless the source bullet already names that tool or the action logically requires it.
```

**New snippet:**

```text
- Do not promote tools from tech_stacks into bullet text unless the source bullet already names that tool or the action logically requires it.
- Do not substitute one vendor tool for another to match the JD (e.g. replacing Streamlit with Power BI, or Postgres with Snowflake) unless the source already supports that equivalence.
```

**Rationale:** Prevents **LogLens-style BI tool swaps** that are strictly false.

---

**6. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`BOLD_KEYWORDS`)

**Old snippet:**

```text
BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms from final resume content
Use 1-3 word terms only; prefer tools, languages, platforms, data methods, and product systems; avoid sentences, soft skills, and generic domain phrases.
```

**New snippet:**

```text
BOLD_KEYWORDS: array of 8-12 short high-visibility technical ATS terms from final resume content
Use 1-3 word terms only; prefer tools, languages, platforms, data methods, and product systems; avoid sentences, soft skills, and generic domain phrases.
- Exclude hiring-company team names, client program names, and geography-only role labels from this JD (e.g. a specific "Global Trade Operations" team) unless they appear as factual context in the original resume.
```

**Rationale:** Bold is high-visibility; **GTO**-style terms are **JD leakage**, not candidate skills.

---

**7. Target:** same file (`SKILLS`)

**Old snippet:**

```text
- Skill values must be specific tool, product, method, or technology names — not descriptive phrases.
```

**New snippet:**

```text
- Skill values must be specific tool, product, method, or technology names — not descriptive phrases.
- Do not encode JD responsibility phrases as skill tokens (e.g. avoid standalone "Process Mapping", "Workflow Visualization" as values; prefer credible tools like Miro, Visio, Lucidchart only if used in-source, otherwise omit).
```

**Rationale:** Run 5 skills doubled as a **second JD paragraph**.

---

**8. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`JD ALIGNMENT STYLE`)

**Old snippet:**

```text
- Direct JD terms should appear in no more than 1-2 bullets per experience entry; other bullets should stay original or show adjacent stronger work.
```

**New snippet:**

```text
- Direct JD terms should appear in no more than 1-2 bullets per experience entry; other bullets should stay original or show adjacent stronger work.
- Cap JD-specific noun families (e.g. a single vendor acronym + one process-method term) across the entire resume body: at most once in summary, once in skills, and sparingly in stacks—never every role.
- If the JD title differs materially from the candidate's core identity, the summary must still read as the candidate's field first (software/data/platform), with regulated or process context as secondary texture—not as the opening job title string.
```

**Rationale:** Addresses **full-document** JD clustering and **summary rebrand** seen in run 5.

---

**9. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`--- SIGNAL & ATS ---`)

**Old snippet:**

```text
JD is a lens, not the resume's center: each section should show broader capability first, with only selected JD-aligned evidence.
```

**New snippet:**

```text
Resume superset, JD subset: the original resume defines the candidate's primary profession and toolchain. The JD only prioritizes which evidence to foreground and which adjacent keywords to add honestly. A reader should infer "strong engineer/analyst who can do this job," not "resume rewritten into the posting's title."
```

**Rationale:** Makes the **B ⊃ A** rule explicit at the highest-precedence rules layer.

---

**10. Target:** `apps/backend/app/prompts/text/tailor_resume_full/user.txt` (`EDITORIAL SEQUENCE`)

**Old snippet:**

```text
1. BULLETS — selective rewrite: keep most source bullets; add direct JD framing to only 1-2 bullets per experience
2. ROLE TITLES — scope-enhance position fields
3. SKILLS — restructure after seeing summary direction
4. ATS — verify keyword placement across summary, stacks, bullets
5. SUMMARY — fit-check rewrite first
```

**New snippet:**

```text
1. SUMMARY — one-line identity aligned to ORIGINAL RESUME first; JD only as secondary texture (regulated, process-heavy, data-heavy, etc.), never the JD job title string.
2. BULLETS — selective rewrite: preserve at least half of each role's bullets unchanged by omission; JD-framed wording in at most 1-2 emitted bullets per role; for roles with ≤2 bullets, touch at most one.
3. ROLE TITLES — scope-enhance only when the qualifier reflects source evidence.
4. SKILLS — restructure without turning skills into a JD synonym list.
5. ATS — verify honest keywords and synonyms; no new vendor products.
```

**Rationale:** **Summary-first** reduces identity drift; **≤2 bullet roles** need a story-retention edge case.

---

**11. Target:** same file (`EDIT SCOPE` → Summary)

**Old snippet:**

```text
- Summary: full rewrite
```

**New snippet:**

```text
- Summary: full rewrite while preserving primary profession from the source (e.g. software/data engineering); do not adopt the JD's role title as the candidate's headline identity.
```

**Rationale:** “Full rewrite” alone is being read as “rewrite into the SAP analyst shape.”

---

**12. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`BULLETS` under writing rules)

**Old snippet:**

```text
- Tie each metric to why it mattered and what the candidate personally did — no naked percent with no mechanism
```

**New snippet (append):**

```text
- When repeating time-saved metrics, prefer compact honest forms (~6h/wk→~45m; overnight→same-day) if the source already states both endpoints; do not lengthen prose just to restate the same win.
```

**Rationale:** User called out **density**; keeps truth while saving lines.

---

**13. Target:** `apps/backend/app/prompts/text/tailor_resume_full/system.txt` (`PROCESS` step 2)

**Old snippet:**

```text
2. Map each competency to the strongest resume evidence or a reasonable new claim the user can later prove.
```

**New snippet:**

```text
2. Map each competency to the strongest resume evidence first; add at most light adjacent framing the user can defend in interview. Do not add new named products, customers, or vendor stacks as "reasonable" claims.
```

**Rationale:** Tightens the **new claim** lane so it cannot swallow **SAP-level inventions**.

---

**14. Target:** `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` (`PORTFOLIO PROJECTS`)

**Old snippet:**

```text
- Frontend framework (React, Streamlit) in tech_stack → at least one bullet must describe a real UI outcome
```

**New snippet (append):**

```text
- If a project bullet names a specific UI or BI surface in the source, keep that same surface; do not retarget to a JD-listed tool for keyword coverage.
```

**Rationale:** Reinforces **no tool substitution** on portfolio rows.

---

**15. Target (optional engineering hardening, aligns with Codex doc):** `apps/backend/app/services/tailoring/prompting.py` / `llm_calls.py` — prompt hash or canary strings

**Old snippet (illustrative):**

```py
"prompt_version": PROMPT_VERSIONS.get("tailoring_user", "unknown")
```

**New snippet (illustrative):**

```py
validate_prompt_canaries(user_prompt, REQUIRED_TAILORING_CANARIES)
"prompt_hash": sha256(user_prompt.encode()).hexdigest()[:12]
```

**Rationale:** Final feedback session needs **traceability** so PDFs in `docs/plans/test_runs/...` always map to the prompt text in git.

---

## 4. Success criteria for the next iteration

1. **Accuracy:** No new vendor/ERP/customer claims absent from source (SAP-type regressions = zero tolerance).  
2. **Naturalness:** JD title words do not dominate summary + every stack + bold list; **≤2** bullets per role carry JD-specific vocabulary.  
3. **Story retention:** Omitted bullet indices stay unchanged; at least one **recognizable** story per role remains interview-ready.  
4. **ATS:** Honest hits for transferable keywords (regulated, batch runtime, integrations, BI, SQL) without **tool swapping**.  
5. **Density:** Where the source already has a before/after time metric, tailored bullets may shorten wording without changing endpoints.

---

## 5. Out of scope / follow-ups (not in this changelist)

- **Automatic post-validation** (code) to block SAP-like tokens if missing from source — product decision; prompts alone may not suffice for all models.  
- **User-controlled “strict fidelity” mode** — would flip claim policy globally; discuss before implementing.  
- **PDF layout** truncation issues — if still present after prompt tightening, treat as renderer/CSS task separate from LLM wording.

---

*Document version: Composer pass after run `2ae93156-1336-4750-b250-81d9a8436775`. Implementation can be staged: items 1–5 (accuracy + anti-echo), then 6–11 (naturalness), then 12–14 (density + projects).*
