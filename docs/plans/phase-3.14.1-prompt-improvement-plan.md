# Prompt Improvement Plan (Phase 3.14.1)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve all active prompt text files and minimal Python wiring for 5 prompt steps based on the brainstorm analysis and user feedback.

**Architecture:** Prompt text changes in `.txt` files, minimal Python changes for new `original_resume` param in `critique_resume` and `language` param removal from `cover_letter` service. No schema migrations, no new files.

**Tech Stack:** Python 3.13+, FastAPI, string.Template placeholders in `.txt` files

---

## Files Changed

| File | Change |
|---|---|
| `text/extract_jd_intel/system.txt` | Replace with minimal persona — remove rule duplication |
| `text/extract_jd_intel/user.txt` | Simplify seniority enum, add guardrails, add schema fields |
| `text/tailor_resume_full/system.txt` | Deduplicate APPROACH/TAILORING MODE, expand banned words, add spec content |
| `text/tailor_resume_full/user.txt` | Clarify $response_contract label |
| `text/critique_resume/system.txt` | Severity defs, role-adaptive persona, guardrails, location notation |
| `text/critique_resume/user.txt` | Add $original_resume context block |
| `text/cover_letter/system.txt` | Full rewrite as proper system prompt |
| `text/cover_letter/user.txt` | Personal touch guidance, edge cases, remove language refs |
| `text/answer_questions/system.txt` | Full rewrite as proper system prompt |
| `text/answer_questions/user.txt` | Question type handling, confidence defs, batch coherence, label fix |
| `prompts/critique_resume.py` | Add `original_resume` to VARIABLES + build_messages signature |
| `services/tailoring/orchestration.py` | Pass `original_resume_json` to build_critique_messages |
| `services/cover_letter.py` | Remove `language` param from 3 functions |
| `routers/resumes.py` | Remove `language` arg from cover_letter calls (4 call sites) |

---

## Task 1: Fix extract_jd_intel prompts

**Files:**
- Modify: `apps/backend/app/prompts/text/extract_jd_intel/system.txt`
- Modify: `apps/backend/app/prompts/text/extract_jd_intel/user.txt`

- [ ] **Step 1: Rewrite system.txt — minimal persona, no rule duplication**

Replace entire file content with:
```
You are a job description analyst. Extract structured intelligence for resume tailoring.
Output valid JSON only — no prose, no markdown, no commentary.
Do not invent or speculate beyond what is clearly stated or implied by the job description.
For any field you cannot reliably determine, use null (scalar) or [] (array).
```

- [ ] **Step 2: Update user.txt — schema improvements**

Changes:
- Seniority enum: `junior | mid | senior | staff+` (collapsed — targeting tech roles at 0-4 years)
- Add `function` field with explicit enum
- Add `experience_level_signal` field (prose description of what tenure they actually want)
- Add `culture_signals` field
- `requirements.years`: add `or null` annotation to the example
- `ats_keywords`: add count guidance "20-60 terms"
- `responsibility_themes`: add "5-8 themes; fewer if the JD is thin"
- Add guardrail: "This schema is optimized for software engineering and data roles"
- Add hallucination guardrail for `product_context`
- Rules: remove all rule lines that duplicate what's already in the system.txt (they already live in both — the system.txt had them duplicated, now only user.txt keeps them)

- [ ] **Step 3: Run placeholder validation test**

```bash
cd apps/backend && python -m pytest tests/unit/test_shipped_prompt_placeholders.py -v
```
Expected: all PASS (no Python changes in this task)

---

## Task 2: Fix tailor_resume_full prompts

**Files:**
- Modify: `apps/backend/app/prompts/text/tailor_resume_full/system.txt`
- Modify: `apps/backend/app/prompts/text/tailor_resume_full/user.txt`

- [ ] **Step 1: Rewrite system.txt — deduplicate + expand**

Consolidate APPROACH + TAILORING MODE (remove 4 duplicated instructions from APPROACH).
Add: ROLE section with twenty-second skim context, TWENTY-SECOND SKIM rules, WHAT STAYS FIXED, PROCESS (chain-of-thought), token economy note for long resumes. Expand banned words to include phrases from spec.

- [ ] **Step 2: Update user.txt — clarify response contract label**

Change:
```
RESPONSE CONTRACT:
$response_contract
```
To:
```
RESPONSE CONTRACT (allowed sections and bullet counts — do not emit sections absent from this list):
$response_contract
```

- [ ] **Step 3: Run placeholder validation test**

```bash
cd apps/backend && python -m pytest tests/unit/test_shipped_prompt_placeholders.py -v
```
Expected: all PASS

---

## Task 3: Fix critique_resume — prompts + Python wiring

**Files:**
- Modify: `apps/backend/app/prompts/text/critique_resume/system.txt`
- Modify: `apps/backend/app/prompts/text/critique_resume/user.txt`
- Modify: `apps/backend/app/prompts/critique_resume.py`
- Modify: `apps/backend/app/services/tailoring/orchestration.py`

- [ ] **Step 1: Rewrite critique_resume/system.txt**

Replace with: role-adaptive persona, severity guide with definitions, suggestions guidance (3-7, must be grounded), anti-hallucination rule, location notation table, required JSON keys.

- [ ] **Step 2: Update critique_resume/user.txt — add $original_resume**

Add at the top of user.txt:
```
ORIGINAL MASTER RESUME (source of truth for scope validation):
$original_resume

```
Keep existing blocks below it.

- [ ] **Step 3: Update critique_resume.py — add original_resume param**

In `VARIABLES` dict, add:
```python
"original_resume": "Original master resume JSON — used to validate scope claims in the diff",
```

Update `build_messages` signature from:
```python
def build_messages(tailor_resume_full_output: str, extract_jd_intel_output: str) -> tuple[str, str]:
```
To:
```python
def build_messages(
    tailor_resume_full_output: str,
    extract_jd_intel_output: str,
    original_resume: str = "",
) -> tuple[str, str]:
```

Update the `render_user_template` calls inside to pass `original_resume=original_resume`.

- [ ] **Step 4: Update orchestration.py — pass original_resume_json to critique**

Change line 104:
```python
c_sys, c_user = build_critique_messages(draft_json, jd_json)
```
To:
```python
c_sys, c_user = build_critique_messages(
    draft_json,
    jd_json,
    prompt_context.original_resume_json,
)
```

- [ ] **Step 5: Run placeholder + prompt assembly tests**

```bash
cd apps/backend && python -m pytest tests/unit/test_shipped_prompt_placeholders.py tests/unit/test_prompt_assembly.py -v
```
Expected: all PASS

---

## Task 4: Fix cover_letter — prompts + remove language param

**Files:**
- Modify: `apps/backend/app/prompts/text/cover_letter/system.txt`
- Modify: `apps/backend/app/prompts/text/cover_letter/user.txt`
- Modify: `apps/backend/app/services/cover_letter.py`
- Modify: `apps/backend/app/routers/resumes.py`

- [ ] **Step 1: Rewrite cover_letter/system.txt — full system prompt**

Replace with:
```
You write cover letters and outreach messages for job applicants in English.
Work only from the provided job target, job description, and candidate profile.
Do not invent names, employers, dates, metrics, credentials, or any fact not present in the supplied context.
If the recipient name is unknown, begin the cover letter with the opening sentence of paragraph 1 — no salutation line.
If job_target fields (role, company) are empty strings, work around them gracefully without inventing the missing detail.
Output plain text only using the exact wrapper tags: <<COVER_LETTER>>, <<END_COVER_LETTER>>, <<OUTREACH_MESSAGE>>, <<END_OUTREACH_MESSAGE>>.
Do not use markdown, JSON, subject lines, salutation blocks, or signature blocks.
Do not use em dash (—) anywhere in either message.
```

- [ ] **Step 2: Rewrite cover_letter/user.txt — personal touch, edge cases**

Move grounding rules and output format to system.txt (already done). Keep data blocks and task-specific guidance. Update cover letter requirements to emphasize human, specific, context-grounded writing (not generic AI). Update outreach message guidance to peer-professional tone.

- [ ] **Step 3: Remove language param from cover_letter service**

In `apps/backend/app/services/cover_letter.py`, update 3 function signatures:
- `generate_cover_letter_and_outreach`: remove `language: str = "en"` param, remove `del language` line
- `generate_cover_letter`: remove `language: str = "en"` param, remove from internal call
- `generate_outreach_message`: same

- [ ] **Step 4: Update resumes.py callers — remove language arg (4 call sites)**

Find all `await generate_cover_letter_and_outreach(resume_data, job_desc, language)` calls and remove the `language` positional argument. Lines ~1142-1145, ~2911-2914, ~2955-2958, ~2998-3001.

- [ ] **Step 5: Run cover_letter tests**

```bash
cd apps/backend && python -m pytest tests/service/test_cover_letter.py -v
```
Expected: all PASS

---

## Task 5: Fix answer_questions prompts

**Files:**
- Modify: `apps/backend/app/prompts/text/answer_questions/system.txt`
- Modify: `apps/backend/app/prompts/text/answer_questions/user.txt`

- [ ] **Step 1: Rewrite answer_questions/system.txt**

Replace with:
```
You write honest, grounded answers to job-application questions on behalf of a job candidate. Output is always in English.
Work only from the supplied resume context, job target, and job description.
Do not invent employers, dates, certifications, credentials, metrics, or legal claims.
For questions you cannot answer from context (salary expectations, certifications absent from the resume, EEOC questions), provide the best truthful short response and include a warning.
Output valid JSON only — no markdown, no extra keys, no commentary.
```

- [ ] **Step 2: Update answer_questions/user.txt**

Add after STYLE block:
- QUESTION TYPE HANDLING section (behavioral/STAR, motivational, factual, legal/EEOC, salary, essay)
- CONFIDENCE LEVEL GUIDE (high/medium/low definitions)
- CONSISTENCY note (batch coherence — don't repeat same credential across answers)

Update label:
- `TAILORED RESUME CONTEXT (JSON):` → `RESUME CONTEXT (JSON):`

- [ ] **Step 3: Run placeholder validation test**

```bash
cd apps/backend && python -m pytest tests/unit/test_shipped_prompt_placeholders.py -v
```
Expected: all PASS (no variable name change, only label text change)

---

## Task 6: Full test suite + lint

- [ ] **Step 1: Run all backend unit + service tests**

```bash
cd apps/backend && python -m pytest tests/unit/ tests/service/ -v
```
Expected: all PASS

- [ ] **Step 2: Run frontend lint**

```bash
npm run lint
```
Expected: 0 errors (no frontend changes in this plan, but verify)

- [ ] **Step 3: Quick import smoke test**

```bash
cd apps/backend && python -c "from app.prompts import get_prompt; [get_prompt(s) for s in ['extract_jd_intel','tailor_resume_full','critique_resume','cover_letter','answer_questions']]; print('OK')"
```
Expected: prints `OK`
