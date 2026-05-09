# Phase 3.15.3 — Prompt organization brainstorm (tailor full + resume diff rules)

**Scope:** Raw prompt text only for **`tailor_resume_full`** (`system.txt`, `user.txt`) and the shared **`resume_diff_output.txt`** (also consumed by `rewrite_resume` / lite via `RESUME_DIFF_RULES`).  
**Out of scope for this doc:** `enrichments`, `parse_resume`, `answer_questions`, `cover_letter`, `tailor_resume_lite` (per request).  
**Related pipeline context (brief, for product-chain issues only):** `extract_jd_intel` → primary tailor → `critique_resume` → `rewrite_resume` — second pass reuses the same diff rules and a similar user template shape as rewrite.

**Goal:** Tighter, non-duplicative instructions, clearer precedence and section order for both human maintainers and the model, fewer contradictions, stronger format lock for QC, and notes on JD extraction and optional diff rationale lines — without ballooning token use.

---

## 1. How these prompts assemble today (maintenance reality)

- **`tailor_resume_full.build_messages`** (and **`rewrite_resume.build_messages`**) set **`system` =** `load_override(…, "instructions")` **or** `read_shipped_txt("…/system.txt").strip()` — a **single** prose file. They do **not** concatenate `SYSTEM_PROMPT_FILES` at runtime.
- **`SYSTEM_PROMPT_FILES`** in the step module lists **`tailor_resume_full/system.txt`** **and** **`output_file_schema_rules/resume_diff_output.txt`** for **catalog / authoring** (Prompt Manager shows both source paths). The **large rules file is not automatically prepended to `system_prompt`** unless a human or composer override pastes it there.
- **User** is `text/tailor_resume_full/user.txt` with **`OUTPUT SCHEMA: $resume_diff_rules`** — the full shared rules text is injected **once** in the **user** message (override: per-step `*.rules.txt` or shared `resume_diff`).
- **`$response_contract`** is compact JSON from `build_response_contract` / `to_prompt_dict()` — structural permissions (indices, editable fields), not prose rules (tests already guard against stuffing “rules” into the contract).
- **Custom instructions:** `render_custom_prompt_instructions` prepends “override all other instructions if conflicting” — highest effective precedence for conflicting narrative.

**Implication:** The main **token drag** is **not** system+user duplication of the rules file, but **overlap between** the short **user** editorial lines (**EDIT SCOPE**, **FULL-RUN SHAPE GUARDS**) and the long **`$resume_diff_rules`** block (same policies restated).

---

## 2. Current strengths (keep)

- **Clear product philosophy** in multiple places: JD as lens, original resume as superset, avoid JD paste / keyword stuffing — aligned with credible callbacks.
- **Concrete mechanical rules** in `resume_diff_output.txt`: JSON-only, key names, experience/projects shapes, bullet index rules, project bullet **count lock**, **banned office tools** in stacks, summary length band, banned openers/jargon — good for QC.
- **User `EDITORIAL SEQUENCE`** gives a sane mental model (story → bullets → titles → skills → ATS → summary), though it **fights** the listed numeric order in the same block (see issues).
- **`extract_jd_intel` user prompt** is **schema-first** with explicit keys and downstream semantics (`responsibility_themes` as hooks not copy, etc.) — strong contract for the extractor.

---

## 3. Issues by category

### A. Duplication and token waste

| Location | Observation |
|----------|-------------|
| **User shell + rules** | **`$resume_diff_rules`** injects the full **`resume_diff_output.txt`** once in the **user** message. **`tailor_resume_full/system.txt`** is separate (short). Catalog lists two `SYSTEM_PROMPT_FILES`; **runtime does not** auto-append rules to `system_prompt` — duplication is **editorial lines in `user.txt`** restating what's already in **`$resume_diff_rules`**. |
| **User vs rules** | “Tech stack values must be named tools… never paradigms…” appears in **`user.txt`** (EDIT SCOPE) **and** **`resume_diff_output.txt`** (TECH STACK HEADER + earlier EDITABLE). |
| **User vs rules** | Summary **105–135 characters**, JD-title avoidance, **1–2 JD-heavy bullets per role** — repeated between user EDIT SCOPE / FULL-RUN SHAPE GUARDS and rules sections (SUMMARY, JD ALIGNMENT STYLE, BULLETS). |
| **System vs rules** | Title calibration (“append qualifier, never rename base title”) overlaps **system `TITLE CALIBRATION`** and rules **`ROLE TITLE`**. |
| **Rules internal** | **Skills** subsection repeats “4–5 groups”, “preserve strong skills”, “JD-first order” in closely related bullets — could be one short paragraph + one checklist line. |
| **Rules internal** | **ATS & NATURALNESS** and **JD ALIGNMENT STYLE** overlap (keyword placement, no stuffing). |
| **Ban lists** | `improved` / `enhanced` banned as openers but **CLAIM POLICY** encourages “strong plausible claims” — not a direct contradiction, but the word “improved” is common in legitimate technical bullets; model may over-avoid or still slip in synonyms. |

**Recommendation direction:** Single **source of truth** per concern: **rules** file holds JSON contract + field semantics + global writing bans; **`user.txt`** holds only **run order**, **JD blob layout**, **pointers** to rule sections, and **`$response_contract`** — remove repeated policy sentences already covered by `$resume_diff_rules`. Optionally move a **minimal** “rules capsule” into `system.txt` if you want the model to see constraints before the long user payload (still avoid two full copies).

---

### B. Ordering, precedence, and LLM attention (hallucination / drift)

| Issue | Detail |
|-------|--------|
| **EDITORIAL SEQUENCE numbering** | Steps 1–6 list **SUMMARY “fit-check rewrite first”** as **step 6**, but step 1 says preserve career story first — the **first** bullet of step 6 contradicts “summary last” narrative in prose (“fit-check rewrite **first**”). Renumber or replace “first” with “final pass after bullets/skills”. |
| **Where contract lives** | Strong **FORMAT / OUTPUT CONTRACT** sits mid-file in rules after some prose; for **determinism**, consider **leading** the model with: output keys → omit semantics → then creative guidance (industry standard: “constraints up front”). |
| **Precedence statement** | Rules say “PRIMARY RUN RULES in system message override anything here” — but **custom_prompt_instructions** claim global override — **document explicit stack**: custom > system primary > shared rules > user editorial sequence > raw JD text. |
| **Double mapping** | `NAMING BRIDGE` references `workExperience` → `experience` keys; **`$response_contract`** also defines order — risk of model confusion if contract and resume JSON use different **entry orders**. Worth one line: “experience `0` is always `response_contract.entries[0]` for **this** resume.” (If already guaranteed by builder, reference it explicitly.) |

---

### C. “Stateless” instruction audit — what to trim vs keep

**Premise:** Stateless calls **do** need repeated **format** and **policy** bans every time. What you can trim are **redundant** repeats of the same ban, not the ban itself.

**Candidates to consolidate (not delete the underlying rule):**

- Multiple variants of “do not mirror JD across every section” → **one** authoritative paragraph in rules.
- Repeated “omit unchanged bullets” in user SHAPE GUARDS and rules BULLET POLICY → **once**, in OUTPUT CONTRACT section.

**Actually keep (still high value per call):**

- JSON-only, key omission semantics, project bullet count lock, locked fields — these are **not** “memory” rules; they prevent malformed output.

**Gray zone:**

- Narrative like “each role should keep at least one recognizable original interview story” — **not** stateful, but **soft**; easier to violate than JSON rules. Consider **shortening** + tying to **measurable** behavior: “When rewriting a bullet, preserve at least one concrete noun/artifact from the source bullet unless rewriting for factual correction.”

---

### D. Weak, missing, or risky instructions (resume quality & interviews)

| Gap | Suggestion |
|-----|------------|
| **Inter-company consistency** | Little explicit guidance when the **same technology** appears in multiple roles — avoid repeating the **same** achievement pattern 3× (reads as template spam). Add: “Vary mechanism + outcome type across employers unless one company dominates that stack.” |
| **Interview defense** | “Defensible in phone screen” appears in **rewrite** system, not in primary tailor rules — consider **one line** in shared rules: “If you cannot explain the mechanism in 30 seconds, do not claim it.” |
| **Quant credibility** | Strong guidance exists, but **mixed seniority + internship** nuance could be one tighter line: “Intern bullets: optimization and learning outcomes, not org-wide impact.” |
| **Acronym / product naming** | JD extraction may emit product codes; rules warn about inventing vendors — add: “Do not introduce **new** proper nouns (products, clients, internal codenames) not in original resume or JD.” |
| **bold_keywords vs body** | Rules: 6–10 bold terms from **final** resume content — no explicit step to **reconcile** bold list with actual tokens used in summary/bullets (can drift). Optional: “Every bold_keyword must appear verbatim (case-insensitive) in summary, skills, or bullets.” |
| **Rehydrated draft** | Not part of tailor prompt — but **rewrite** sees merged output; ensure **second pass** rules reference “diff applies on top of prior diff” if stacking behavior can hallucinate reversions (pipeline concern, not necessarily this file). |

---

### E. Format rigidity and “exact output each time”

**Reality check:** LLMs are **not** bitwise deterministic; rigidity comes from **schema validation + repair loop + banned patterns**, not prose alone.

**Prompt-side hardening:**

- Move **immutable JSON skeleton** (keys, types, omit behavior) to the **top** of the rules file.
- Add a **single “VALIDATION SELF-CHECK”** short checklist the model runs before emitting: keys only from set; project bullet counts; no prose outside JSON; summary char length — **5–7 lines max**.
- Align **character limits** with renderer: if UI wraps at different width, 105–135 may be wrong — confirm against **RenderCV** or frontend preview (product alignment).

**Override parity:** Per-step **`*.rules.txt`** vs **shared** `resume_diff` override must stay consistent for **tailor** and **rewrite** (both read the same rules source pattern) so first and second pass do not diverge.

---

### F. JD extraction (`extract_jd_intel`) — robustness & QC (chain perspective)

**Current:** `system.txt` is minimal (JSON-only, anchored, null/empty conventions). `user.txt` carries the real schema and field semantics — good split.

**Gaps for “quality controlled” extraction:**

| Issue | Idea |
|-------|------|
| **Ambiguous or empty JD** | Explicit behavior: minimal JSON with nulls, **low confidence** flags (optional future field), or `responsibility_themes: []` with downstream “skip JD pressure” mode. |
| **Contradictions in JD** | Instruction: “If JD contradicts itself, prefer **explicit requirements** list over marketing intro.” |
| **Non-English or mixed** | Optional: normalize role keywords to **English** tool names if product is EN-first. |
| **Post-validation** | Programmatic checks: `resume_bold_keyword_sources` ∩ `low_signal_terms` must be empty; `keyword_must_match` ⊆ `resume_technical_keywords`; cap list sizes. |
| **Downstream coupling** | Tailor user template repeats JD field comments — if extraction schema changes, **one** doc pointer or version id in prompt helps maintainers. |

---

### G. Optional: rationale line per diff hunk (frontend confidence)

**Idea:** Extend output schema with optional `bullets: { "0": { "text": "...", "why": "aligns to JD theme X; kept metric Y from source" } }` **or** parallel map `bullet_rationale: { "0": "..." }`.

**Trade-offs:**

- **Pros:** User trust, explainability, fewer “random edit” feelings.
- **Cons:** More tokens, **new validator paths**, risk of rationale leaking unsourced claims — mitigated by “why references source bullet or JD theme only”.

**Recommendation:** Prototype **off-glass** or separate **non-rendered** field so resume JSON stays clean for ATS PDF.

---

### H. `null` / omit semantics (your note)

- Today: “omit key / omit bullet index = unchanged” is stated; formalizing **“explicit null vs absent”** in one line reduces parser ambiguity if you ever move to structured outputs API.
- If you pass through nulls on unchanged lines — **document** whether `null` is allowed for bullet text (currently rewrite/tailor expect **omit** not `null`).

---

## 4. Step-by-step refactor plan (for a follow-up implementation pass)

1. **Measure duplication:** Diff `user.txt` vs `resume_diff_output.txt` and vs `system.txt` — list exact duplicated sentences (automatable with simple text hash or manual checklist).
2. **Decide canonical homes:** Proposed default — **`system.txt`:** role + process + title calibration only (keep small). **`$resume_diff_rules` in user:** sole full **OUTPUT SCHEMA** + writing rules. **`user.txt`:** **EDITORIAL SEQUENCE** + thin **EDIT SCOPE** + placeholders — **delete** lines that duplicate `$resume_diff_rules`. Optional: prepend a **one-screen** “contract summary” to `system.txt` *without* duplicating the entire rules file, if you want constraint-first attention.
3. **Fix EDITORIAL SEQUENCE** wording so summary step does not say “first” when it is chronologically last in the pipeline.
4. **Precedence box** (5 lines): custom → system primary → rules → user scope.
5. **Consolidate** tech stack / summary / JD bullet caps into **single** subsection under rules; user points to “see RULES §X”.
6. **Add** optional programmatic JD validation in backend (post-extract), not prompt-only.
7. **Validation self-check** block at end of rules (short).
8. **Tests:** Update `test_prompt_lint` / assembly tests if user template variables change; keep **canary** phrases if any.

---

## 5. Product-chain risks (resume → interview callback)

**Ordered chain:** Bad JD extract → wrong keyword emphasis; overfitted tailor → keyword stuffing / suspicion; weak critique → misses inflation; rewrite over-corrects → flattens voice.

**Prompt-level mitigations:** Stronger **extract** validation, **single** set of tailoring rules, **explicit** “phone screen test” line, and **bold_keyword ↔ body** alignment — all reduce “AI-shaped” resumes without forbidding modern tools.

---

## 6. Summary recommendation

**Highest ROI, lowest risk:** (1) **Deduplicate** `user.txt` against **`$resume_diff_rules`** so editorial scope is not restated in prose. (2) **Resolve EDITORIAL SEQUENCE / summary “first”** contradiction. (3) **Reorder** rules file to **contract-first**. (4) **Merge** duplicated subsections (skills, ATS, JD alignment). (5) **Clarify precedence** vs custom instructions.  

**Medium term:** JD extract validation job + optional **rationale** field for UI + **bold** consistency rule.

---

## 7. Files reviewed (paths)

- `apps/backend/app/prompts/text/tailor_resume_full/user.txt`
- `apps/backend/app/prompts/text/tailor_resume_full/system.txt`
- `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt`
- `apps/backend/app/prompts/tailor_resume_full.py`
- `apps/backend/app/prompts/_rules/resume_diff.py`
- (Chain context only) `apps/backend/app/prompts/text/extract_jd_intel/user.txt`, `system.txt`
- `apps/backend/app/services/tailoring/prompting.py`, `contracts.py`

---

*Brainstorm only — no prompt text was modified in the repository as part of this phase.*
