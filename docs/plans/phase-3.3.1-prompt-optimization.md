# Phase 3.3 - Full Prompt And Output Optimization (Maximum Efficiency)

## Objective

Optimize `full_resume_prompt` and its expected output contract for maximum efficiency:

- Remove redundant instructions.
- Keep only instructions that directly affect correctness.
- Minimize prompt token footprint.
- Minimize output token footprint.
- Prevent truncation from verbose responses.

This phase is prompt-and-contract design focused. Diff logic and downstream data selection are intentionally out of scope for implementation in this document.

## Scope

In scope:

- System prompt compression.
- User prompt compression.
- Input payload minimization strategy.
- Expected output schema minimization strategy.
- Rollout and measurement plan.

Out of scope:

- Backend diff processor changes.
- Data picker/reconstruction implementation.
- UI changes.

## Baseline Problems (From Current Prompt + Failed Sample)

1. Instruction duplication across system + user prompt:
- JSON-only rule appears twice.
- Structural constraints repeated in both `RESPONSE CONTRACT` and `CHANGES ARRAY RULES`.

2. Large low-value prompt payload:
- Full JD prose is injected, including non-actionable marketing content.
- Full resume payload includes immutable fields that are echoed back.
- Full response contract JSON is verbose and repeats obvious constraints.

3. Output verbosity causes truncation risk:
- Model returns full objects with immutable fields copied.
- Bullets are expanded aggressively.
- `changes` metadata is verbose and repeated.

4. Rule precision is lower than token count:
- Rules are long prose instead of short atomic constraints.
- Multiple semantically similar rules increase confusion and token cost.

## Non-Negotiable Principles

1. Truthfulness over style:
- Never invent facts, tools, metrics, employers, dates, or responsibilities.

2. Deterministic structure:
- One JSON object.
- Stable keys.
- No markdown.

3. Minimality:
- Return only fields needed for editing.
- Do not echo immutable data.

4. Constraint locality:
- Put permanent global rules in system prompt.
- Keep request-specific context in user prompt.

5. Token-aware writing:
- Every instruction must justify itself.
- Delete any instruction that is duplicated, implied, or unenforced.

## Prompt Architecture Redesign

### A) System Prompt v3 (Short, Permanent, High Authority)

Target: 8-12 atomic rules total.

Keep in system prompt only:

- Output JSON only.
- No hallucinations.
- No edits outside editable fields.
- Keep dates and identity fields unchanged unless explicitly editable.
- Preserve skill values (no new values).
- Follow output schema exactly.
- If uncertain, keep original text.

Remove from system prompt:

- Long style prose ("voice" dictionary lists can be moved to short banned/preferred rule).
- Repeated JSON formatting reminders.
- Repeated `changes` path examples (move to schema spec in user prompt).

### B) User Prompt v3 (Request-Specific, Compact)

Target sections only:

1. `MODE` and language.
2. `TARGET SIGNALS` (compact job analysis only).
3. `JD EXCERPT` (trimmed to actionable requirement lines).
4. `INPUT_RESUME_EDITABLE_VIEW` (editable slices only, not full immutable mirror).
5. `OUTPUT_SCHEMA` (minimal strict schema).
6. `EDIT LIMITS` (explicit brevity limits).

Delete from user prompt:

- Example rewrite block (low value, high tokens).
- Duplicate "changes array rules" if schema already encodes them.
- Repeated top-level contract prose if schema is explicit.

### C) Contract Compression

Current contract is machine-friendly but prompt-expensive. For LLM prompting, provide a compact contract form:

- `top_level_keys`
- `editable_paths`
- `blocked_paths`
- `shape_rules`
- `limits`

Avoid nested verbose contract objects unless required for enforcement.

## Proposed Prompt Skeletons (Implementation Reference)

### System Prompt v3 Draft

```text
You are a resume editor. Return only valid JSON.

Rules:
1) Never invent facts (skills, tools, metrics, companies, dates, responsibilities).
2) Edit only allowed fields from OUTPUT_SCHEMA.
3) Keep blocked fields unchanged.
4) Keep every original skill value exactly once unless OUTPUT_SCHEMA allows removal.
5) If evidence is weak, keep original text.
6) Keep wording concise and concrete.
7) No markdown, no comments, no extra keys.
8) No em dash character.
```

### User Prompt v3 Draft

```text
Task: Tailor resume for this role.
Mode: full
Language: English

TARGET_SIGNALS:
{compact_job_analysis_json}

JD_EXCERPT:
{trimmed_requirement_only_jd}

INPUT_RESUME_EDITABLE_VIEW:
{editable_resume_view_json}

OUTPUT_SCHEMA:
{compact_contract_json}

LIMITS:
- Summary: <= 3 sentences.
- At most 1 added bullet per entry.
- Do not split one bullet into multiple bullets.
- Prefer rewrite over expansion.
- Keep unchanged when unsupported by evidence.
```

### Output Schema Modes (Planned)

Mode A (compatibility): current full schema for immediate deployment.

Mode B (efficient): editable-only schema for downstream reconstruction.

Execution rule:

- Start with Mode A prompt simplification.
- Move to Mode B once diff/data picker path is ready.

## Expected Output Optimization Strategy

### Phase 3.3 Target Output (Design)

Goal: return only editable payload and audit metadata needed for downstream apply/diff layers.

```json
{
  "summary": "string",
  "workExperience": [
    {
      "id": 1,
      "summary": "string|null",
      "description": ["string"]
    }
  ],
  "personalProjects": [
    {
      "id": 1,
      "summary": "string|null",
      "description": ["string"]
    }
  ],
  "skills": {
    "groups": [
      {
        "id": "string",
        "label": "string",
        "values": ["string"]
      }
    ]
  },
  "customSections": {},
  "changes": [
    {
      "path": "workExperience[0].description[1]",
      "action": "replace|append|regroup",
      "value": "string|array|object"
    }
  ]
}
```

Rules:

- Do not return immutable fields (`company`, `position`, `location`, `start_date`, etc.).
- Do not return unchanged optional wrappers unless schema requires key presence.
- Keep `changes` concise: no repeated original text unless mandatory for validator.

Note: backend/data-picker updates needed later to consume this minimal schema.

## Immediate Prompt-Only Efficiency (No Backend Contract Change Yet)

Until downstream consumption is updated, we still reduce waste with prompt-only controls:

1. Add hard brevity limits:
- Summary max 3 sentences.
- Max one new bullet per entry (already present, keep strict).
- Bullet length cap (recommended 18-28 words).

2. Add anti-expansion rule:
- Prefer rewrite over expansion.
- Do not split one bullet into multiple bullets.

3. Add no-redundancy rule:
- Do not restate the same skill/impact across bullets.

4. Add "keep unchanged when weak evidence" rule:
- If JD requirement is unsupported, do not force keyword insertion.

5. Replace prose style section with concise lexical constraints:
- Banned verbs list (short).
- No em dash.

## Instruction Keep / Merge / Delete Matrix

### Keep (Required)

- JSON-only output.
- Truthfulness constraints.
- Editable vs blocked paths.
- Skill value preservation.
- Mode constraint (`full`: max one added bullet per entry).
- Language output instruction.

### Merge (Redundant Today)

- "Output valid JSON only" (appears twice) -> keep once in system prompt.
- `changes` rules in both contract and footer -> keep once in compact schema block.
- Structural contract prose + machine contract JSON -> keep one compact contract.

### Delete (Low Value Per Token)

- Example rewrite pair.
- Long motivational/style prose.
- Repeated warnings already implied by blocked paths.
- Verbose section boilerplate where schema already enforces shape.

## Token Budget Targets

### Prompt Token Targets

- System prompt: <= 140 tokens.
- User fixed template text (excluding data): <= 220 tokens.
- Contract block: <= 180 tokens.
- Total non-data overhead target: <= 540 tokens.

### Payload Targets

- JD excerpt: <= 1200 chars focused on requirements/responsibilities.
- Job analysis: <= 12 required skills, <= 8 responsibilities, <= 12 keywords.
- Resume payload for prompt: editable view only when contract supports it.

### Output Targets

- p95 output tokens for `full` reduced by >= 40% after minimal output contract rollout.
- Truncation rate for `resume_generate_full`: target 0%.

## Rollout Plan

### Step 1 - Prompt Canonicalization

- Create `TAILORING_SYSTEM_PROMPT_V3`.
- Create `IMPROVE_RESUME_PROMPT_TEMPLATE_V3`.
- Keep existing output schema for compatibility.
- Add concise limits and anti-expansion constraints.

### Step 2 - Contract Slimming (Prompt Side)

- Introduce compact contract representation for LLM prompt.
- Keep backend validator unchanged initially.
- Compare outputs against current parser/validator.

### Step 3 - Minimal Output Contract (Design Finalization)

- Finalize delta/minimal editable output schema (defined above).
- Prepare downstream apply/diff/data-picker adaptation plan (next phase).

### Step 4 - A/B Evaluation

Measure per run:

- prompt chars/tokens.
- output tokens.
- truncation/`finish_reason=length`.
- schema validity pass rate.
- manual quality spot-check of top 20 runs.

Acceptance gate:

- >= 30% prompt token reduction before contract change.
- >= 40% output token reduction after minimal contract adoption.
- No increase in hallucination or schema failure rate.

## Guardrails And Failure Handling

If output still nears token ceiling:

1. Enforce stricter bullet length cap in prompt.
2. Remove optional narrative language from summary.
3. Reduce required `changes` verbosity.
4. Trim JD excerpt further to only requirement lines.

## Deliverables

1. Prompt v3 specification (system + user templates).
2. Compact LLM-facing contract format.
3. Minimal expected output schema (editable-only).
4. Evaluation dashboard fields and acceptance thresholds.

## Definition Of Done

Phase 3.3 is complete when:

- Prompt templates are reduced to strict, non-redundant constraints.
- Prompt overhead tokens are materially reduced.
- Expected output schema is minimized and finalized for downstream integration.
- Measured runs show lower token usage and no truncation regression.
