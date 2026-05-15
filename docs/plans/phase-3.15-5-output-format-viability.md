# Output Format Viability: Replacing JSON in Resume Generation

> Brainstorm on replacing the entire JSON output structure with a streamable, lower-overhead format.
> Context: `tailor_resume_full` produces a 2,573-token JSON diff. We want something smaller, streamable, and easier to parse without sacrificing the per-cell rationale or diff granularity.

---

## Why JSON Is the Problem

The current output is a nested JSON object where every cell carries `{"value": "...", "why": "..."}`. JSON has three fundamental problems for this use case:

**1. Not streamable.** JSON is only valid when complete. You cannot parse `{"summary": {"value": "Built X`, which means the client must wait for all 2,573 tokens before displaying anything. Perceived latency equals actual latency.

**2. High syntax overhead.** Every cell burns tokens on syntax that carries zero information:
```
{"value": "...", "why": "..."}
```
The structural characters `{ " v a l u e " : " " , " w h y " : " " }` — outside the content strings — account for roughly 400–600 tokens of the total output. For a resume with 36 cells, that's 15–20% of every response that is pure punctuation.

**3. Retry risk.** Any missing comma, unclosed brace, or extra character breaks the entire parse. We run up to 2 attempts (retries=1). A failed first attempt doubles worst-case latency from 77 seconds to 154 seconds.

---

## Requirements for Any Replacement

Before evaluating formats, these are the non-negotiable properties:

| Requirement | Why it matters |
|-------------|---------------|
| **Addressable cells** | Backend must know which experience/project/bullet/skill cell each value corresponds to (EXP[0].BULLET[2], not just "second bullet of first job") |
| **Retain signal** | Model must be able to say "keep original" without copying the full original text |
| **Per-cell rationale** | "Why" annotation per cell — needed for change manifest display and QA |
| **Streamable** | Each emitted chunk should be independently parseable — no waiting for complete output |
| **Partial tolerance** | If the response truncates at token 1,800, everything up to that point should still apply |
| **Model compliance** | LLMs must reliably produce the format with low error rate — exotic formats fail in practice |
| **Backend diff** | Backend computes original vs new by position — the model just outputs final values |

One important realization from reading the codebase: the backend already does two-pass processing — `apply_compact_diff()` (apply model output) and `build_change_manifest()` (compare original vs final). This means **the model does not need to compute the diff itself**. It just needs to output final values. The backend handles "what changed."

---

## Format Catalog

### Format 1: JSON (current)

```json
{"summary":{"value":"Built data pipelines...","why":"Leads with outcome..."},
 "experience":{"0":{"position":{"value":"Sr. Data Engineer, Platform","why":"..."},
   "bullets":{"0":{"value":"Led migration...","why":"Strongest story..."},
              "1":{"value":null,"why":"Retained; weaker JD fit."}}}}}
```

- **Streamable:** No
- **Syntax overhead:** High (~500–600 tokens on a full envelope)
- **Model compliance:** Very high (heavily trained on JSON)
- **Parse complexity:** Trivial (`json.loads`)
- **Retry risk:** Medium (structural errors break parse)
- **Token count (current full envelope):** ~2,573

---

### Format 2: Section-header block text

Headers declare context. Lines within sections carry labeled fields. `-` means retain.

```
=== SUMMARY ===
Built data pipelines for analytics teams, reducing P99 latency 40%.
WHY: Leads with outcome; maps to JD reliability theme.

=== EXPERIENCE 0 ===
POSITION: Senior Data Engineer, Platform Focus
STACK: Python, Kafka, Spark, dbt, Snowflake
B0: Led migration of 12 ETL jobs to streaming, cutting lag from 4h to 30 sec.
B0-WHY: Strongest concrete story; leads the role.
B1: -
B1-WHY: Internal tooling story; weaker JD fit; retained.
B2: Built observability dashboard tracking data freshness SLAs.
B2-WHY: Reliability signal; maps to JD monitoring theme.

=== EXPERIENCE 1 ===
POSITION: -
STACK: Python, FastAPI, PostgreSQL, Redis
B0: -
B1: Refactored auth middleware cutting p95 login latency from 340ms to 80ms.
B1-WHY: Best latency story in this role; naturally maps to JD performance theme.

=== PROJECT 0 ===
NAME: -
STACK: Python, LiteLLM, FastAPI, TinyDB
B0: -
B1: Built multi-provider LLM router handling gemini, openai, deepseek with unified observability.
B1-WHY: Most relevant project; maps to JD systems integration theme.

=== SKILLS ===
G0: Languages | Python, Go, SQL, JavaScript, TypeScript
G1: Data Platform | Kafka, Spark, dbt, Snowflake, BigQuery
G0-WHY: Core language profile; kept as backbone. Preserved TypeScript for frontend signal.
G1-WHY: Data platform tools; moved first for JD relevance.

=== BOLD KEYWORDS ===
Kafka, dbt, Snowflake, Spark, Python, LiteLLM
```

- **Streamable:** Yes — each line is a complete parseable unit. Frontend updates section by section.
- **Syntax overhead:** Minimal — only the `=== ===` headers and field prefixes (`B0:`, `STACK:`)
- **Model compliance:** Very high — this reads like a structured form, a format LLMs produce reliably
- **Parse complexity:** Medium — state machine (~80 lines of Python). Header sets context, label prefix determines field.
- **Retry risk:** Very low — a malformed line is a recoverable error (retain that cell). Truncation is also recoverable (apply what parsed, retain rest).
- **Token count estimate:** ~1,450 (full envelope, all whys) → ~580 (sparse, changed cells only, with whys) → ~380 (sparse, no whys)

**Parse algorithm:**
```python
def parse_section_format(text: str) -> dict:
    result = {}
    section = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("===") and line.endswith("==="):
            section = line.strip("= ").strip()  # "EXPERIENCE 0", "SUMMARY", etc.
        elif ":" in line and section:
            label, _, value = line.partition(":")
            result[(section, label.strip())] = value.strip()
    return result
```

---

### Format 3: Flat addressed lines

Every line is self-contained with a structured address prefix. Parse: split on first `|`.

```
SUMM|Built data pipelines for analytics teams, reducing P99 latency 40%.
SUMM-W|Leads with outcome; maps to JD reliability theme.
E0-POS|Senior Data Engineer, Platform Focus
E0-STK|Python, Kafka, Spark, dbt, Snowflake
E0-B0|Led migration of 12 ETL jobs to streaming, cutting lag from 4h to 30 sec.
E0-B0-W|Strongest concrete story; leads the role.
E0-B1|-
E0-B1-W|Weaker JD fit; retained.
E0-B2|Built observability dashboard tracking data freshness SLAs.
E1-POS|-
E1-STK|Python, FastAPI, PostgreSQL, Redis
E1-B1|Refactored auth middleware cutting p95 login latency from 340ms to 80ms.
P0-NM|-
P0-STK|Python, LiteLLM, FastAPI, TinyDB
P0-B1|Built multi-provider LLM router with unified observability.
SG0|Languages|Python, Go, SQL, JavaScript, TypeScript
SG1|Data Platform|Kafka, Spark, dbt, Snowflake, BigQuery
SG0-W|Core profile; backbone preserved. TypeScript kept for frontend signal.
BOLD|Kafka, dbt, Snowflake, Spark, Python, LiteLLM
```

- **Streamable:** Yes — each line is completely independent
- **Syntax overhead:** Minimal — address codes + `|` separator only
- **Model compliance:** Moderate — addresses like `E0-B2` are readable but not natural language. Models may deviate on address formatting.
- **Parse complexity:** Low — `address, _, value = line.partition('|')`
- **Retry risk:** Very low — per-line recoverability
- **Token count estimate:** ~1,100 (full envelope + whys) → ~450 (sparse + whys) → ~280 (sparse, no whys)

Approximately 20–25% more compact than section-header format because the `===` headers and repeated field label prefixes are gone.

---

### Format 4: Markdown resume (full text output, no diff markers)

The model outputs a complete, readable resume in markdown. Backend diffs against original using fuzzy text matching.

```markdown
## Summary
Built data pipelines for analytics teams, reducing P99 latency 40% across 8 analytics consumers.

## Experience

### Senior Data Engineer at Acme Corp
**Stack:** Python, Kafka, Spark, dbt, Snowflake

- Led migration of 12 ETL jobs to streaming, cutting batch lag from 4h to under 30 sec.
- Built internal schema validation tooling used by 3 downstream teams.
- Built observability dashboard tracking data freshness SLAs across 6 pipelines.

### Backend Engineer at StartupCo
**Stack:** Python, FastAPI, PostgreSQL, Redis

- Built REST API serving 40k RPM with p99 < 50ms.
- Refactored auth middleware cutting p95 login latency from 340ms to 80ms.
...
```

- **Streamable:** Yes — pure text, streams perfectly. User reads the resume as it generates.
- **Syntax overhead:** Zero — pure prose and markdown
- **Model compliance:** Maximum — this is exactly what ChatGPT produces for this task
- **Parse complexity:** High — need fuzzy matching to map output bullets back to input bullets
- **Retry risk:** Zero — markdown is always valid
- **Token count estimate:** ~850 (similar to ChatGPT, no rationale fields, no format overhead)
- **"Why" rationale:** Would need a separate follow-up call or HTML comments `<!-- WHY: reason -->`

**The diff problem:** If the model rewrites "Reduced latency by optimizing Redis cache TTL settings" to "Cut P99 latency 40% by tuning Redis cache TTL," we need to know this maps to `workExperience[1].description[2]`. With JSON, the index tells us. With markdown, we rely on sequence matching between original bullets and new bullets.

`difflib.SequenceMatcher` can handle this but introduces fuzzy matching errors — if the model substantially rewrites a bullet, it may fail to match, creating a false "new" bullet and a false "deleted" bullet instead of a single "changed" bullet.

---

### Format 5: Hybrid — streaming resume text + end-of-stream annotation block

Output the full readable resume first (streams to user in real time), then append a compact annotation block at the end for machine parsing.

```
[Full resume in readable text, streams section by section...]

---DIFF---
E0-B0:changed
E0-B1:retained
E0-B2:changed
E0-POS:changed
E1-POS:retained
E1-B0:retained
E1-B1:changed
P0-NAME:retained
P0-B1:changed
SG0:changed
BOLD:changed
---WHYS---
E0-B0:Strongest concrete story; leads the role.
E0-B2:Reliability signal; maps to JD monitoring theme.
E1-B1:Best latency story; naturally maps to JD performance theme.
```

- **Streamable:** Yes — user sees the entire resume as it generates. Annotation block is tiny.
- **User experience:** Best possible — resume streams fully, then finishes. No wait.
- **Model compliance:** Moderate — requires the model to accurately remember what it changed vs retained for the annotation. This is asking the model to do meta-reasoning about its own output.
- **Parse complexity:** Medium — two parsers (resume text + annotation block)
- **Risk:** If model errors in the annotation block (marks retained as changed or vice versa), the change manifest is wrong. The change manifest is for UI/QA only — incorrect annotations don't break the resume, but break the diff display.
- **Token count estimate:** ~850 (resume) + ~200 (annotation) = ~1,050 total

---

### Format 6: YAML

```yaml
summary: "Built data pipelines for analytics teams, reducing P99 40%."
experience:
  - position: "Senior Data Engineer, Platform Focus"
    tech_stacks: "Python, Kafka, Spark, dbt, Snowflake"
    bullets:
      - "Led migration of 12 ETL jobs to streaming, cutting lag from 4h to 30 sec."
      - ~
      - "Built observability dashboard tracking data freshness SLAs."
  - position: ~
    tech_stacks: "Python, FastAPI, PostgreSQL, Redis"
    bullets:
      - ~
      - "Refactored auth middleware cutting p95 login latency."
skills:
  - label: "Languages"
    values: [Python, Go, SQL, JavaScript, TypeScript]
  - label: ~
    values: [Kafka, Spark, dbt, Snowflake, BigQuery]
bold_keywords: [Kafka, dbt, Snowflake, Spark, Python, LiteLLM]
```

- **Streamable:** No — YAML blocks end when the next peer-level key appears. You cannot parse a YAML list incrementally without knowing where the list ends. Same buffering problem as JSON.
- **Syntax overhead:** Lower than JSON (~20% fewer tokens — no key quotes, `~` for null)
- **Model compliance:** High — models see YAML constantly (GitHub Actions, k8s, docker-compose)
- **Parse:** `yaml.safe_load()` — trivial. But has gotchas: `no` → `False`, `1e2` → `100.0`, etc.
- **Retry risk:** Low-medium — YAML parse errors are less common than JSON but still possible on indentation mistakes

YAML is a modest improvement over JSON but doesn't solve streaming. Skip unless streaming is not a priority.

---

## Deep Comparison: Top Three Formats

### Token efficiency (estimated, full envelope with all whys, same resume)

| Format | Total output tokens | vs JSON |
|--------|-------------------|---------|
| JSON (current) | ~2,573 | baseline |
| Section-header (full + whys) | ~1,450 | −44% |
| Flat addressed (full + whys) | ~1,100 | −57% |
| Section-header (sparse + whys) | ~580 | −77% |
| Flat addressed (sparse + whys) | ~450 | −83% |
| Markdown full resume (no why) | ~850 | −67% |
| Hybrid text + annotation | ~1,050 | −59% |

Sparse formats assume ~12 of 36 cells change per run (typical for a targeted tailoring).

### Streaming capability

| Format | First content visible | Section visible | Complete usable |
|--------|----------------------|----------------|----------------|
| JSON (current) | Never (buffered) | Never | After 77 sec |
| Section-header | < 1 sec (SUMMARY line) | Section by section | As it streams |
| Flat addressed | < 1 sec (SUMM line) | Per line | As it streams |
| Markdown | < 1 sec | Paragraph by paragraph | As it streams |
| Hybrid | < 1 sec (prose begins) | Section by section | Resume at ~60 sec, annotation at end |
| YAML | Never (buffered) | Never | After full response |

### Robustness to model errors

| Format | Bad line behavior | Truncation behavior | Retry needed? |
|--------|-------------------|---------------------|--------------|
| JSON | Entire parse fails | Entire parse fails | Yes |
| Section-header | That cell retained | All prior lines applied | Rarely |
| Flat addressed | That line skipped | All prior lines applied | Never |
| Markdown | N/A (prose always valid) | Prior sections apply | Never |
| Hybrid | Annotation error only | Resume applies; annotation partial | Never |

---

## Recommended Format: Section-Header Block

Between the top candidates, **section-header block (Format 2)** is the best balance of:
- High model compliance (natural-language form style)
- Full streaming capability
- Robust partial-parse tolerance
- Retains per-cell rationale without overhead
- Sparse output (emit only changed sections)
- Human-readable — you can read the raw LLM output directly

The flat addressed format (Format 3) is ~25% more compact but relies on cryptic address codes that models may get wrong under complex resume structures. The slight compactness gain is not worth the compliance risk for a resume with 5+ experience entries and 30+ bullets.

---

## What the Prompt Would Look Like

The RESPONSE CONTRACT currently specifies every cell by index (a large JSON blob). With section-header format, the contract becomes a filled-in template with `[RETAIN OR NEW TEXT]` placeholders:

```
OUTPUT FORMAT: Section-header block. Emit only sections with changes.

RETAIN SIGNAL: A single hyphen `-` on a line means keep the original text unchanged.

FORMAT EXAMPLE:
=== SUMMARY ===
[write final summary here, 1 sentence]
WHY: [12 words max]

=== EXPERIENCE 0 === (Senior Data Engineer, 2022–Present)
POSITION: [new position text, or -]
STACK: [comma-separated tools, or -]
B0: [final bullet 0 text, or -]
B0-WHY: [why, 12 words max]
B1: [final bullet 1 text, or -]
...

=== EXPERIENCE 1 === (Backend Engineer, 2020–2022)
...

[OMIT a full section entirely if nothing in it changes]

=== SKILLS ===
G0: [label] | [comma-separated values, or -]
G1: [label, or -] | [comma-separated values, or -]

=== BOLD KEYWORDS ===
[6-10 comma-separated terms]
```

This is far more readable than the current contract JSON, models fill in forms reliably, and the format is naturally sparse (omitting an entire section is valid and expected).

---

## Backend Parser Sketch (~100 lines)

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class ParsedDiff:
    summary: Optional[str] = None
    summary_why: Optional[str] = None
    experience: dict = field(default_factory=dict)   # {idx: {field: value}}
    projects: dict = field(default_factory=dict)
    skills: list = field(default_factory=list)        # [{label, values}]
    bold_keywords: list = field(default_factory=list)

RETAIN = object()  # sentinel: use original value

def parse_section_format(text: str) -> ParsedDiff:
    result = ParsedDiff()
    section_type = None  # "SUMMARY", "EXPERIENCE", "PROJECT", "SKILLS", "BOLD"
    section_idx = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue

        # --- Section headers ---
        if line.startswith("===") and line.endswith("==="):
            header = line.strip("= ").strip().upper()
            if header == "SUMMARY":
                section_type, section_idx = "SUMMARY", None
            elif header.startswith("EXPERIENCE"):
                section_type = "EXPERIENCE"
                section_idx = int(header.split()[-1])
                result.experience.setdefault(section_idx, {})
            elif header.startswith("PROJECT"):
                section_type = "PROJECT"
                section_idx = int(header.split()[-1])
                result.projects.setdefault(section_idx, {})
            elif header == "SKILLS":
                section_type, section_idx = "SKILLS", None
            elif header == "BOLD KEYWORDS":
                section_type, section_idx = "BOLD", None
            continue

        # --- Field lines ---
        if ":" not in line:
            continue
        label, _, value = line.partition(":")
        label = label.strip()
        value = value.strip()
        cell_value = RETAIN if value == "-" else value

        if section_type == "SUMMARY":
            if label == "WHY":
                result.summary_why = value
            else:
                result.summary = cell_value

        elif section_type in ("EXPERIENCE", "PROJECT"):
            target = result.experience if section_type == "EXPERIENCE" else result.projects
            entry = target[section_idx]
            if label == "POSITION":
                entry["position"] = cell_value
            elif label == "STACK":
                entry["tech_stacks"] = cell_value
            elif label == "NAME":
                entry["name"] = cell_value
            elif label.startswith("B") and "-WHY" not in label:
                bullet_idx = int(label[1:])
                entry.setdefault("bullets", {})[bullet_idx] = cell_value
            elif label.startswith("B") and "-WHY" in label:
                bullet_idx = int(label[1:label.index("-")])
                entry.setdefault("bullet_whys", {})[bullet_idx] = value

        elif section_type == "SKILLS":
            if "|" in line:
                _, _, rest = line.partition(":")
                label_val, _, values_val = rest.strip().partition("|")
                result.skills.append({
                    "label": RETAIN if label_val.strip() == "-" else label_val.strip(),
                    "values": [v.strip() for v in values_val.split(",")]
                })

        elif section_type == "BOLD":
            result.bold_keywords = [v.strip() for v in value.split(",")]

    return result
```

The `apply_new_format_diff()` function then walks `ParsedDiff` and for each non-RETAIN value, writes it to the resume dict. For RETAIN, it copies from the original. The existing `build_change_manifest()` still runs unchanged on the before/after resume — it does not depend on LLM output format at all.

---

## "Why" Field Strategy With New Format

Three options for rationale with the section-header format:

**Option A — Inline why on the line after each cell:**
```
B0: Led migration of 12 ETL jobs to streaming.
B0-WHY: Strongest story; maps to JD reliability theme.
```
Easy to prompt, easy to parse, streams in order, per-cell granularity preserved. This is the recommended approach.

**Option B — Why block at section footer:**
```
=== EXPERIENCE 0 ===
B0: Led migration of 12 ETL jobs.
B1: -
B2: Built observability dashboard.
WHYS: B0—Strongest story. B2—Reliability signal.
```
Slightly more compact but harder to parse and prompting is less reliable.

**Option C — No why in LLM output; generate separately:**
After the main response applies, run a cheap follow-up call: "For each changed cell, provide a one-sentence rationale." Parallelizable with rendering. Eliminates why from the primary call entirely — saves another ~400–500 tokens from the main call. Trade-off: two API calls, latency of second call (~5–8 sec for a lightweight model).

---

## Migration Path

Switching formats is a contained change because the pipeline is modular:

| Component | Change needed |
|-----------|--------------|
| `resume_diff_output.txt` | Replace entire OUTPUT CONTRACT section with new format spec |
| `llm_calls.py` → `run_primary_tailoring()` | Remove `complete_json()`, use `complete()` (plain text completion) |
| `validation.py` → `validate_compact_diff()` | Replace with `validate_section_format()` — check required sections present |
| `preservation.py` → `apply_compact_diff()` | Replace with `apply_section_format_diff()` using the parser above |
| `change_manifest.py` → enrichment functions | `build_change_manifest()` runs unchanged (original vs applied diff); only `enrich_change_manifest_with_tailored_cells()` needs updating to read from `ParsedDiff` instead of `TailoringLLMResponseV2` |
| `models.py` → `TailoringLLMResponseV2` | Keep for backward compat during migration; can be removed after |
| Frontend streaming integration | Wire SSE/chunked response from the `/tailor` endpoint; display section by section |

**No changes needed:** `orchestration.py` orchestration logic, `contracts.py` contract building, `analysis.py`, all of the change manifest comparison logic, all frontend change display code (reads `ResumeChange[]` which comes from `build_change_manifest()` unchanged).

The format swap is approximately **200–300 lines of new backend code** replacing equivalent JSON-specific code, plus the prompt file change. All existing tests for orchestration, analysis, and the frontend remain valid.

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Model formats addresses incorrectly (B0 vs BULLET 0 vs b0) | Low | Medium | Normalize in parser: strip whitespace, lowercase, regex match `b\d+` |
| Model emits an extra blank section | Low | None | Parser ignores unrecognized headers |
| Bullet text containing `:` breaks `partition(':')` | Medium | None | Use `partition(':')` not `split(':')` — takes only the first colon |
| Model omits BOLD KEYWORDS section | Low | Low | Default to empty; existing bold_keywords logic handles missing |
| Section index wrong (writes EXPERIENCE 2 when contract has 0,1) | Low | Medium | Validate section indices against contract; ignore out-of-range |
| Why field missing on a changed cell | Low | Low | Why is optional in parse; change manifest still records the change |
| Full regression on output quality | Unknown | High | A/B test on 20 runs: new format vs JSON with same model |

The biggest unknown is quality regression. Models trained extensively on JSON may produce slightly better adherence to field-level constraints (like position title rules) when the schema is JSON. A/B testing is essential before production.

---

## Summary Recommendation

| | JSON (current) | Section-header block |
|-|---------------|---------------------|
| Streamable | No | Yes |
| User sees first content | ~77 sec | < 1 sec |
| Output tokens (full) | 2,573 | ~1,450 |
| Output tokens (sparse) | N/A (full envelope required) | ~580 |
| Retry risk | Medium | Negligible |
| Implementation effort | baseline | ~3–4 days |
| Quality risk | baseline | Unknown — needs A/B |

**Confidence on viability: High.** The format is natural for LLMs, the parse is simple, streaming is trivially added on top, and the existing orchestration and change-manifest logic is untouched. The migration is surgical — only the LLM call, format contract, and apply logic change.

The one thing this cannot eliminate is extended thinking overhead (the 30–35 second pre-generation silence). Switching from JSON to section-header format saves ~1,100 output tokens on a full envelope run, which at ~40 tok/sec is roughly **27 seconds**. Combined with disabling thinking on a non-thinking model, total generation time drops from ~77 sec to an estimated **8–14 sec**.
