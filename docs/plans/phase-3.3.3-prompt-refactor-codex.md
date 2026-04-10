# Phase 3.3.3 - Prompt Refactor (Codex)

## Objective

Rebuild the tailoring prompt stack from scratch so we can maximize interview-conversion quality while preserving the candidate's real voice, career calibration, and master-resume grounding.

This phase replaces the current "raw JD + compact diff" prompting approach with a cleaner 2-stage architecture:

1. JD Intelligence Extraction (structured, high-signal, no resume rewriting here)
2. Resume Tailoring Generation (uses structured JD intelligence only, no raw JD block)

---

## Direct Feedback Mapping

| Feedback | Refactor Action |
|---|---|
| 1) For projects, demand titles back | Response contract now carries project descriptors with `title` (required) for every project entry in scope. |
| 2) For project, collect tech stack/summary | Project descriptors now include `tech_stack_current` and `summary_current`; rewrite prompt must read them before editing bullets. |
| 3) For experience, demand role titles back | Experience descriptors now include `role_title_current` + `company` per entry. |
| 4) Skills count should not be hard-coded | Remove hard `skills_values_count` equality rule; replace with flexible skill policy (dedupe, relevance, no forced count lock). |
| 5) Expose Bold Keywords across full resume and return list | Add `bold_keywords` array to tailoring output and pass it into runtime render settings (`settings.bold_keywords`) for renderer-driven emphasis. |

---

## Product Direction For 3.3.3

### What we optimize for

- High interview conversion through tighter JD alignment
- Natural writing that sounds lived-in, not AI-generated
- Mature, role-calibrated phrasing (scope must match tenure/seniority)
- ATS-readable clarity without keyword stuffing
- Metric variety used only when meaningful

### What we explicitly avoid

- Inflated/corporate filler language
- Repetitive metric templates in every bullet
- Unrealistic ownership claims for early-career roles
- Unstructured raw JD dump inside the tailoring prompt

---

## Major Structural Changes

## 1) Remove old honesty block and replace with calibrated instruction model

Remove this exact block from `TAILORING_SYSTEM_PROMPT`:

```text
HONESTY (violation = interview harm):
- Never invent skills, tools, certifications, metrics, companies, or dates
- Never upgrade experience level or add new employers
```

Replace it with a tighter section:

```text
CALIBRATION & EVIDENCE:
- Keep claims grounded in the provided master resume evidence.
- Match scope to role level and tenure (intern/junior/mid/senior/staff).
- Prefer precise language over inflated language.
- If evidence is weak, rewrite for clarity rather than exaggeration.
```

This keeps the structure meaningful and less moralizing while preserving practical quality safeguards.

## 2) Split JD handling from rewrite prompt

Current: tailoring prompt still receives large raw JD text.

New: tailoring prompt consumes only `job_intelligence_json` produced by extraction stage.

Benefits:

- lower token load
- less noise from brand/marketing paragraphs
- stronger consistency for keyword and context extraction
- clearer controllability for downstream renderer (bold keywords list)

---

## 3.3.3 Architecture (2.0)

## Stage A - JD Intelligence Extraction

Input:

- raw job description text

Output (`job_intelligence`):

- role metadata
- company/team/product context
- required/preferred capabilities
- ranked keyword bank
- bold keyword shortlist
- rewrite priorities (what should be emphasized in resume)

## Stage B - Resume Tailoring Generation

Input:

- master resume payload (structured)
- `job_intelligence`
- response contract with entry descriptors

Output:

- summary changes
- experience/project bullet diffs
- optional project `tech_stacks` rewrite
- skills regrouping/refinement
- `bold_keywords` list for renderer

No raw JD text is included in this prompt.

---

## New Data Contracts

## A) JD Intelligence schema (new)

```json
{
  "core_title": "Software Engineer II",
  "role_family": "backend_engineering",
  "seniority_level": "mid",
  "company_name": "Example Corp",
  "company_context": {
    "industry": "fintech",
    "business_model": "B2B SaaS",
    "product_focus": ["payments orchestration", "risk scoring"],
    "customer_type": ["enterprise"]
  },
  "team_context": {
    "team_name": "Platform API",
    "domain": ["distributed systems", "developer platform"],
    "collaboration_partners": ["product", "infra", "security"]
  },
  "must_have": {
    "skills": ["Python", "FastAPI", "PostgreSQL", "CI/CD"],
    "responsibilities": ["build APIs", "own reliability", "cross-team delivery"],
    "experience_requirements": ["3+ years backend engineering"]
  },
  "nice_to_have": {
    "skills": ["Kafka", "Kubernetes"],
    "domain_exposure": ["event-driven architecture"]
  },
  "keyword_bank": [
    {
      "keyword": "distributed systems",
      "priority": "high",
      "category": "domain",
      "should_bold": true
    }
  ],
  "bold_keywords": ["distributed systems", "FastAPI", "CI/CD", "PostgreSQL"],
  "rewrite_focus": [
    "show ownership in API reliability",
    "highlight platform scale and collaboration"
  ],
  "language_tone": {
    "avoid_jargon": true,
    "style": "direct, concrete, mature"
  }
}
```

## B) Tailoring response contract (updated)

```json
{
  "mode": "full",
  "output_keys": ["summary", "experience", "projects", "skills", "bold_keywords"],
  "experience": {
    "entries": [
      {"company": "Humana", "role_title_current": "Software Engineer, Data Infra & MLOps"}
    ],
    "bullet_counts": [5]
  },
  "projects": {
    "entries": [
      {
        "title": "First2Fetch | Job Board Aggregator Platform",
        "tech_stack_current": "Node.js, PostgreSQL, Web Scraping, REST APIs",
        "summary_current": "Node.js, PostgreSQL, Web Scraping, REST APIs"
      }
    ],
    "bullet_counts": [1]
  },
  "skills_policy": {
    "allow_count_change": true,
    "dedupe_values": true,
    "prefer_relevance_over_volume": true
  },
  "bold_keywords_policy": {
    "min_items": 8,
    "max_items": 18,
    "source": "job_intelligence.bold_keywords + keyword_bank(high)"
  }
}
```

---

## Prompt Drafts (Scorched-Earth Rewrite)

## Prompt A - JD Intelligence Extraction

### System Prompt (new)

```text
You extract structured hiring intelligence from job descriptions.
Return only valid JSON.

Your output must separate:
1) role expectations,
2) company/team/product context,
3) prioritized keyword strategy for resume tailoring.

Write concise, specific values. Avoid generic filler.
Do not include narrative explanations outside JSON.
```

### User Prompt (new)

```text
Extract structured hiring intelligence from this job description.

OUTPUT REQUIREMENTS:
- Return JSON only.
- Fill all fields in the schema below using null or [] where unknown.
- Build a prioritized keyword bank with `priority` (high/medium/low).
- Produce `bold_keywords` as the shortlist for resume emphasis.
- Include team/company/product context when available.
- Normalize role title and infer role_family and seniority_level.

SCHEMA:
{
  "core_title": "string|null",
  "role_family": "string|null",
  "seniority_level": "string|null",
  "company_name": "string|null",
  "company_context": {
    "industry": "string|null",
    "business_model": "string|null",
    "product_focus": ["string"],
    "customer_type": ["string"]
  },
  "team_context": {
    "team_name": "string|null",
    "domain": ["string"],
    "collaboration_partners": ["string"]
  },
  "must_have": {
    "skills": ["string"],
    "responsibilities": ["string"],
    "experience_requirements": ["string"]
  },
  "nice_to_have": {
    "skills": ["string"],
    "domain_exposure": ["string"]
  },
  "keyword_bank": [
    {"keyword":"string","priority":"high|medium|low","category":"skill|domain|responsibility|tool","should_bold":true}
  ],
  "bold_keywords": ["string"],
  "rewrite_focus": ["string"],
  "language_tone": {
    "avoid_jargon": true,
    "style": "string"
  }
}

JOB DESCRIPTION:
{job_description}
```

## Prompt B - Resume Tailoring Generation

### System Prompt (new)

```text
You are a resume tailoring specialist.
Return only valid JSON.

CALIBRATION & EVIDENCE:
- Keep claims grounded in the provided resume evidence.
- Match scope to the candidate's career level.
- Use direct, natural language and avoid inflated phrasing.
- Prefer clarity over buzzwords.

WRITING QUALITY:
- Keep bullets concrete and outcome-oriented.
- Use varied impact expression (speed, reliability, quality, scale, cost, risk, collaboration), not one repeated metric style.
- Include metrics only where meaningful and well-supported by context.
- Avoid AI-like filler and corporate cliches.

OUTPUT RULES:
- Follow RESPONSE CONTRACT exactly.
- Only edit requested sections/indices.
- Return `bold_keywords` for renderer highlighting across the resume.
```

### User Prompt (new)

```text
Tailor the resume for this job target using structured job intelligence only.

MODE: {mode_id}
OUTPUT LANGUAGE: {output_language}

JOB INTELLIGENCE:
{job_intelligence}

MASTER RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}

INSTRUCTIONS:
1) Summary:
- Keep it concise and role-relevant.
- Reflect domain + strengths aligned to job intelligence.

2) Experience:
- Respect each entry's `role_title_current` and company context.
- Rewrite only indexed bullets requested by contract.
- Keep seniority calibration realistic per role history.
- Add context words naturally (platform/domain/team) when grounded.

3) Projects:
- Use project `title`, `tech_stack_current`, and `summary_current` before rewriting.
- Keep project claims specific and practical.
- Improve tech relevance without sounding synthetic.

4) Skills:
- Regroup and prune for relevance.
- No hard value-count lock.
- Keep concise, non-redundant, role-aligned skill grouping.

5) Bold keywords:
- Return a curated list in `bold_keywords`.
- Prioritize high-signal terms from job intelligence that appear naturally in the tailored resume.
- Avoid stuffing; select meaningful terms only.
```

## Prompt C - Optional Naturalness/Calibration QA (if needed)

This remains optional and can be local-rule first; introduce only if Prompt B still over-produces AI-sounding text.

```text
Check tailored bullets for:
- inflated ownership mismatched to level
- repetitive metric patterns
- generic jargon with low information density
- awkward keyword stuffing

Return only:
{"issues":[...],"suggested_rewrites":[...]}
```

---

## Skills Policy Redesign (No Hard Count)

Current constraint to remove:

- strict `skills_values_count` equality

Replacement policy:

- allow count to change when improving relevance
- dedupe exact or near-duplicate skills
- keep groups compact and readable
- avoid dropping foundational core skills from master resume unless clearly irrelevant
- no forced padding to hit arbitrary counts

---

## Bold Keywords End-to-End Plan

## Data flow

1. Stage A returns `job_intelligence.bold_keywords`.
2. Stage B returns final `bold_keywords` (curated after rewrite).
3. Backend persists this list into render runtime settings:
   - `theme_settings.settings.bold_keywords = [...]`
4. Renderer applies bold emphasis globally based on this list.

## Why this fits current stack

- Frontend already has runtime list support: `RenderCvRuntimeSettings.bold_keywords?: string[]`
- UI already exposes this in runtime controls ("Bold Keywords" comma-separated)
- This phase formalizes list generation from JD intelligence + tailored output.

---

## Implementation Plan (by file)

## 3.3.3.1 Prompt + Version Refactor

- `apps/backend/app/prompts/templates.py`
  - Add new JD intelligence extraction prompt (`EXTRACT_JOB_INTELLIGENCE_PROMPT`)
  - Replace current tailoring system/user prompts with Prompt B drafts
  - Bump prompt versions:
    - `extract_keywords` -> `v2.0` (or rename key to `extract_job_intelligence`)
    - `tailoring_system` -> `v4.0`
    - `tailoring_user` -> `v4.0`

## 3.3.3.2 Analysis Model Expansion

- `apps/backend/app/services/tailoring/models.py`
  - Expand `TailoringJobAnalysis` to include:
    - `company_context`
    - `team_context`
    - `must_have`, `nice_to_have`
    - `keyword_bank`
    - `bold_keywords`
    - `rewrite_focus`

- `apps/backend/app/services/tailoring/analysis.py`
  - Build new extractor call using Prompt A
  - Normalize/dedupe keyword bank and bold keyword shortlist

## 3.3.3.3 Response Contract Upgrade

- `apps/backend/app/services/tailoring/contracts.py`
  - Change experience descriptors from plain company string to object with role title
  - Change project descriptors to include title + current tech/summary context
  - Remove hard `skills_values_count` enforcement from prompt contract
  - Add `bold_keywords_policy` block

- `apps/backend/app/services/tailoring/prompting.py`
  - Update retry hint to include `bold_keywords`
  - Remove any stale assumptions about skills fixed count

## 3.3.3.4 Pipeline + Renderer Linkage

- `apps/backend/app/services/tailoring/orchestration.py`
  - Accept and carry `bold_keywords` from compact LLM response

- `apps/backend/app/routers/resumes.py`
  - On preview/confirm, inject returned `bold_keywords` into `theme_settings.settings.bold_keywords`

## 3.3.3.5 Tests

- `apps/backend/tests/service/test_improver.py`
  - Assert prompt now includes `JOB INTELLIGENCE:` instead of raw JD block
  - Assert response contract includes role/project descriptors
  - Assert no strict skills count contract key
  - Add bold keywords round-trip assertions

- `apps/backend/tests/integration/test_resume_api.py`
  - Verify `settings.bold_keywords` persisted in response payload

- `apps/frontend/tests/*`
  - Ensure runtime keyword list survives normalize/serialize path

---

## Acceptance Criteria

1. Tailoring prompt no longer includes raw `JOB DESCRIPTION` prose block.
2. Experience descriptors include role title + company in contract.
3. Project descriptors include title + tech stack/summary context in contract.
4. Skills contract no longer enforces hard exact value count.
5. Tailoring output includes `bold_keywords` list.
6. `bold_keywords` list is persisted into runtime settings and visible in render controls.
7. Generated bullets read natural and calibrated (no systematic jargon inflation).
8. No regressions in resume structure preservation and rendering output.

---

## Rollout Strategy

1. Ship behind prompt version gate (`v4.0`) and opt-in default off.
2. Run A/B across `keywords` and `full` modes on representative roles.
3. Measure:
   - diff usefulness quality
   - warning rates
   - keyword coverage quality
   - human readability scores
4. Promote `v4.0` to default after stability + quality checks.

---

## Final Notes

This 3.3.3 plan intentionally prioritizes structured context, natural writing quality, and calibration over brute-force keyword stuffing. The goal is an interview-winning resume that reads like real work history, aligns tightly to the job, and remains operationally robust for ATS and renderer workflows.
