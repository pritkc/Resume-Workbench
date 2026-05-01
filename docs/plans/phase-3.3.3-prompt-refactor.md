# Phase 3.3.3 — Prompt Refactor 2.0 (Scorch & Rewrite)

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the entire prompt stack from scratch — JD extraction and resume tailoring — to produce resumes that earn interview calls through natural, mature, ATS-optimized writing.

**Architecture:** Two-prompt pipeline. Prompt 1 extracts deep JD intelligence (replacing the raw JD in the tailoring prompt). Prompt 2 rewrites the resume against that intelligence with an aggressive-but-authentic strategy. The LLM now returns enhanced role titles, project titles, tech stacks, flexible skills, and a bold_keywords list.

**Tech Stack:** Python/FastAPI backend, Pydantic v2 models, existing `complete_json` LLM wrapper.

**Archive note (2026-04):** Implementation drifted: JD intel is persisted as **JSON** (`job_keywords`) with **`$extract_jd_intel_output`** dot-path expansion in prompts — no **`JDIntelligence`** model in **`models.py`**. Sections below that specify `JDIntelligence` / `to_legacy_keywords()` describe this plan’s intended design, not current trunk behavior.

---

## Table of Contents

1. [Philosophy: What Changed and Why](#1-philosophy)
2. [Prompt 1: JD Intelligence Extraction](#2-jd-intelligence-extraction)
3. [Prompt 2: Resume Tailoring](#3-resume-tailoring)
4. [Output Structure Changes](#4-output-structure-changes)
5. [Model & Contract Changes](#5-model--contract-changes)
6. [Pipeline Changes](#6-pipeline-changes)
7. [Refinement Prompt Changes](#7-refinement-prompt-changes)
8. [Frontend Integration](#8-frontend-integration)
9. [Task Breakdown](#9-task-breakdown)

---

## 1. Philosophy

### What the current system does

The current prompts treat the LLM as a **conservative editor** bound by strict honesty constraints:

```
HONESTY (violation = interview harm):
- Never invent skills, tools, certifications, metrics, companies, or dates
- Never upgrade experience level or add new employers
```

Role titles are immutable. Project titles are immutable. Skills have a hard count constraint (`skills_values` must equal original). The raw JD is passed alongside a keyword extraction. The LLM rewrites existing bullets but cannot create new content.

### What the 2.0 system does

The LLM is now a **resume strategist** whose single goal is to earn the interview call:

- **Aggressive alignment**: Rewrite the resume so it naturally inherits every need of the JD
- **Authentic voice**: Keep the writing style and culture of the master resume — no corporate jargon, no AI-sounding language
- **Titles are editable**: Experience roles may gain platform/domain/team/scope context (e.g., "Software Engineer" → "Software Engineer, Platform & Distributed Systems"). Project titles may be enhanced.
- **Tech stacks are collected**: Projects return updated `tech_stacks` and `name`
- **Skills are flexible**: No hard count — the LLM may add skills the JD demands that the candidate can credibly claim
- **Bold keywords**: The LLM returns a list of 10–20 keywords that the renderer will bold throughout the PDF
- **Content creation allowed**: The LLM may replace the least applicable content with naturally fitting alternatives — the candidate will prepare for the interview
- **No raw JD in tailoring prompt**: The extraction prompt captures everything; the tailoring prompt receives only structured intelligence
- **Calibrated writing**: Scope and claims are calibrated to the candidate's actual seniority, tenure, and domain — an intern does not "architect enterprise systems"
- **ATS-optimized maturely**: Keywords are woven naturally, not stuffed; every keyword sits in meaningful context

### What stays the same

- Compact addressed diff format (experience/projects keyed by index, bullets keyed by index)
- Server-side reconstruction via `apply_compact_diff`
- Preservation pipeline (restore dates, personal info, custom sections)
- AI-phrase cleanup post-processing
- Three modes: nudge, keywords, full
- The `complete_json` LLM wrapper and observability

---

## 2. JD Intelligence Extraction

### Current prompt (`EXTRACT_KEYWORDS_PROMPT`)

Basic keyword extraction: pulls `core_title`, `company_name`, `location`, flat skill lists, `keywords`, `experience_years`, `seniority_level`. ~90 tokens of instruction.

### Problems

1. Too shallow — no company context, team, domain, product understanding
2. No responsibility themes (just raw copies)
3. No ATS keyword list distinct from skill lists
4. No bold keyword selection
5. No calibration signals for seniority-appropriate writing
6. The tailoring prompt still receives the raw JD (redundant, wastes tokens)

### New prompt: `EXTRACT_JD_INTELLIGENCE_PROMPT`

**System prompt:**
```
You are a job description analyst. Extract actionable intelligence for resume tailoring. Output only valid JSON, no other text.
```

**User prompt:**
```
Analyze this job description and extract comprehensive intelligence for resume tailoring.

Output JSON matching this schema:

{
  "role": {
    "title": "core role title — no company name, location, or qualifiers",
    "seniority": "junior | mid | senior | staff | principal | lead",
    "function": "primary function (full-stack, backend, data engineering, devops, etc.)",
    "scope": "expected scope of work (team-level delivery, org-wide standardization, cross-functional initiatives, etc.)"
  },
  "company": {
    "name": "company name or null",
    "team": "specific team or division or null",
    "domain": "industry and domain context (fintech, healthtech, enterprise SaaS, e-commerce, etc.)",
    "product_context": "what the team builds — infer from the description",
    "scale_signals": ["any mentions of scale: user counts, transaction volumes, data volume, global reach"]
  },
  "location": "location or remote arrangement or null",
  "technical_requirements": {
    "primary_stack": ["hard-required technologies in the order the JD emphasizes"],
    "secondary_stack": ["preferred or nice-to-have technologies"],
    "infrastructure": ["cloud platforms, devops, infra tools"],
    "paradigms": ["architectural patterns and methodologies: microservices, event-driven, agile, CI/CD, etc."]
  },
  "requirements": {
    "years": 5,
    "must_have": ["hard requirements as stated in the JD"],
    "preferred": ["nice-to-have qualifications"],
    "education": "education requirement or null"
  },
  "responsibility_themes": [
    "distill responsibilities into 5-8 actionable themes for resume writing — not raw JD copies"
  ],
  "ats_keywords": [
    "every technical term, tool, methodology, and domain keyword an ATS would scan for — be thorough"
  ],
  "bold_keywords": [
    "the 10-15 most impactful keywords that should appear prominently in the resume"
  ],
  "calibration": {
    "seniority_expectations": "what this level is expected to demonstrate — ownership scope, leadership, depth",
    "team_context": "IC, tech lead, cross-team, org-wide, etc."
  }
}

Rules:
- role.title: strip company name, location, employment type, "apply now"-style noise
- company.product_context: infer from team/division description what they build or maintain
- responsibility_themes: distill into themes a resume writer can target, not raw JD bullet copies. Examples: "API architecture & governance", "cloud-native microservices", "frontend accessibility & performance"
- ats_keywords: include every technical and domain term. Include common abbreviation variants (e.g., "CI/CD" and "Continuous Integration/Continuous Deployment")
- bold_keywords: the highest-signal keywords for this specific role — will be visually emphasized in the final resume
- calibration.seniority_expectations: interpret what scope of impact, leadership, and technical depth this level demands
- Use null for missing scalars, [] for missing arrays

Job description:
{job_description}
```

### New extraction model: `JDIntelligence`

Replaces `TailoringJobAnalysis` in the prompt pipeline. See [Section 5](#5-model--contract-changes) for the Pydantic model.

### Migration path

- Rename `extract_job_keywords` → `extract_jd_intelligence` in `analysis.py`
- Old `TailoringJobAnalysis` is replaced by `JDIntelligence`
- The old `find_supported_keywords` function becomes unnecessary — the 2.0 approach does not restrict keywords to those already in the resume
- `build_job_analysis` is replaced by `build_jd_intelligence` which just validates and trims the extraction output

---

## 3. Resume Tailoring

### Current prompts

**System (`TAILORING_SYSTEM_PROMPT`):** Conservative editor. HONESTY block forbids inventing anything. OUTPUT block enforces compact diff format. VOICE block bans certain words.

**User (`IMPROVE_RESUME_PROMPT_TEMPLATE`):** Includes MODE, rewriting example, JOB ANALYSIS, JOB DESCRIPTION (raw), RESUME, RESPONSE CONTRACT.

### New system prompt: `TAILORING_SYSTEM_PROMPT_V2`

```
You are a senior resume strategist. Your single goal: craft a resume that earns the interview call.

APPROACH:
- Rewrite the resume so the candidate naturally fits the target role
- The writing must read like the candidate genuinely wrote it — someone who has done the work and knows the domain
- Maintain the candidate's authentic voice and writing culture from their master resume
- Relate work naturally to what the target employer and team care about
- You may replace the least relevant bullets with content that naturally supports the role
- Titles may be enhanced: add platform, domain, team, or functional scope (e.g., "Software Engineer" → "Software Engineer, Platform & Distributed Systems")
- For projects, naturally relate them to the company's products or domain where the candidate was employed

WRITING STANDARDS:
- Write like a real engineer — specific, concrete, direct
- Every bullet earns its place: what was done, how, and what it achieved
- No trailing purpose clauses ("enhancing system reliability") or self-narrating ("demonstrating expertise in X")
- Active verbs: built, designed, led, shipped, implemented, migrated, automated, improved, reduced, created, integrated, deployed
- Banned: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive, streamlined, cutting-edge, state-of-the-art
- No em-dash
- Vary metrics across bullets: time saved, latency reduced, throughput improved, cost cut, data volume, team size, user count, SLA numbers, error rate reduction — do not repeat the same metric type in consecutive bullets
- Metrics only where credible for the role's seniority and tenure
- Calibrate scope to experience level: early career roles get modest bullets, senior roles can claim system-wide impact. A 3-month intern does not "architect" anything. A first job does not "drive organization-wide strategy"
- Short stints get proportionally scoped bullets

ATS OPTIMIZATION:
- Weave keywords throughout: summary, bullets, skills, project descriptions
- Use exact keyword forms from the job intelligence (e.g., "Spring Boot" not "Spring framework", "Kubernetes" not "K8s")
- Place the highest-priority keywords early in bullets and in the summary
- Never stuff keywords or write hollow ATS-bait sentences — every keyword sits in a meaningful, natural context

OUTPUT FORMAT:
- Valid JSON only — no markdown, no commentary
- Keys: "summary", "experience", "projects", "skills", "bold_keywords"
- summary: one sentence. "[N]+ years in [domain], [1-2 JD-aligned strengths]."
- experience: object keyed by 0-based entry index ("0", "1", …)
  - include only entries you change
  - each entry: { "position": "enhanced title or omit", "bullets": { "INDEX": "text" } }
  - INDEX must be within the entry's bullet_count
  - omit an INDEX to keep that bullet unchanged
- projects: object keyed by 0-based entry index
  - each entry: { "name": "enhanced title or omit", "tech_stacks": "updated tagline or omit", "bullets": { "INDEX": "text" } }
- skills: array of { "label": "...", "values": [...] }
  - regroup and relabel freely for JD relevance
  - you may add skills the JD demands that the candidate can credibly claim
  - place JD-critical skills in the first groups
  - omit "skills" key entirely if no changes
- bold_keywords: array of 10-20 strings — keywords from the final resume content that should be rendered bold, selected for maximum JD alignment
- Do NOT emit: id, company, location, dates, github, website, customSections
```

### New user prompt: `IMPROVE_RESUME_PROMPT_V2`

```
Tailor this resume for the target role.

MODE: {mode_id} — {mode_constraint}

REWRITING EXAMPLE:
Original: "Worked on backend systems"
JD needs: Kubernetes, CI/CD, microservices
Rewritten: "Built and maintained backend microservices deployed on Kubernetes with automated CI/CD pipelines, reducing deployment time from 2 hours to 15 minutes"

JOB INTELLIGENCE:
{job_intelligence}

MASTER RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}

Output language: {output_language}
```

Key changes from current:
- **JOB DESCRIPTION block removed** — all JD context is captured in JOB INTELLIGENCE
- **RESUME renamed to MASTER RESUME** — clarifies this is the source of truth for voice and culture
- **JOB ANALYSIS renamed to JOB INTELLIGENCE** — reflects the richer extraction

### New mode constraints: `TAILORING_MODE_CONSTRAINTS_V2`

```python
TAILORING_MODE_CONSTRAINTS = {
    "nudge": (
        "Conservative alignment. Improve wording and weave in a few high-priority keywords. "
        "Keep original voice nearly intact. Do not change titles. "
        "Only touch bullets that clearly benefit. Omit unchanged entries."
    ),
    "keywords": (
        "Keyword-focused alignment. Weave JD keywords into bullets where they fit naturally. "
        "May adjust role titles to add relevant context. Regroup skills for JD relevance. "
        "Omit unchanged entries."
    ),
    "full": (
        "Maximum alignment. Rewrite bullets to strongly match the target role. "
        "Enhance titles with platform, domain, or scope context. "
        "Replace least applicable bullets with naturally fitting alternatives. "
        "Regroup and expand skills for maximum JD coverage. "
        "Every bullet should serve the candidate's case for this specific role."
    ),
}
```

### New strategy guidance: `IMPROVE_STRATEGY_GUIDANCE_V2`

```python
IMPROVE_STRATEGY_GUIDANCE = {
    "nudge": {
        "primary_goal": (
            "Make minimal wording improvements and add a few high-priority keywords "
            "where the resume already supports them."
        ),
        "description_rule": (
            "Rewrite only bullets that clearly benefit from adjustment. "
            "Preserve all others unchanged."
        ),
    },
    "keywords": {
        "primary_goal": (
            "Weave JD keywords naturally into bullets and skills. "
            "May enhance titles and regroup skills for relevance."
        ),
        "description_rule": (
            "Rewrite bullets where keywords fit naturally. May replace weak bullets "
            "with keyword-rich alternatives. Preserve strong bullets unchanged."
        ),
    },
    "full": {
        "primary_goal": (
            "Maximize alignment with the target role. Rewrite for impact, "
            "enhance titles, expand skills, and replace weak content."
        ),
        "description_rule": (
            "Rewrite all bullets for maximum JD alignment. Replace the least applicable "
            "with naturally fitting alternatives. No content should feel generic."
        ),
    },
}
```

---

## 4. Output Structure Changes

### Current compact output

```json
{
  "summary": "...",
  "experience": {
    "0": { "bullets": { "0": "...", "2": "..." } }
  },
  "projects": {
    "0": { "tech_stacks": "...", "bullets": { "0": "..." } }
  },
  "skills": [{ "label": "...", "values": [...] }]
}
```

### New compact output (2.0)

```json
{
  "summary": "3+ years in distributed systems and full-stack engineering, with expertise in cloud-native microservices and CI/CD automation.",
  "experience": {
    "0": {
      "position": "Software Engineer, Data Platform & MLOps",
      "bullets": {
        "0": "Designed CDC-style update pipelines for a 1.2M-member RAG system...",
        "2": "Built a Delta Lake audit schema with PostgreSQL partitioning..."
      }
    },
    "3": {
      "position": "Software Engineer, Logistics & Integration Platform",
      "bullets": {
        "0": "Built a high-reliability webhook ingestion service using RabbitMQ...",
        "1": "Ran database migration pipelines across 12 distribution centers..."
      }
    }
  },
  "projects": {
    "0": {
      "name": "MOLE Docs | Scientific Computing Documentation Platform",
      "tech_stacks": "Python, Sphinx, C++, CI/CD, Documentation Pipelines",
      "bullets": {
        "0": "Built an automated documentation pipeline using Sphinx and Python..."
      }
    },
    "1": {
      "name": "First2Fetch | Full-Stack Job Aggregation Platform",
      "tech_stacks": "Node.js, TypeScript, PostgreSQL, REST APIs",
      "bullets": {
        "0": "Built a REST API aggregator with PostgreSQL GIN indexes..."
      }
    }
  },
  "skills": [
    { "label": "Languages & Frameworks", "values": ["Python", "Java", "TypeScript", "SQL", "Spring Boot", "React"] },
    { "label": "Distributed Systems & Data", "values": ["Kafka", "Redis", "PostgreSQL", "PySpark", "Airflow"] },
    { "label": "Cloud & DevOps", "values": ["AWS", "Kubernetes", "Docker", "Terraform", "CI/CD"] }
  ],
  "bold_keywords": [
    "microservices", "distributed systems", "Kubernetes", "CI/CD",
    "Spring Boot", "React", "TypeScript", "REST APIs", "PostgreSQL",
    "Redis", "Kafka", "cloud-native", "Airflow", "observability"
  ]
}
```

### Field-by-field changes

| Field | Current | 2.0 | Change |
|-------|---------|-----|--------|
| `experience[N].position` | Not returned (immutable) | **Returned** — enhanced title | LLM may add platform/domain/team/scope context |
| `projects[N].name` | Not returned (immutable) | **Returned** — enhanced title | LLM may refine project names |
| `projects[N].tech_stacks` | Optional return | **Expected return** — updated tagline | LLM aligns tech stack description to JD |
| `skills` | Hard count = `skills_values` | **Flexible** — may add skills | No hard count constraint |
| `bold_keywords` | Not present | **New field** — 10-20 strings | Keywords for PDF bold rendering |
| `experience[N].bullets` | Unchanged | Same behavior | Selective overwrite by index |
| `projects[N].bullets` | Unchanged | Same behavior | Selective overwrite by index |

---

## 5. Model & Contract Changes

### New: `JDIntelligence` (replaces `TailoringJobAnalysis`)

**File:** `apps/backend/app/services/tailoring/models.py`

```python
class JDRoleContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    title: str | None = None
    seniority: str | None = None
    function: str | None = None
    scope: str | None = None

class JDCompanyContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    name: str | None = None
    team: str | None = None
    domain: str | None = None
    product_context: str | None = None
    scale_signals: list[str] = Field(default_factory=list)

class JDTechnicalRequirements(BaseModel):
    model_config = ConfigDict(extra="ignore")
    primary_stack: list[str] = Field(default_factory=list)
    secondary_stack: list[str] = Field(default_factory=list)
    infrastructure: list[str] = Field(default_factory=list)
    paradigms: list[str] = Field(default_factory=list)

class JDRequirements(BaseModel):
    model_config = ConfigDict(extra="ignore")
    years: int | None = None
    must_have: list[str] = Field(default_factory=list)
    preferred: list[str] = Field(default_factory=list)
    education: str | None = None

class JDCalibration(BaseModel):
    model_config = ConfigDict(extra="ignore")
    seniority_expectations: str | None = None
    team_context: str | None = None

class JDIntelligence(BaseModel):
    """Rich job description intelligence for the tailoring prompt."""
    model_config = ConfigDict(extra="ignore")

    role: JDRoleContext = Field(default_factory=JDRoleContext)
    company: JDCompanyContext = Field(default_factory=JDCompanyContext)
    location: str | None = None
    technical_requirements: JDTechnicalRequirements = Field(default_factory=JDTechnicalRequirements)
    requirements: JDRequirements = Field(default_factory=JDRequirements)
    responsibility_themes: list[str] = Field(default_factory=list)
    ats_keywords: list[str] = Field(default_factory=list)
    bold_keywords: list[str] = Field(default_factory=list)
    calibration: JDCalibration = Field(default_factory=JDCalibration)

    def to_prompt_dict(self) -> dict[str, Any]:
        """Compact JSON without empty fields."""
        def strip_empty(d: Any) -> Any:
            if isinstance(d, dict):
                return {k: strip_empty(v) for k, v in d.items() if v not in (None, "", [], {})}
            if isinstance(d, list):
                return [strip_empty(i) for i in d]
            return d
        return strip_empty(self.model_dump())
```

### Updated: `CompactBulletDiff`

**File:** `apps/backend/app/services/tailoring/models.py`

```python
class CompactBulletDiff(BaseModel):
    """Per-entry diff in the compact addressed output format."""
    model_config = ConfigDict(extra="ignore")

    position: str | None = None    # experience title enhancement
    name: str | None = None        # project title enhancement
    tech_stacks: str | None = None # project tagline
    bullets: dict[str, str] = Field(default_factory=dict)
```

### Updated: `TailoringLLMResponseV2`

**File:** `apps/backend/app/services/tailoring/models.py`

```python
class TailoringLLMResponseV2(BaseModel):
    """Compact LLM response with title enhancements and bold keywords."""
    model_config = ConfigDict(extra="ignore")

    summary: str = ""
    experience: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    projects: dict[str, CompactBulletDiff] = Field(default_factory=dict)
    skills: list[dict[str, Any]] | None = None
    bold_keywords: list[str] = Field(default_factory=list)

    @field_validator("skills", mode="before")
    @classmethod
    def _normalize_skills(cls, v: Any) -> Any:
        if isinstance(v, dict):
            return v.get("groups") or None
        return v
```

### Updated: `TailoringResponseContract.to_prompt_dict()`

**File:** `apps/backend/app/services/tailoring/models.py`

```python
def to_prompt_dict(self) -> dict[str, Any]:
    out: dict[str, Any] = {
        "mode": self.prompt_mode,
        "output_keys": ["summary", "experience", "projects", "skills", "bold_keywords"],
    }
    if self.experience_entries:
        out["experience"] = {
            "entries": self.experience_entries,
            "positions": self.experience_positions,      # NEW
            "bullet_counts": self.experience_bullet_counts,
        }
    if self.project_entries:
        out["projects"] = {
            "entries": self.project_entries,
            "tech_stacks": self.project_tech_stacks,     # NEW
            "bullet_counts": self.project_bullet_counts,
        }
    return out
```

Note: `skills_values` count is **removed** from the contract. No hard limit.

New fields on `TailoringResponseContract`:
```python
experience_positions: list[str] = Field(default_factory=list)   # current titles
project_tech_stacks: list[str] = Field(default_factory=list)    # current tech stacks
```

### Updated: `contracts.py` — `build_response_contract()`

```python
experience_positions=[e.position or e.title for e in work_entries],
project_tech_stacks=[e.tech_stacks or "" for e in project_entries],
```

Remove `skills_values_count` from the contract builder.

### Updated: `TailoringResult`

Add `bold_keywords` to the result:

```python
class TailoringResult(BaseModel):
    # ... existing fields ...
    bold_keywords: list[str] = Field(default_factory=list)   # NEW
```

---

## 6. Pipeline Changes

### `analysis.py` — JD extraction

| Current | New |
|---------|-----|
| `extract_job_keywords()` | `extract_jd_intelligence()` |
| `EXTRACT_KEYWORDS_PROMPT` | `EXTRACT_JD_INTELLIGENCE_PROMPT` |
| `TailoringJobAnalysis` | `JDIntelligence` |
| `build_job_analysis()` | `build_jd_intelligence()` — validates and trims |
| `find_supported_keywords()` | **Removed** — 2.0 does not restrict keywords to those in the resume |
| `job_analysis_to_prompt_json()` | `jd_intelligence_to_prompt_json()` |

The `extract_jd_intelligence` function:
1. Sends the raw JD to the LLM with the new extraction prompt
2. Validates the response into `JDIntelligence`
3. Merges `extract_job_target_metadata()` results for backward compatibility (role, company, location used by cover letter, application pack title, etc.)
4. Returns both the `JDIntelligence` object and the raw dict (for caching/storage)

**Important:** The existing `extract_job_keywords` return format is used by multiple consumers:
- Cover letter generation (`cover_letter.py`)
- Application pack title (`build_job_target_title`)
- Location injection in `finalize_tailored_resume`
- Improvement suggestion generator

The new `extract_jd_intelligence` must produce a backward-compatible `job_keywords` dict alongside the new `JDIntelligence` model. Strategy: `JDIntelligence` has a `to_legacy_keywords()` method:

```python
def to_legacy_keywords(self) -> dict[str, Any]:
    """Produce the old job_keywords dict for backward-compatible consumers."""
    return {
        "core_title": self.role.title,
        "company_name": self.company.name,
        "location": self.location,
        "required_skills": self.technical_requirements.primary_stack,
        "preferred_skills": self.technical_requirements.secondary_stack,
        "keywords": self.ats_keywords,
        "key_responsibilities": self.responsibility_themes,
        "experience_years": self.requirements.years,
        "seniority_level": self.role.seniority,
        "experience_requirements": self.requirements.must_have,
        "education_requirements": [self.requirements.education] if self.requirements.education else [],
    }
```

### `prompting.py` — Prompt assembly

Changes:
1. `TailoringPromptContext` — replace `job_analysis_json` with `job_intelligence_json`, remove `job_description_excerpt`
2. `build_prompt_context()` — no longer receives `job_description_excerpt`; receives `JDIntelligence` instead of `TailoringJobAnalysis`
3. `render_tailoring_prompt()` — renders the new template (no `{job_description}` placeholder)
4. `build_tailoring_retry_hint()` — update to include `bold_keywords` in the expected keys

Updated `TailoringPromptContext`:
```python
@dataclass(frozen=True)
class TailoringPromptContext:
    prompt_id: str
    output_language: str
    mode_constraint: str
    strategy_primary_goal: str
    response_contract_json: str
    job_intelligence_json: str          # was job_analysis_json
    # job_description_excerpt: REMOVED
    original_resume_json: str
    retry_hint: str
    system_prompt: str
    used_structured_resume_input: bool
```

### `orchestration.py` — Main flow

Changes:
1. Call `extract_jd_intelligence()` instead of using existing `job_keywords` as-is
2. Build `JDIntelligence` from the extraction result
3. Remove `sanitized_jd` / `trim_job_description_for_prompt` — no longer needed in the tailoring prompt
4. Remove `find_supported_keywords` call
5. Extract `bold_keywords` from the LLM response and include in `TailoringResult`
6. Pass `bold_keywords` through the result

Updated flow in `generate_tailored_resume()`:
```python
jd_intelligence = build_jd_intelligence(job_keywords)

response_contract = build_response_contract(
    prompt_resume_data,
    prompt_id=resolved_prompt_id,
)
prompt_context = build_prompt_context(
    prompt_id=resolved_prompt_id,
    language=language,
    jd_intelligence=jd_intelligence,
    response_contract=response_contract,
    resume_payload=prompt_resume_data,
    original_resume_markdown=original_resume,
)

# ... LLM call ...

# Extract bold_keywords from response
bold_keywords = llm_response_v2.bold_keywords if has_compact_content else []

return TailoringResult(
    # ... existing fields ...
    bold_keywords=bold_keywords,
)
```

### `preservation.py` — `apply_compact_diff()` updates

New handling for:
1. **`position` in experience entries**: If the diff contains `position`, overwrite the entry's `position` (and `title` to stay in sync)
2. **`name` in project entries**: If the diff contains `name`, overwrite the entry's `name`
3. **`tech_stacks` in project entries**: Already handled — no change needed
4. **Skills count validation relaxed**: Remove the `_strip_invented_skills` logic. Instead, just accept the skills as-is (the prompt handles quality). Keep basic structural validation (must be a list of `{label, values}` dicts).

```python
# In experience entry handling:
if "position" in entry_diff:
    pos = entry_diff["position"]
    if isinstance(pos, str) and pos.strip():
        entry["position"] = pos.strip()
        entry["title"] = pos.strip()  # keep in sync

# In project entry handling:
if "name" in entry_diff:
    nm = entry_diff["name"]
    if isinstance(nm, str) and nm.strip():
        entry["name"] = nm.strip()
```

**Skills handling change:** Remove the `invented_skills` check. The 2.0 philosophy explicitly allows adding skills. Keep structural validation only:
```python
skills_diff = diff.get("skills")
if isinstance(skills_diff, list):
    result.setdefault("skills", {})["groups"] = skills_diff
```

### `finalize_tailored_resume()` in `preservation.py`

- The `preserve_original_skills` function currently restores missing skills from the original. In 2.0, this should be relaxed: preserve original skills that the LLM didn't explicitly reorganize, but don't force the original count. If the LLM produced skills, use them as authoritative.
- The logic for `restore_missing_additional_items` should check if the LLM returned a `skills` key at all — if yes, use the LLM's version; if no, keep the original.

---

## 7. Refinement Prompt Changes

### `KEYWORD_INJECTION_PROMPT` — Remove

This prompt is redundant in 2.0. The main tailoring prompt already handles keyword weaving comprehensively via the JD intelligence and ATS optimization instructions. The keyword injection pass was a band-aid for the conservative approach that wouldn't add keywords aggressively enough.

**Action:** Remove `KEYWORD_INJECTION_PROMPT` from `refinement.py`. Remove any calls to it in the pipeline (check `preservation.py` and `orchestration.py` for keyword injection pass usage).

### `VALIDATION_POLISH_PROMPT` — Update

Remove the "verify against master resume" constraints. Keep the AI-phrase cleanup:

```
Review and polish this resume content. Remove any AI-sounding language.

REMOVE or REPLACE:
- Buzzwords: "spearheaded", "synergy", "leverage", "orchestrated", etc.
- Em-dashes (use commas or semicolons instead)
- Overly formal language: "utilized" → "used", "endeavored" → "worked"
- Generic filler: "in order to" → "to"
- Trailing purpose clauses: "...enhancing system reliability" — remove the clause
- Self-narrating phrases: "demonstrating expertise in X" — remove

Resume to polish:
{resume}

Output the polished resume JSON. Return ONLY valid JSON.
```

Note: The local `apply_local_resume_cleanup` and `remove_ai_phrases` functions in `refiner.py` should remain — they are string-level cleanup that runs without an LLM call.

---

## 8. Frontend Integration

### Bold keywords passthrough

The backend must pass `bold_keywords` from `TailoringResult` through to the frontend via the preview/confirm API responses.

**Current flow:**
1. `_improve_preview_flow()` in `routers/resumes.py` calls `generate_tailored_resume()`
2. Returns diff summary, artifacts, etc.
3. The `bold_keywords` are not currently in the response

**New flow:**
1. Extract `bold_keywords` from `TailoringResult`
2. Include in the preview response payload
3. Frontend receives and stores in `theme_settings.settings.bold_keywords`
4. The existing `RenderCvRuntimeSettings.bold_keywords` field already supports string arrays
5. The renderer already reads `bold_keywords` and applies them in PDF output

**Files to modify:**
- `routers/resumes.py` — include `bold_keywords` in preview response
- Frontend: auto-populate `theme_settings.settings.bold_keywords` from the tailoring response (if present)
- `schemas/models.py` — add `bold_keywords` to the improve preview response schema

### Title changes in diff

Currently, `calculate_resume_diff()` doesn't report title changes because titles were immutable. The diff engine needs to detect and report:
- `position` changes in work experience
- `name` changes in projects

**File:** `apps/backend/app/services/tailoring/diffing.py`

Add title/name comparison to the diff engine. New `field_type` values: `"experience_title"`, `"project_title"`.

---

## 9. Task Breakdown

### Task 1: JD Intelligence Extraction Prompt & Model

**Files:**
- Modify: `apps/backend/app/prompts/templates.py`
- Modify: `apps/backend/app/services/tailoring/models.py`
- Modify: `apps/backend/app/services/tailoring/analysis.py`

- [ ] **Step 1:** Add `JDIntelligence` and sub-models (`JDRoleContext`, `JDCompanyContext`, `JDTechnicalRequirements`, `JDRequirements`, `JDCalibration`) to `models.py`
- [ ] **Step 2:** Add `to_prompt_dict()` method on `JDIntelligence` (strips empty fields)
- [ ] **Step 3:** Add `to_legacy_keywords()` method on `JDIntelligence` for backward compatibility
- [ ] **Step 4:** Write new `EXTRACT_JD_INTELLIGENCE_PROMPT` and `EXTRACT_JD_INTELLIGENCE_SYSTEM_PROMPT` in `templates.py`
- [ ] **Step 5:** Replace old `EXTRACT_KEYWORDS_PROMPT` and `EXTRACT_KEYWORDS_SYSTEM_PROMPT` (keep old names as aliases if needed for import compatibility, or update all imports)
- [ ] **Step 6:** Rewrite `extract_job_keywords()` → `extract_jd_intelligence()` in `analysis.py`. Return `JDIntelligence` + legacy dict.
- [ ] **Step 7:** Rewrite `build_job_analysis()` → `build_jd_intelligence()` in `analysis.py`. Accept raw dict from extraction, validate into `JDIntelligence`.
- [ ] **Step 8:** Remove `find_supported_keywords()` function
- [ ] **Step 9:** Rewrite `job_analysis_to_prompt_json()` → `jd_intelligence_to_prompt_json()` in `analysis.py`
- [ ] **Step 10:** Update `PROMPT_VERSIONS` — bump `extract_keywords` to `v2.0`
- [ ] **Step 11:** Commit: `feat: rewrite JD extraction to produce rich intelligence model`

### Task 2: Tailoring System & User Prompts

**Files:**
- Modify: `apps/backend/app/prompts/templates.py`

- [ ] **Step 1:** Replace `TAILORING_SYSTEM_PROMPT` with the 2.0 version from Section 3
- [ ] **Step 2:** Replace `IMPROVE_RESUME_PROMPT_TEMPLATE` with the 2.0 version from Section 3 (remove `{job_description}` placeholder)
- [ ] **Step 3:** Replace `TAILORING_MODE_CONSTRAINTS` with the 2.0 versions from Section 3
- [ ] **Step 4:** Replace `IMPROVE_STRATEGY_GUIDANCE` with the 2.0 versions from Section 3
- [ ] **Step 5:** Bump `PROMPT_VERSIONS` — `tailoring_system: "v4.0"`, `tailoring_user: "v4.0"`
- [ ] **Step 6:** Commit: `feat: rewrite tailoring prompts for 2.0 strategy`

### Task 3: Response Models & Contract

**Files:**
- Modify: `apps/backend/app/services/tailoring/models.py`
- Modify: `apps/backend/app/services/tailoring/contracts.py`

- [ ] **Step 1:** Update `CompactBulletDiff` — add `position: str | None = None` and `name: str | None = None`
- [ ] **Step 2:** Update `TailoringLLMResponseV2` — add `bold_keywords: list[str] = Field(default_factory=list)`
- [ ] **Step 3:** Add `experience_positions: list[str]` and `project_tech_stacks: list[str]` to `TailoringResponseContract`
- [ ] **Step 4:** Update `TailoringResponseContract.to_prompt_dict()` — add `positions` to experience, `tech_stacks` to projects, add `bold_keywords` to `output_keys`, remove `skills_values`
- [ ] **Step 5:** Update `build_response_contract()` in `contracts.py` — populate `experience_positions`, `project_tech_stacks`, remove `skills_values_count`
- [ ] **Step 6:** Add `bold_keywords: list[str]` to `TailoringResult`
- [ ] **Step 7:** Commit: `feat: update response models for 2.0 output structure`

### Task 4: Pipeline (prompting, orchestration, preservation)

**Files:**
- Modify: `apps/backend/app/services/tailoring/prompting.py`
- Modify: `apps/backend/app/services/tailoring/orchestration.py`
- Modify: `apps/backend/app/services/tailoring/preservation.py`

- [ ] **Step 1:** Update `TailoringPromptContext` — replace `job_analysis_json` with `job_intelligence_json`, remove `job_description_excerpt`
- [ ] **Step 2:** Update `build_prompt_context()` — accept `JDIntelligence` instead of `TailoringJobAnalysis`, remove `job_description_excerpt` param
- [ ] **Step 3:** Update `render_tailoring_prompt()` — use new template placeholders (`{job_intelligence}` instead of `{job_analysis}` + `{job_description}`)
- [ ] **Step 4:** Update `build_tailoring_retry_hint()` — include `bold_keywords` in expected keys
- [ ] **Step 5:** Update `apply_compact_diff()` in `preservation.py` — handle `position` in experience entries and `name` in project entries
- [ ] **Step 6:** Relax skills validation in `apply_compact_diff()` — remove `_strip_invented_skills` call, accept skills as-is
- [ ] **Step 7:** Update `generate_tailored_resume()` in `orchestration.py`:
  - Replace `find_supported_keywords` + `build_job_analysis` with `build_jd_intelligence`
  - Remove `sanitized_jd` / `trim_job_description_for_prompt`
  - Update `build_prompt_context()` call (new signature)
  - Extract `bold_keywords` from LLM response
  - Pass `bold_keywords` into `TailoringResult`
- [ ] **Step 8:** Update `finalize_tailored_resume()` — relax skills preservation (if LLM returned skills, trust them)
- [ ] **Step 9:** Commit: `feat: update pipeline for 2.0 prompt architecture`

### Task 5: Refinement Prompt Cleanup

**Files:**
- Modify: `apps/backend/app/prompts/refinement.py`
- Modify: `apps/backend/app/services/tailoring/preservation.py` (if keyword injection is called)

- [ ] **Step 1:** Remove `KEYWORD_INJECTION_PROMPT` from `refinement.py` (keep AI_PHRASE_BLACKLIST and replacements)
- [ ] **Step 2:** Update `VALIDATION_POLISH_PROMPT` — remove "verify against master resume" constraints, keep AI-phrase cleanup
- [ ] **Step 3:** Remove any calls to keyword injection LLM pass in the pipeline (search for `KEYWORD_INJECTION_PROMPT` usage)
- [ ] **Step 4:** Verify `apply_local_resume_cleanup` / `remove_ai_phrases` still run correctly
- [ ] **Step 5:** Commit: `refactor: remove redundant keyword injection, update polish prompt`

### Task 6: Frontend Bold Keywords & Title Changes

**Files:**
- Modify: `apps/backend/app/routers/resumes.py` — preview/confirm response
- Modify: `apps/backend/app/schemas/models.py` — response schema
- Modify: `apps/backend/app/services/tailoring/diffing.py` — title diff detection
- Modify: `apps/frontend/` — bold_keywords auto-population

- [ ] **Step 1:** Add `bold_keywords: list[str]` to the improve preview response in `routers/resumes.py`
- [ ] **Step 2:** Update `_improve_preview_flow()` to extract `bold_keywords` from `TailoringResult` and include in response
- [ ] **Step 3:** Add title/name comparison to `calculate_resume_diff()` in `diffing.py`
- [ ] **Step 4:** Frontend: when receiving tailoring preview, auto-populate `theme_settings.settings.bold_keywords` from the response
- [ ] **Step 5:** Verify existing PDF renderer respects the `bold_keywords` list
- [ ] **Step 6:** Commit: `feat: pass bold_keywords and title changes through to frontend`

### Task 7: Test Updates

**Files:**
- Modify: `apps/backend/tests/service/test_improver.py`
- Modify: `apps/backend/tests/unit/test_compact_diff.py`
- Modify: `apps/backend/tests/unit/test_refiner.py`
- Modify: `apps/backend/tests/unit/test_rendercv_adapter.py`
- Modify: `apps/backend/tests/integration/test_resume_api.py`

- [ ] **Step 1:** Update mock LLM responses in `test_improver.py` to include `bold_keywords` and optional `position`/`name` fields
- [ ] **Step 2:** Update prompt assertion tests to match new prompt text / contract shape
- [ ] **Step 3:** Add test cases for `apply_compact_diff` handling of `position` and `name` overrides
- [ ] **Step 4:** Update skills-related tests to remove hard count assertions
- [ ] **Step 5:** Add test for `JDIntelligence.to_legacy_keywords()` backward compatibility
- [ ] **Step 6:** Add test for `JDIntelligence.to_prompt_dict()` empty-field stripping
- [ ] **Step 7:** Update integration tests to match new response shapes
- [ ] **Step 8:** Run full test suite, fix any remaining failures
- [ ] **Step 9:** Commit: `test: update tests for 2.0 prompt architecture`

### Task 8: Backward Compatibility Verification

- [ ] **Step 1:** Verify cover letter generation still works (uses `to_legacy_keywords()` path)
- [ ] **Step 2:** Verify outreach generation still works
- [ ] **Step 3:** Verify application pack title generation still works
- [ ] **Step 4:** Verify location injection in `finalize_tailored_resume` still works (location now comes from `JDIntelligence.location`)
- [ ] **Step 5:** Verify suggestion generator still works (uses legacy keywords format)
- [ ] **Step 6:** Smoke test: run a full preview flow end-to-end
- [ ] **Step 7:** Commit: `chore: verify backward compatibility for all consumers`

---

## Acceptance Criteria

- [ ] HONESTY block completely removed from `TAILORING_SYSTEM_PROMPT`
- [ ] Raw JD no longer passed in the tailoring user prompt
- [ ] JD extraction produces rich `JDIntelligence` with role, company, tech, keywords, calibration
- [ ] Experience entries may include `position` (enhanced title) in LLM output
- [ ] Project entries may include `name` (enhanced title) and `tech_stacks` in LLM output
- [ ] Skills have no hard count constraint — LLM may add JD-relevant skills
- [ ] `bold_keywords` returned by LLM and passed through to frontend
- [ ] Bold keywords auto-populate `theme_settings.settings.bold_keywords` in the frontend
- [ ] All three modes (nudge, keywords, full) have updated constraints matching 2.0 philosophy
- [ ] AI-phrase cleanup still runs post-tailoring (via `apply_local_resume_cleanup`)
- [ ] `KEYWORD_INJECTION_PROMPT` removed — keyword weaving handled by main prompt
- [ ] Backward compatibility maintained for cover letter, outreach, app pack title, location injection
- [ ] All existing tests pass with updated mocks
- [ ] Prompt versions bumped to `v4.0`

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM over-inflates titles beyond credibility | System prompt calibration instructions; post-processing can flag extreme title changes |
| LLM adds too many invented skills | The prompt explicitly says "credibly claim based on background" — monitor in dry runs |
| Removal of JD from tailoring prompt loses context | JD intelligence extraction must be comprehensive — test with diverse JDs |
| Bold keywords list too generic | Prompt asks for "10-15 most impactful for this specific role" — review in dry runs |
| Breaking change for legacy keyword format | `to_legacy_keywords()` bridge method ensures backward compatibility |
| AI-phrase cleanup strips intentional content | Cleanup only targets specific banned phrases — low risk |

---

## Dry Run Plan

Before merging, run the new prompts against 3-5 diverse JDs (different seniority levels, different domains):

1. **Senior full-stack (Walmart SWE III)** — the existing dry run JD
2. **Junior/entry-level data role** — verify calibration doesn't over-inflate
3. **Staff/principal role** — verify it handles high-seniority appropriately
4. **Non-tech domain (product, design)** — verify it handles non-engineering JDs
5. **Startup vs enterprise** — verify it adapts to different company contexts

For each: evaluate summary, bullet quality, title enhancements, skills additions, bold keywords selection, and ATS keyword coverage.
