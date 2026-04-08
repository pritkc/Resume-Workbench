# Phase 3.1 — LLM Pipeline & Prompt Optimization Plan

> **Goal**: Reduce prompt tokens sent to the LLM, deliver the resume schema with 0% breakage risk, improve output quality, and modernize the prompt architecture for reliability and maintainability.

---

## Table of Contents

1. [Current State Audit](#1-current-state-audit)
2. [Token Budget Breakdown](#2-token-budget-breakdown)
3. [Analysis: Schema Delivery Options](#3-analysis-schema-delivery-options)
4. [Analysis: Token Reduction Strategies](#4-analysis-token-reduction-strategies)
5. [Analysis: Output Quality Improvements](#5-analysis-output-quality-improvements)
6. [Analysis: Diff Schema / Post-Processing](#6-analysis-diff-schema--post-processing)
7. [Options Comparison Matrix](#7-options-comparison-matrix)
8. [Final End-to-End Plan](#8-final-end-to-end-plan)
9. [Migration & Rollback Strategy](#9-migration--rollback-strategy)
10. [Verification Plan](#10-verification-plan)

---

## 1. Current State Audit

### 1.1 Active Prompt Surfaces

| Operation | Prompt File | LLM Mode | Est. Prompt Tokens | Est. Output Tokens |
|---|---|---|---|---|
| `resume_parse_json` | `templates.py` → `PARSE_RESUME_PROMPT` | `complete_json` | ~800 + resume chars | ~1500 |
| `job_extract_keywords` | `templates.py` → `EXTRACT_KEYWORDS_PROMPT` | `complete_json` | ~200 + JD chars | ~300 |
| `resume_generate_full` | `templates.py` → `IMPROVE_RESUME_PROMPT_TEMPLATE` | `complete_json` (8192 max) | **~2000–4000** (heaviest) | ~2000–6000 |
| `cover_letter_generate` | `templates.py` → `COVER_LETTER_PROMPT` | `complete` (384 max) | ~600 + profile | ~200 |
| `outreach_generate` | `templates.py` → `OUTREACH_MESSAGE_PROMPT` | `complete` (256 max) | ~500 + profile | ~100 |
| `enrichment_analyze_resume` | `enrichment.py` → `ANALYZE_RESUME_PROMPT` | `complete_json` | ~800 + resume JSON | ~500 |
| `enrichment_generate_description` | `enrichment.py` → `ENHANCE_DESCRIPTION_PROMPT` | `complete_json` | ~400 | ~200 |
| `enrichment_regenerate_item` | `enrichment.py` → `REGENERATE_ITEM_PROMPT` | `complete_json` | ~400 | ~200 |
| `enrichment_regenerate_additional_group` | `enrichment.py` → `REGENERATE_ADDITIONAL_GROUP_PROMPT` | `complete_json` | ~300 | ~100 |

### 1.2 The Big Cost: `resume_generate_full`

This is the **critical-path prompt** and it is assembled from 5 variable components:

```
IMPROVE_RESUME_PROMPT_TEMPLATE
├── {critical_truthfulness_rules}    ~400 tokens (verbose prose)
├── {strategy_primary_goal}          ~30 tokens  
├── {job_analysis}                   ~200-400 tokens (JSON blob, already compact)
├── {job_description}                ~1000 tokens (trimmed to 4000 chars)
├── {original_resume}                ~800-2000 tokens (FULL JSON, indent=2)
└── {response_contract}             ~300-600 tokens (JSON blob, indent=2)
```

**Total assembled prompt**: ~2800–4500 tokens per tailoring call.

### 1.3 Current Pain Points (From Docs + Code Analysis)

1. **Resume JSON is sent with `indent=2`** — wastes ~25-35% of resume payload tokens on whitespace
2. **Response contract is verbose** — repeats rules the model should already know from system prompt
3. **Truthfulness rules are prose-heavy** — 9 rules in a paragraph, ~400 tokens of natural language every call
4. **Resume schema example (`RESUME_SCHEMA_EXAMPLE`)** is a 107-line JSON blob embedded literally in the parse prompt — expensive and redundant when the model already has the resume payload
5. **Strategy guidance and truthfulness rules overlap** — both separately instruct about description array handling
6. **No system prompt leverage** — the system prompt is one sentence (`"You are an expert resume editor. Output only valid JSON."`) while the user prompt contains ALL structural rules. System tokens are often cheaper or cached.
7. **Output is full JSON copy** — the LLM must copy back every immutable field (id, title, company, location, years) verbatim, wasting output tokens and creating more error surface
8. **JD excerpt is sent raw** — could be pre-summarized or trimmed to relevant sections
9. **Cover letter / outreach prompts already use compact profiles** — good pattern not applied to the parse prompt

### 1.4 Output Quality Issues Observed

From the verification and preservation code, these recurring LLM failures are visible:

- **Date precision loss**: months get dropped ("Jun 2020 - Aug 2021" → "2020 - 2021") — `restore_dates_from_markdown()` and `restore_original_dates()` exist to patch this
- **Identity field mutation**: company names, titles, locations get modified — `verify_generated_resume_result()` warns about these
- **Fabricated metrics**: invented percentages/numbers — verification checks for `_METRIC_RE` matches
- **AI-style phrasing**: "spearheaded", "leveraged" — `remove_ai_phrases()` cleans these locally
- **Additional-item hallucination**: new skills/certs added — `validate_master_alignment()` catches these
- **Section count changes**: entries added or dropped — verified in post-processing
- **Custom section hallucination**: fabricated descriptions for empty custom section items
- **Word count bloat**: result sometimes 1.8x+ the original word count
- **Em-dash injection**: "—" appears despite explicit prohibition

---

## 2. Token Budget Breakdown

### 2.1 Current vs Target

| Component | Current (tokens) | Target (tokens) | Savings |
|---|---|---|---|
| System prompt | ~15 | ~200 (move rules here) | -185 (strategic investment) |
| Truthfulness rules (user) | ~400 | ~80 | **+320** |
| Strategy guidance | ~30 | ~20 | +10 |
| Response contract JSON | ~400 | ~150 | **+250** |
| Resume payload (indent=2) | ~1200 | ~700 (compact) | **+500** |
| Job description excerpt | ~1000 | ~800 (smarter trim) | +200 |
| Job analysis JSON | ~300 | ~200 | +100 |
| Template framing text | ~200 | ~120 | +80 |
| **Total user prompt** | **~3545** | **~2070** | **~1475 (42%↓)** |

### 2.2 Output Token Savings (if using diff output)

| Component | Current (tokens) | Target (tokens) | Savings |
|---|---|---|---|
| Full resume JSON copy | ~2000-6000 | ~500-1500 (diff only) | **+1500-4500** |

---

## 3. Analysis: Schema Delivery Options

### Option A: Full JSON Example (Current)

**How it works**: Embed `RESUME_SCHEMA_EXAMPLE` (107 lines) in the prompt.

| Pros | Cons |
|---|---|
| LLM sees exact shape | ~564 tokens per parse call |
| Zero ambiguity | Wasteful for tailoring (resume is already present) |
| Works with all models | Example values add noise |

**Verdict**: Only needed for parsing. Should not be used where the input resume already demonstrates the shape.

### Option B: Compact Schema Description (Recommended for Parse)

**How it works**: Replace the full JSON example with a compressed TypeScript-style schema notation.

```
Resume JSON schema:
{personalInfo:{name,title,email,phone,location,website?,linkedin?,github?},
summary:string,
workExperience:[{id,title,company,location?,years,description:[string]}],
education:[{id,institution,degree,years,description?}],
personalProjects:[{id,name,role,years,github?,website?,description:[string]}],
additional:{groups:[{id,label,items:[string]}]},
customSections:{[key]:{sectionType:"text"|"itemList"|"stringList",text?,items?:[{id,title,subtitle?,years?,description?:[string]}],strings?:[string]}}}
```

~120 tokens versus ~564 tokens = **78% reduction**.

| Pros | Cons |
|---|---|
| ~444 token savings per parse | Slightly more ambiguous for weak models |
| Still shows every field | No concrete examples |
| Deterministic schema | Need to add a few field-level hints |

**Risk mitigation**: Add 2-3 inline hints (e.g., `years: "Jan 2020 - Present"`) instead of full examples.

### Option C: JSON Schema Definition

**How it works**: Send a formal JSON Schema (`$schema`, `type`, `properties`, `required`).

| Pros | Cons |
|---|---|
| Industry standard | Very verbose — often MORE tokens than example |
| Machine-parseable | Models don't follow it better than examples |
| Supports `response_format.json_schema` | Not all providers support structured output |

**Verdict**: ❌ Rejected. More tokens, not better compliance, provider-dependent.

### Option D: Pydantic `.model_json_schema()` auto-generated

**How it works**: Generate schema from the existing `ResumeData` Pydantic model at runtime.

| Pros | Cons |
|---|---|
| Always in sync with code | Very verbose (~800+ tokens) |
| Zero maintenance | Includes Pydantic internals |

**Verdict**: ❌ Rejected. Too verbose and not prompt-friendly.

### Option E: No schema in tailoring prompt (Recommended for Tailor)

**How it works**: The resume input already demonstrates the shape. The response contract already specifies which keys to return. Don't send a schema at all for tailoring.

| Pros | Cons |
|---|---|
| Zero schema tokens | Relies on input + contract |
| Resume is the schema | — |

**Verdict**: ✅ Already the current approach for tailoring. Correct decision. Keep it.

---

## 4. Analysis: Token Reduction Strategies

### Strategy 1: Compact JSON Serialization

**Current**: `json.dumps(resume_payload.model_dump(), indent=2)` — pretty-printed with 2-space indents.

**Proposed**: `json.dumps(resume_payload.model_dump(), separators=(',', ':'))` — no whitespace.

**Impact on a typical resume (3 work entries, 2 edu, 2 projects, 4 skill groups)**:
- indent=2: ~4800 chars → ~1200 tokens
- compact: ~3200 chars → ~800 tokens  
- **Savings: ~400 tokens (33%)**

**Risk**: ❌ **None for the LLM**. All modern LLMs handle minified JSON identically to pretty-printed. The whitespace is purely human convenience.

**Recommendation**: ✅ Apply to ALL JSON payloads sent to LLM: resume, job_analysis, response_contract.

### Strategy 2: Move Structural Rules to System Prompt

**Current**: System prompt is `"You are an expert resume editor. Output only valid JSON."` (15 tokens). All rules are in the user prompt.

**Proposed**: Move immutable rules (truthfulness, structural, output format) to system prompt.

**Why this helps**:
1. System tokens are often cached/discounted by providers (GPT-5, Claude, Gemini)
2. Rules don't change per request — they're the same for nudge/keywords/full
3. Reduces user prompt variability

**Proposed system prompt structure** (~200 tokens):

```
You are an expert resume editor. You output only valid JSON.

RULES:
- Never invent skills, metrics, companies, or certifications not in the original resume
- Never change identity fields: id, title, company, institution, name, role, years, location
- Never use em-dash (—) or its variants  
- Copy date ranges exactly including months
- Preserve factual accuracy absolutely
- Never add entries to array sections unless explicitly permitted
- Every original additional-group item must appear exactly once in output

OUTPUT:
- One complete JSON object, no markdown, no commentary
- Double-quoted keys and strings, no trailing commas
- Follow the response_contract exactly
```

**Savings**: ~300 tokens moved from user prompt → system prompt (often cached).

### Strategy 3: Compress Truthfulness Rules

**Current**: 9 rules in verbose prose (~400 tokens), with strategy-dependent rule 7.

**Proposed**: Compressed bullet format (~80 tokens):

```
CONSTRAINTS (violation = interview harm):
- No invented skills/tools/certs/metrics/dates
- No new companies/products/titles  
- No experience level upgrades
- Copy dates exactly with months
- Keep every additional-group item
- {mode_constraint}
```

Where `{mode_constraint}` is one line:
- nudge: `"Rephrase only, no new bullets"`
- keywords: `"Rephrase to include keywords, no new bullets"`
- full: `"May add ≤1 bullet per entry, elaborating existing evidence only"`

**Savings**: ~320 tokens.

### Strategy 4: Streamline Response Contract

**Current**: The response contract JSON includes redundant field names, per-section type annotations, and verbose rule arrays.

**Example current contract section** (~60 tokens):
```json
{
  "workExperience": {
    "type": "array",
    "entry_count": 3,
    "immutable_fields": ["id", "title", "company", "location", "years"],
    "editable_fields": ["description"],
    "rules": []
  }
}
```

**Proposed compact contract** (~25 tokens):
```json
{
  "workExperience": {"n":3, "edit":["description"], "freeze":["id","title","company","location","years"]},
}
```

But even better — since immutable/editable rules are already stated in the system prompt and are the same across modes, we can reduce the contract to just counts:

```json
{"sections":{"summary":"string","workExperience":3,"education":2,"personalProjects":2,"additional":{"groups":4},"customSections":{"publications":"itemList:2","volunteer_work":"text"}}}
```

~50 tokens versus ~300-600 tokens = **75-90% reduction**.

**Risk**: Slightly higher if the model hasn't internalized the rules from the system prompt.

**Recommendation**: Use the intermediate form (with `edit`/`freeze` keys) for safety while still achieving ~60% reduction.

### Strategy 5: Smarter JD Trimming

**Current**: Hard truncation at 4000 chars (`MAX_PROMPT_JD_CHARS`).

**Options**:

| Strategy | Tokens | Quality |
|---|---|---|
| A. Current hard-trim | ~1000 | Low — cuts mid-sentence, may lose key requirements |
| B. Sentence-aware trim | ~900 | Medium — preserves complete sentences |
| C. Section-aware trim (requirements focus) | ~600-800 | High — keeps job requirements, drops company marketing |
| D. LLM-pre-summarize JD | ~400 | Highest — but adds latency + cost |

**Recommendation**: **Option C** — Use regex to identify "requirements", "qualifications", "responsibilities" sections and prioritize those. Drop "about our company", "benefits", "equal opportunity" boilerplate. No extra LLM call needed.

**Implementation**: A simple heuristic trimmer that:
1. Splits JD by section headers (regex for common patterns)
2. Assigns priority: requirements/qualifications > responsibilities > about role > company info > benefits
3. Fills up to `max_chars` from highest priority down

### Strategy 6: Strip Immutable Fields from Resume Input

**Current**: The full resume payload includes all fields (id, title, company, years, location) even though the model is told not to change them.

**Proposed**: For tailoring, send only editable content in the resume body:

```json
{
  "summary": "...",
  "workExperience": [
    {"_ref": 0, "description": ["bullet1", "bullet2"]},
    {"_ref": 1, "description": ["bullet1"]}
  ],
  "personalProjects": [
    {"_ref": 0, "description": ["bullet1"]}
  ],
  "additional": {"groups": [...]},
  "customSections": {...}
}
```

Then reconstruct by index after LLM response.

**Analysis**:

| Pros | Cons |
|---|---|
| ~30-40% fewer input tokens | LLM loses title/company context for writing bullets |
| Simpler output contract | Post-processing must re-merge by index |
| Fewer identity mutation errors | Custom sections still need full shape |

**Verdict**: ⚠️ **Risky**. The LLM needs to see the job title and company name to write contextually relevant bullet improvements. Stripping these makes the bullets generic.

**Alternative**: Keep identity fields in *input* but don't require them in *output*. This is the **diff-output approach** (see Section 6).

---

## 5. Analysis: Output Quality Improvements

### Quality Problem 1: Generic, "AI-sounding" Language

**Root cause**: The prompt doesn't give specific voice/style guidance.

**Fix**: Add voice directive to system prompt:
```
VOICE: Direct, specific, active verbs. Match the candidate's original register.
Avoid: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable.
Prefer: led, built, designed, ran, managed, improved, reduced, created.
```

This replaces the local `remove_ai_phrases()` post-processing with prompt-level prevention. The local cleanup remains as a safety net but should fire less often.

### Quality Problem 2: Bullet Points Lack Specificity  

**Root cause**: The prompt says "tailor for the job" but doesn't show what good tailoring looks like.

**Fix**: Add 1-2 inline transformation examples (few-shot):
```
EXAMPLE:
Original: "Worked on backend systems"
For JD targeting "distributed systems + Kubernetes":
Tailored: "Built and maintained backend services deployed on Kubernetes clusters"
```

~40 tokens, significant quality improvement per studies on few-shot prompting.

### Quality Problem 3: Summary Rewrites are Bland

**Root cause**: No specific summary guidance.

**Fix**: Add summary-specific instruction:
```
SUMMARY: Open with "[Years]+ years in [relevant domain]". Reference 1-2 JD-matching strengths. Keep under 3 sentences.
```

### Quality Problem 4: Keywords Get Sprinkled vs Integrated

**Root cause**: The "keywords" mode just says "weave in supported job keywords" — too vague.

**Fix**: Rewrite keywords mode strategy to be more tactical:
```
Integrate supported JD keywords into existing bullet phrasing. Each keyword should appear in a context that demonstrates specific, concrete experience — never as a standalone list or forced insertion.
```

### Quality Problem 5: Education Section Gets Modified (Shouldn't)

**Root cause**: The contract says `editable_fields: []` and `rules: ["Copy every education entry exactly"]` but the model still sometimes modifies education.

**Fix**: Don't include education in the LLM output at all. Don't ask the model to copy it — just exclude it from both input and output, and carry it through in post-processing (like we already do for `personalInfo` and `sectionMeta`).

**Impact**: ~100-200 fewer input tokens, ~100-200 fewer output tokens, 0% chance of education corruption.

---

## 6. Analysis: Diff Schema / Post-Processing

### Current Approach: Full-Replace Output

The LLM returns a complete resume JSON. Post-processing locally:
1. Restores personalInfo from original
2. Restores dates
3. Restores additional items
4. Protects custom sections  
5. Removes AI phrases
6. Validates master alignment
7. Rebuilds sectionMeta
8. Computes diff for preview UI

### Option A: Keep Full-Replace Output (Current)

| Pros | Cons |
|---|---|
| Simple prompting | ~2000-6000 output tokens |
| No merge logic needed | Identity fields often get mutated |
| Battle-tested | More output = more truncation risk |
| Foundation already proven | Wastes tokens on unchanged content |

### Option B: Diff-Only Output (Section-Level Edits)

**How it works**: LLM returns only the sections it modified.

```json
{
  "summary": "Updated summary text...",
  "workExperience": [
    {"_index": 0, "description": ["new bullet 1", "new bullet 2"]},
    {"_index": 2, "description": ["modified bullet"]}
  ],
  "additional": {"groups": [...]},
}
```

Unchanged sections (education, unmodified work entries) are omitted.

| Pros | Cons |
|---|---|
| ~50-70% fewer output tokens | More complex merge logic |
| Lower truncation risk | New error class: bad index references |
| Clearer signal of what changed | Model may still hallucinate structure |
| Naturally produces better diffs | Need fallback for missing sections |

**Risk analysis**: The `_index` approach has a known failure mode where the LLM returns wrong indices. However, since post-processing already validates by identity fields (company, title, etc.), we can verify indices against the original.

### Option C: Per-Bullet Patch Operations

**How it works**: LLM returns a list of atomic edit operations.

```json
{
  "patches": [
    {"path": "summary", "op": "replace", "value": "..."},
    {"path": "workExperience[0].description[1]", "op": "replace", "value": "..."},
    {"path": "workExperience[0].description", "op": "append", "value": "..."}
  ]
}
```

| Pros | Cons |
|---|---|
| Minimal output tokens | Very complex, fragile |
| Surgically precise changes | Path syntax errors common |
| Built-in diff data | No model handles this reliably |
| | Harder to validate |

**Verdict**: ❌ Rejected. Too fragile. Models consistently produce invalid paths.

### Option D: Hybrid — Full Editable Sections, Skip Immutable (Recommended)

**How it works**: The LLM returns only the sections that are editable. Immutable sections (education, personalInfo, sectionMeta) are excluded from both input and output.

Compared to option B, this doesn't use indices — it returns full arrays for modified sections, just like the current approach, but skips the sections that should never change.

```json
{
  "summary": "...",
  "workExperience": [
    {"id":1, "description": ["..."]},
    {"id":2, "description": ["..."]}
  ],
  "personalProjects": [
    {"id":1, "description": ["..."]}
  ],
  "additional": {"groups": [...]},
  "customSections": {... only modified custom sections ...}
}
```

**Key difference from current**: 
- **Input**: Education excluded (~100-200 tokens saved)
- **Output**: Education excluded (~100-200 tokens saved), work entries only return `id` + `description` (not title/company/years/location)
- **Total**: ~600-800 fewer output tokens + zero chance of identity field mutations

| Pros | Cons |
|---|---|
| Significant output reduction | Moderate merge complexity |
| Zero identity mutation risk | Need to match by id |
| Current post-processing mostly intact | Custom section handling still needs care |
| 0% breakage on immutable data | — |

**Merge logic**: 
1. For work/projects: match output entries by `id` to original, replace only `description`
2. For summary: direct replace
3. For additional: full replace (already how it works)
4. For customSections: merge by key
5. Education: carry through from original

---

## 7. Options Comparison Matrix

### Schema Delivery

| Option | Token Cost | Reliability | Implementation | Winner |
|---|---|---|---|---|
| A. Full JSON Example | High (564 tok) | High | Already done | Parse only |
| B. Compact Schema | Low (120 tok) | High | Easy | ✅ Parse |
| C. JSON Schema | Very High | Medium | Medium | ❌ |
| D. Pydantic auto | Very High | Medium | Easy | ❌ |
| E. No schema (tailor) | Zero | High | Already done | ✅ Tailor |

### Token Reduction

| Strategy | Savings | Risk | Complexity | Include? |
|---|---|---|---|---|
| 1. Compact JSON | ~400 tokens | None | Trivial | ✅ Yes |
| 2. System prompt rules | ~300 cached | Low | Easy | ✅ Yes |
| 3. Compress truthfulness | ~320 tokens | Low | Easy | ✅ Yes |
| 4. Compact contract | ~200 tokens | Low | Easy | ✅ Yes |
| 5. Smarter JD trim | ~200 tokens | Low | Medium | ✅ Yes |
| 6. Strip immutable input | ~300 tokens | Medium | Medium | ⚠️ Partial |

### Output Approach

| Option | Output Savings | Robustness | Complexity | Winner |
|---|---|---|---|---|
| A. Full-replace | 0 | Proven | Low | — |
| B. Diff-only (indexed) | 50-70% | Medium | High | — |
| C. Per-bullet patches | 80% | Low | Very High | ❌ |
| D. Hybrid (skip immutable) | 30-40% | High | Medium | ✅ |

### Output Quality

| Improvement | Impact | Risk | Complexity | Include? |
|---|---|---|---|---|
| Voice directive | High | None | Trivial | ✅ Yes |
| Few-shot examples | High | Low | Easy | ✅ Yes |
| Summary guidance | Medium | None | Trivial | ✅ Yes |
| Keywords mode rewrite | Medium | Low | Easy | ✅ Yes |
| Exclude education from LLM | Medium | None | Easy | ✅ Yes |

---

## 8. Final End-to-End Plan

### Phase 3.1.1 — Zero-Risk Token Reduction (Quick Wins)

1. **Compact JSON serialization**: Change all `json.dumps(..., indent=2)` to `json.dumps(..., separators=(',', ':'))` in `prompting.py`, `analysis.py`, and `message_profiles.py` for LLM-bound payloads only.
   - Files: `services/tailoring/prompting.py`, `services/tailoring/analysis.py`, `services/message_profiles.py`
   - Savings: ~400 tokens

2. **Compact parse schema**: Replace `RESUME_SCHEMA_EXAMPLE` with a compressed schema notation for the parse prompt.
   - File: `prompts/templates.py`
   - Savings: ~444 tokens on parse calls

3. **Smarter JD trimming**: Implement section-aware JD trimmer that prioritizes requirements sections.
   - File: `services/prompt_utils.py` (new function `trim_job_description_smart()`)
   - Savings: ~200 tokens on average

### Phase 3.1.2 — Prompt Architecture Restructure

4. **Move structural rules to system prompt**: Create a structured system prompt for tailoring that contains all immutable rules (truthfulness, formatting, structural constraints).
   - Files: `prompts/templates.py` (new `TAILORING_SYSTEM_PROMPT`), `services/tailoring/orchestration.py`
   - Impact: ~300 tokens moved to cacheable system position

5. **Compress truthfulness rules**: Rewrite as compact bullets with mode-specific constraint injection.
   - File: `prompts/templates.py` — rewrite `CRITICAL_TRUTHFULNESS_RULES_TEMPLATE`
   - Savings: ~320 tokens

6. **Streamline response contract**: Use compact `edit`/`freeze`/`n` notation.
   - File: `services/tailoring/contracts.py` — new `build_compact_contract()`
   - Savings: ~200 tokens

7. **Add voice directive and few-shot example**: Add anti-AI-language directive and 1 transformation example.
   - File: `prompts/templates.py` — included in new system prompt
   - Quality impact: High

### Phase 3.1.3 — Output Shape Optimization

8. **Exclude education from LLM I/O**: Remove education from `TailoringResumePayload` sent to LLM. Carry through in `finalize_tailored_resume()`.
   - Files: `services/tailoring/prompting.py` (filter education from payload), `services/tailoring/preservation.py` (restore education from original)
   - Savings: ~200 input + ~200 output tokens, 0% education mutation

9. **Work/project entries: output description-only with id**: Restructure output contract so work and project entries only return `{id, description}`. Merge back by matching id.
   - Files: `services/tailoring/contracts.py`, `services/tailoring/preservation.py`, `prompts/templates.py`  
   - Savings: ~300-500 output tokens, 0% identity mutation
   - Risk: Need robust id-matching (already have it in verification)

10. **Rewrite the main tailoring prompt template**: New clean template combining all improvements:

    ```python
    IMPROVE_RESUME_PROMPT_V2 = """Tailor this resume for the target job.

    MODE: {mode} — {mode_constraint}

    EXAMPLE:
    Original: "Worked on backend systems"
    For JD mentioning "Kubernetes, CI/CD":
    Tailored: "Built and maintained backend services deployed across Kubernetes clusters with automated CI/CD pipelines"

    JOB ANALYSIS:
    {job_analysis}

    JOB DESCRIPTION:
    {job_description}

    RESUME:
    {resume}

    Return JSON with keys: {output_keys}
    For workExperience and personalProjects, return {id, description} per entry.
    For additional, return {groups:[{id,label,items}]}.
    """
    ```

### Phase 3.1.4 — Prompt Registry & Observability

11. **Centralize prompt versioning**: Add `prompt_version` field to trace metadata. Each prompt template gets a version string.
    - Files: `prompts/templates.py` (version constants), `services/tailoring/prompting.py` (attach to metadata)
    - Enables A/B testing of prompt changes

12. **Centralize system prompts**: Move inline system prompts from callers to `prompts/templates.py`.
    - Files: `services/tailoring/orchestration.py`, `services/tailoring/analysis.py`, `services/parser.py`, `services/cover_letter.py`

### Phase 3.1.5 — Parse Prompt Optimization

13. **Optimize parse prompt**: Compact schema, shorter rules, better date instructions.
    - File: `prompts/templates.py` — rewrite `PARSE_RESUME_PROMPT`
    - Savings: ~400 tokens per parse

14. **Optimize enrichment prompts**: Apply compact formatting principles.
    - File: `prompts/enrichment.py`
    - Modest savings, better consistency

---

### Implementation Order & Dependencies

```
Phase 3.1.1 (zero-risk, can ship independently):
  [1] Compact JSON ──→ immediate
  [2] Compact schema ──→ immediate  
  [3] Smart JD trim ──→ immediate

Phase 3.1.2 (prompt restructure, ship together):
  [4] System prompt ──→ [5] Truthfulness ──→ [6] Contract ──→ [7] Voice/examples

Phase 3.1.3 (output optimization, depends on 3.1.2):
  [8] Exclude education ──→ [9] Description-only output ──→ [10] New template

Phase 3.1.4 (observability, can ship independently):
  [11] Prompt versioning ──→ immediate
  [12] Centralize system prompts ──→ after 3.1.2

Phase 3.1.5 (secondary prompts, ship independently):
  [13] Parse optimization ──→ immediate
  [14] Enrichment optimization ──→ immediate
```

### Expected Total Impact

| Metric | Current | After 3.1 | Change |
|---|---|---|---|
| Tailoring input tokens | ~3500 | ~1800 | **-49%** |
| Tailoring output tokens | ~3000 | ~1800 | **-40%** |
| Parse input tokens | ~1400 | ~900 | **-36%** |
| Identity mutation rate | ~5-10% | ~0% | **Eliminated** |
| Education corruption rate | ~2-5% | 0% | **Eliminated** |
| AI-phrase rate (pre-cleanup) | ~15-20% | ~5% | **-75%** |
| Date precision loss rate | ~10-15% | ~3% | **-80%** |
| Prompt versioning | Implicit | Explicit | **New capability** |

---

## 9. Migration & Rollback Strategy

### How to Migrate Safely

1. **Feature flag**: Add `prompt_version` to config: `"v1"` (current) or `"v2"` (new). Default to v1.
2. **Parallel run**: For each tailoring call under v2, also log what v1 would have produced (trace metadata only, not actual call).
3. **Gradual rollout**: Start with `keywords` mode only, then `nudge`, then `full`.
4. **Rollback**: Set `prompt_version` back to `"v1"` in config. All old prompt code stays in place until v2 is proven.

### Breaking Change Risk Assessment

| Change | Breaking Risk | Mitigation |
|---|---|---|
| Compact JSON | None | LLMs handle minified JSON fine |
| System prompt rewrite | Low | Test with all 6 supported providers |
| Response contract format | Medium | Validate output against `TailoringResumePayload` |
| Education exclusion | None | Post-processing already carries it through |
| Description-only output | Medium | Validate by matching ids to original |
| JD trimming | Low | Only affects which JD text is included |

---

## 10. Verification Plan

### Automated Tests

```bash
# Existing test suite must pass
cd apps/backend && uv run pytest

# New prompt-specific tests to add:
# - test compact JSON produces valid LLM input
# - test smart JD trim preserves requirements
# - test education exclusion round-trip
# - test description-only output merge
# - test response contract compact format validation
# - test system prompt + user prompt together produce valid prompts
```

### Manual Verification

1. Run tailoring with all 3 modes (nudge, keywords, full) against 3 different resumes + JDs
2. Compare trace token counts before/after (via `/llm-traces`)
3. Verify diff preview UI still works correctly
4. Verify education is unchanged
5. Verify identity fields are unchanged  
6. Verify additional-group items are preserved
7. Verify cover letter and outreach quality

### Quality Benchmarks

For each test case, compare:
- [ ] Token count (input + output) — should decrease ~40%
- [ ] Identity field preservation — should be 100%
- [ ] Education preservation — should be 100%
- [ ] Bullet quality (subjective review) — should be equal or better
- [ ] AI-phrase contamination — should decrease
- [ ] Schema validity of output — should be 100%

---

## File Change Summary

### Modified Files

| File | Changes |
|---|---|
| `app/prompts/templates.py` | New v2 templates, compact schema, system prompts, voice directives |
| `app/prompts/enrichment.py` | Minor compression |
| `app/services/tailoring/prompting.py` | Compact JSON, v2 template rendering, version metadata |
| `app/services/tailoring/contracts.py` | Compact contract builder |
| `app/services/tailoring/orchestration.py` | System prompt injection, education exclusion |
| `app/services/tailoring/preservation.py` | Education carry-through, description-only merge |
| `app/services/tailoring/models.py` | Optional compact payload variant |
| `app/services/prompt_utils.py` | Smart JD trimmer |
| `app/services/message_profiles.py` | Compact JSON serialization |
| `app/services/parser.py` | Compact parse schema |

### New Files

| File | Purpose |
|---|---|
| (none expected) | All changes fit within existing module boundaries |

### Docs Updates

| File | Changes |
|---|---|
| `docs/agent/llm-prompt-inventory.md` | Document v2 prompts and version scheme |
| `docs/agent/llm-integration.md` | Update prompt selection, system prompt docs |
