# Phase 3.3.2 — Prompt Optimization (full mode, Sonnet)

## Goal

**Maximum efficiency.** Every token must earn its place. The system prompt and user prompt must together contain only what the model strictly needs to produce the correct output — nothing more. The response contract must be the leanest valid schema that still enforces correctness.

---

## Current State Diagnosis

### 1. Redundancies between system prompt and user prompt

| Concept | System prompt says | User prompt says | Verdict |
|---|---|---|---|
| Output format | "Output only valid JSON" | (implicit in RESPONSE CONTRACT block) | Keep only in system; drop reinforcement from user |
| Mode rule | n/a | `MODE: full — Make targeted, high-signal tailoring edits. You may add at most one bullet per entry…` | Already codified in `mode_rules` inside the contract — **duplicated** |
| Changes array rules | `Populate the changes array with indexed paths` | `CHANGES ARRAY RULES` block (4 bullets) | **Fully duplicated** — one location is enough |
| Voice list | Avoid / Prefer verbs (15 words) | Not repeated | Kept only in system ✓ |
| Example bullet | Not in system | `EXAMPLE: Original / Tailored` block | Useful once — keep in user prompt; but it can shrink |
| Summary guidance | Not present | `SUMMARY GUIDANCE: Open with "[N]+ years…"` | Keep — but tighten |
| Language instruction | Not present | `Generate all rewritten text in {output_language}` | Keep, one line |
| Skills grounded warning | "Keep skills editable and grounded: regroup/relabel is allowed, inventing skill values is not" | Repeated inside `skills.rules` in the contract | **Duplicated** — drop from system prompt since HONESTY bullet covers it |

### 2. Contract verbosity problems

The current contract serializes every section with redundant scaffolding: `immutable_fields`, `editable_fields`, `type`, `entry_count`, `rules`, `sections.groups.entry_count`, etc. Many of these fields are boilerplate that add no signal to the model.

**What the model actually needs from the contract per section:**
- `workExperience` / `personalProjects`: entry count (anchor), which fields it may change
- `skills.groups`: entry count, which fields it may change
- `changes`: format reminder (path syntax + op types)

**What the model does NOT need:**
- `immutable_fields` lists (listing `editable_fields` is sufficient — everything else is implicitly immutable)
- `schema_version` (internal metadata, not a model instruction)
- `type` on every section (the model knows arrays are arrays from the resume data itself)
- `keys: []` on `customSections` when it is empty
- Nested `sections.groups` wrapped inside `skills` — flatten to `skills.groups`
- `mode_rules` duplicating what the `MODE:` line says in the user prompt
- Empty `rules: []`, `keys: []`, `sections: {}` fields

---

## Proposed New System Prompt

**Principle:** One sentence per constraint. No prose. Zero fluff.

```
You are an expert resume editor. Output only valid JSON — no markdown fences, no commentary.

HONESTY (violation = interview harm):
- Never invent skills, tools, certifications, metrics, companies, or dates
- Never upgrade experience level or add new employers
- Copy date ranges exactly; never alter immutable fields
- Skill values must each appear exactly once; regrouping/relabeling is allowed

OUTPUT:
- One complete JSON object with the top-level keys from the response contract
- No extra keys; no trailing commas; all strings double-quoted
- changes[]: one record per edit, indexed path (e.g. workExperience[0].description[2])
  - op: "replace" | "append" | "regroup"; include "original" when replacing

VOICE:
- Active verbs: led, built, designed, ran, managed, improved, reduced, created
- Banned: spearheaded, leveraged, orchestrated, utilized, facilitated, synergy, robust, scalable, holistic, proactive
- No em-dash
```

**Token saving vs current:** ~36% fewer tokens. Eliminated:
- Redundant skills grounding paragraph (already in HONESTY bullet)
- Verbose STRUCTURE section collapsed into OUTPUT (3 bullets vs 5)
- Removed echo of "You must respond with valid JSON only" tail line

---

## Proposed New User Prompt

**Principle:** Data blocks only. Behavioral instructions stay in system prompt or contract. Remove all duplication.

```
Tailor this resume for the target job.

MODE: {mode_id} — {mode_constraint}

SUMMARY: Open "[N]+ years in [domain]", 1-2 JD strengths, ≤3 sentences.

REWRITING EXAMPLE:
Before: "Worked on backend systems"
JD mentions: Kubernetes, CI/CD
After: "Built and maintained backend services deployed across Kubernetes clusters with automated CI/CD pipelines"

Output language: {output_language}

JOB ANALYSIS:
{job_analysis}

JOB DESCRIPTION:
{job_description}

RESUME:
{original_resume}

RESPONSE CONTRACT:
{response_contract}
```

**Token saving vs current:** ~47% fewer tokens in the instruction region. Removed:
- Entire `CHANGES ARRAY RULES` block (4 bullets → 0; moved to system prompt OUTPUT section)
- `Generate all rewritten text in` → `Output language:` (1 line, same semantics)
- `SUMMARY GUIDANCE:` header → `SUMMARY:` (tighter)
- Verbose example preamble ("EXAMPLE:\nOriginal: … \nFor JD mentioning …") → 3-line inline form

---

## Proposed Lean Response Contract Shape

**Goal:** Strip every field that does not change model behavior.

### Current serialized contract (tokens ≈ 1,100 for a typical 4-WE resume)

```json
{
  "schema_version": "tailoring_resume_v2",
  "prompt_mode": "full",
  "top_level_keys": ["summary","workExperience","personalProjects","skills","customSections","changes"],
  "mode_rules": ["May add at most one bullet per work/project entry."],
  "sections": {
    "summary": {"type":"string","immutable_fields":[],"editable_fields":["value"],"keys":[],"rules":[],"sections":{}},
    "workExperience": {"type":"array","entry_count":4,"immutable_fields":["id","position","title","company","location","start_date","end_date","date","years"],"editable_fields":["summary","description"],"keys":[],"rules":[],"sections":{}},
    "personalProjects": {"type":"array","entry_count":3,"immutable_fields":["id","name","role","date","years","github","website"],"editable_fields":["summary","description"],"keys":[],"rules":[],"sections":{}},
    "skills": {"type":"object","entry_count":6,"rules":["Keep every original skill value exactly once.","You may regroup labels and reorder groups.","Do not invent new skill values."],"sections":{"groups":{"type":"array","entry_count":6,"immutable_fields":["id"],"editable_fields":["label","values"],"keys":[],"rules":[],"sections":{}}}},
    "customSections": {"type":"object","keys":[],"rules":["Preserve keys and types."],"sections":{}},
    "changes": {"type":"array","rules":["Include one change record per actual edit when possible.","Use indexed paths like workExperience[0].description[1].","Never include blocked paths like personalInfo or education."],"sections":{}}
  }
}
```

### Proposed lean contract (tokens ≈ 380 for the same resume)

```json
{
  "top_level_keys": ["summary","workExperience","personalProjects","skills","customSections","changes"],
  "mode": "full",
  "sections": {
    "workExperience": {"count":4,"edit":["summary","description"]},
    "personalProjects": {"count":3,"edit":["summary","description"]},
    "skills.groups": {"count":6,"edit":["label","values"]},
    "customSections": {"preserve":true}
  }
}
```

### Field-by-field removal rationale

| Removed field | Rationale |
|---|---|
| `schema_version` | Internal metadata — model does not act on it |
| `type` per section | Model infers from resume data structure |
| `immutable_fields` | Inverse of `edit`; listing `edit` makes everything else implicitly immutable |
| `editable_fields` → `edit` | Shorter key, identical semantics |
| `entry_count` → `count` | 5 fewer chars × N occurrences; same anchor value |
| `keys: []` | Empty — no signal |
| `rules: []` | Empty — no signal |
| `sections: {}` | Empty — no signal |
| `mode_rules` array | Duplicates the `MODE:` line in user prompt |
| `sections.skills.sections.groups` nesting | Flattened to top-level `skills.groups` key — same information |
| `changes` section contract | Changes format fully defined in system prompt OUTPUT block |
| Skills `rules` array | Covered by HONESTY block in system prompt |
| `customSections` rules | Replaced with single `"preserve":true` flag |

---

## What Must NOT Change

- `mode_constraint` string still appears verbatim in the `MODE:` line (mode-specific)
- `count` values (formerly `entry_count`) — critical anchor for bullet counting
- `edit` list per section — critical for knowing what the model may modify
- The `changes` array in the LLM output itself — still required; only its contract description moves to the system prompt

---

## Expected Output Impact

The sample output shows the model correctly echoing all immutable fields back in each work entry (`position`, `title`, `company`, etc.). This behavior is correct and will continue. The lean contract does not change what the model outputs — it only changes how many tokens we spend instructing it.

**Note on the observed over-rewriting in the sample output:** The last work entry (Sudathi) grew from 2 bullets to 3 despite `full` mode allowing at most +1 per entry. The constraint is already in the prompt; tightening the mode_constraint wording may help:

Current: `"Make targeted, high-signal tailoring edits. You may add at most one bullet per entry, elaborating on evidence already present. Do not invent new responsibilities."`

Proposed: `"Make targeted tailoring edits. Add at most one bullet per entry. New bullets must elaborate on existing evidence — do not invent responsibilities."`

---

## Implementation Steps (Prompt Changes Only)

### Step 1 — Rewrite `TAILORING_SYSTEM_PROMPT` in `templates.py`
Replace with proposed version. ~36% token reduction.

### Step 2 — Rewrite `IMPROVE_RESUME_PROMPT_TEMPLATE` in `templates.py`
- Remove `CHANGES ARRAY RULES` block entirely
- Compress `SUMMARY GUIDANCE` → `SUMMARY:` one-liner
- Compress example preamble to 3 lines
- `Generate all rewritten text in` → `Output language:`

### Step 3 — Lean-ify contract serialization in `contracts.py` + `models.py`
- Rename `editable_fields` → `edit`, `entry_count` → `count` in the emitted dict only (keep Python field names unchanged to avoid breaking downstream parsing)
- Drop `type`, `immutable_fields`, `schema_version`, `mode_rules`, empty `keys`/`rules`/`sections` from the serialized contract
- Flatten `skills.sections.groups` → top-level `skills.groups`
- Drop `changes` section from contract
- Implement via a custom `to_prompt_dict()` method on `TailoringResponseContract`

> [!IMPORTANT]
> The `exclude_none=True` in `build_prompt_context` (prompting.py line 90-94) handles nulls but not empty lists/dicts. The custom serializer must explicitly drop `[]` and `{}` values.

### Step 4 — Tighten `full` mode constraint string in `TAILORING_MODE_CONSTRAINTS`
Update as shown above.

### Step 5 — Bump `PROMPT_VERSIONS`
```python
"tailoring_system": "v3.0",
"tailoring_user": "v3.0",
```

---

## Token Estimate Summary

| Component | Current (est. tokens) | Proposed (est. tokens) | Savings |
|---|---|---|---|
| System prompt | ~220 | ~140 | ~36% |
| User prompt instructions | ~180 | ~95 | ~47% |
| Response contract (4 WE · 3 PP · 6 skill groups) | ~1,100 | ~380 | ~65% |
| **Total saved per call** | **~1,500 input tokens** | — | **~50% on non-data portions** |

---

## Acceptance Criteria

1. System prompt contains no sentence duplicated from the response contract
2. User prompt contains no `CHANGES ARRAY RULES` block
3. Response contract JSON for a typical resume serializes to ≤420 tokens
4. All existing `test_improver.py` tests pass without modification
5. LLM output still populates `changes[]` with correct indexed paths
6. Skill values are not invented in any test fixture

---

## Out of Scope (deferred to Phase 3.3.3)

- Diff-only output — LLM emits only changed fields; identity reconstruction happens server-side
- Few-shot examples embedded in system prompt
- Per-mode system prompt variants
