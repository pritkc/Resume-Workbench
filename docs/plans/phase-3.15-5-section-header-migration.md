# Section-Header Output Format: End-to-End Migration Blueprint

> Migrated and expanded from `phase-3.15-5-output-format-viability.md`.
> This document is the single source of truth for implementing the JSON → section-header output format change.

---

## What This Changes

The current pipeline asks the LLM to produce a JSON diff object. We are replacing the **output only** with a section-header block format. The input to the LLM (resume JSON, JD extract) changes shape separately and is covered below. The diff logic, change manifest, and all frontend code are untouched.

**Before (LLM output):**
```json
{"summary":{"value":"Built data pipelines...","why":"JD maps to reliability..."},
 "experience":{"0":{"position":{"value":"Sr. Data Eng, Platform","why":"..."},
   "bullets":{"0":{"value":"Led migration...","why":"Strongest story."},
              "1":{"value":null,"why":"Retained; weaker fit."}}}}}
```

**After (LLM output):**
```
=== SUMMARY ===
Built data pipelines for analytics teams, reducing P99 latency 40%.
WHY: Leads with outcome; maps to JD reliability theme.

=== EXPERIENCE 0 === (Acme Corp · Sr. Data Engineer · 2022–Present)
POSITION: Senior Data Engineer, Platform Focus
STACK: Python, Kafka, Spark, dbt, Snowflake
B0: Led migration of 12 ETL jobs to streaming, cutting lag from 4h to 30 sec.
B0-WHY: Strongest concrete story; leads the role.
B1: [RETAIN]
B1-WHY: Internal tooling story; weaker JD fit; retained.
```

---

## Section-Header Format Specification

### Canonical output shape

```
=== SUMMARY ===
[one sentence, 105–135 chars]
WHY: [max 12 words]

=== EXPERIENCE {n} === ({company} · {position} · {period})
POSITION: [[RETAIN] or new title]
STACK: [[RETAIN] or comma-separated stack]
B{i}: [[RETAIN] or new bullet text]
B{i}-WHY: [max 12 words]
...one B{i}/B{i}-WHY pair per bullet in contract...

=== PROJECT {n} === ({project name})
NAME: [[RETAIN] or minor clarification]
STACK: [[RETAIN] or comma-separated stack]
B{i}: [[RETAIN] or new bullet text]
B{i}-WHY: [max 12 words]

=== SKILLS ===
G{n}: {label or [RETAIN]} | {val1, [RETAIN], val3, ...}
G{n}-WHY: [max 12 words covering all chips]

=== BOLD KEYWORDS ===
{term1}, {term2}, ..., {termN}
```

### Retain signal

`[RETAIN]` is the canonical retain signal. It is unambiguous: no resume text, stack entry, or bullet ever starts with `[RETAIN]`, so false positives are structurally impossible. The brackets signal metadata, not content — a pattern models recognise from prompt templates and structured forms.

Why not `-` (single dash): a dash appears naturally in resume content (hyphenated words, date ranges like "2020–2022", leading list markers). In a parser context `B0: -` is unambiguous today, but under model drift or multiline edge cases the single character creates unnecessary fragility. `[RETAIN]` costs ~2 extra output tokens per retained cell but removes all ambiguity.

**Canonical signal:** `[RETAIN]`

**Parser fallback aliases** (normalised to retain in code — handles model drift):
- `-` or `--` or `—` (dash variants)
- `[RETAIN]`, `[retain]`, `[Retain]` (case variants)
- `null`, `none`, `unchanged`, `keep` (word variants, case-insensitive)
- blank value after a recognised field prefix → retain with warning logged

**Prompt wording:** `"Write [RETAIN] to keep the original value. Do not copy the original text."`

### Sparse output

The model **may omit an entire section** if nothing in it changes. Omitting `=== EXPERIENCE 1 ===` means all cells in that entry are retained. This is valid and expected for targeted tailoring where only 1–2 roles change.

`=== SUMMARY ===` and `=== BOLD KEYWORDS ===` are always emitted — they are small and needed for every render.

### Skills format

Skills use a pipe separator on one line: `G{n}: {label} | {val1}, {val2}, {val3}`. The number of values must match the contract's `value_counts[n]`. If label is retained, write `[RETAIN]` before the pipe: `G1: [RETAIN] | Python, Go, SQL`. If a single skill chip is retained within the values list, write `[RETAIN]` in that position: `G0: Languages | Python, [RETAIN], SQL, Go, [RETAIN]`.

### Why fields

`B{i}-WHY:` appears on the line immediately following `B{i}:`. It is optional in the parser — if missing, the change manifest records the change without a model rationale. Retained cells (`B{i}: -`) still emit a why line for QA review.

---

## Input/Output Distinction Strategy

The model currently receives JSON on both sides (input and output). With the new format, the distinction is intentional and clear:

| Layer | Format | Role |
|-------|--------|------|
| Resume input (`$original_resume`) | Minified JSON | Source data the model reads FROM |
| JD extract (`$jd_intel`) | Native section-header text (sliced from extract output) | Signal injection (see §JD Extract) |
| Response contract (`$response_contract`) | Section-header TEMPLATE | The actual output form the model fills in |
| LLM output | Section-header block | Completed template |

**Why JSON-in / section-header-out works without confusion:**

The input JSON and the output section-header are structurally incompatible — there is no way to confuse them. JSON starts with `{`, section-header starts with `===`. The prompt explicitly says:

> "Fill in the OUTPUT TEMPLATE below. Write `[RETAIN]` to keep a field unchanged. Use `===` section headers exactly as shown."

The response contract becoming a pre-filled template is the key architectural change. The model is no longer interpreting an abstract schema — it is filling in a form where every slot is labeled with the exact field name and exact index it maps to.

---

## The Contract-as-Template: Core Architectural Change

### Current flow

`TailoringResponseContract.to_prompt_dict()` → JSON string → injected as `$response_contract` → model interprets schema and produces matching JSON

### New flow

`TailoringResponseContract.to_section_template()` → section-header template string → injected as `$output_template` → model fills in the template

### What `to_section_template()` produces

For a resume with 2 experience entries (4 and 3 bullets), 1 project (2 bullets), and 2 skill groups (5 and 8 values):

```
=== SUMMARY ===
[FINAL SUMMARY — 1 sentence, 105–135 chars]
WHY: [max 12 words]

=== EXPERIENCE 0 === (Acme Corp · Senior Data Engineer · 2022–Present)
POSITION: [- or new title qualifier only]
STACK: [- or new comma-separated stack]
B0: [- or rewrite]
B0-WHY: [max 12 words]
B1: [- or rewrite]
B1-WHY: [max 12 words]
B2: [- or rewrite]
B2-WHY: [max 12 words]
B3: [- or rewrite]
B3-WHY: [max 12 words]
⬦ Budget: max 2 of 4 bullets may be JD-direct; keep ≥2 original stories.

=== EXPERIENCE 1 === (StartupCo · Backend Engineer · 2020–2022)
POSITION: [- or new title qualifier only]
STACK: [- or new comma-separated stack]
B0: [- or rewrite]
B0-WHY: [max 12 words]
B1: [- or rewrite]
B1-WHY: [max 12 words]
B2: [- or rewrite]
B2-WHY: [max 12 words]
⬦ Budget: max 1 of 3 bullets may be JD-direct; keep ≥2 original stories.

=== PROJECT 0 === (Resume Matcher)
NAME: [- or minor clarification — no JD parentheticals]
STACK: [- or new stack]
B0: [- or rewrite]
B0-WHY: [max 12 words]
B1: [- or rewrite]
B1-WHY: [max 12 words]

=== SKILLS ===
G0: [label or -] | [5 comma-separated values]
G0-WHY: [max 12 words covering all 5 chips]
G1: [label or -] | [8 comma-separated values]
G1-WHY: [max 12 words covering all 8 chips]

=== BOLD KEYWORDS ===
[6–10 comma-separated ATS terms — tools, languages, platforms only]
```

**Why this is better than the JSON contract:**
- Every slot is explicit — the model cannot miss a bullet or add an extra one
- Budget rules are inline with the entry they apply to
- Company names in headers give context without being editable (the model can see them but has no field to write them)
- Placeholder text is the instruction — no separate schema docs needed
- Constraint for skills (`exactly N values`) is inline

### Method signature

```python
# contracts.py — new method on TailoringResponseContract
def to_section_template(self) -> str:
    """Generate the output template the model fills in.

    Replaces to_prompt_dict() for section-header format runs.
    """
    lines: list[str] = []

    # Summary — always present
    lines += [
        "=== SUMMARY ===",
        "[FINAL SUMMARY — 1 sentence, 105–135 chars]",
        "WHY: [max 12 words]",
        "",
    ]

    # Experience entries
    for i, (label, position, stack, n_bullets, jd_budget, story_min) in enumerate(zip(
        self.experience_entries,
        self.experience_positions,
        self.experience_tech_stacks,
        self.experience_bullet_counts,
        self.direct_jd_bullet_budget,
        self.preserve_story_min,
    )):
        lines.append(f"=== EXPERIENCE {i} === ({label} · {position})")
        lines.append("POSITION: [[RETAIN] or new title qualifier only]")
        lines.append("STACK: [[RETAIN] or new comma-separated stack]")
        for b in range(n_bullets):
            lines.append(f"B{b}: [[RETAIN] or rewrite]")
            lines.append(f"B{b}-WHY: [max 12 words]")
        lines.append(
            f"⬦ Budget: max {jd_budget} of {n_bullets} bullets may be JD-direct; keep ≥{story_min} original stories."
        )
        lines.append("")

    # Project entries
    for i, (label, n_bullets) in enumerate(zip(self.project_entries, self.project_bullet_counts)):
        lines.append(f"=== PROJECT {i} === ({label})")
        lines.append("NAME: [[RETAIN] or minor clarification — no JD parentheticals]")
        lines.append("STACK: [[RETAIN] or new stack]")
        for b in range(n_bullets):
            lines.append(f"B{b}: [[RETAIN] or rewrite]")
            lines.append(f"B{b}-WHY: [max 12 words]")
        lines.append("")

    # Skills
    if self.skill_group_value_counts:
        lines.append("=== SKILLS ===")
        for i, count in enumerate(self.skill_group_value_counts):
            lines.append(f"G{i}: [[RETAIN] or new label] | [{count} values, use [RETAIN] per chip to keep original]")
            lines.append(f"G{i}-WHY: [max 12 words covering all {count} chips]")
        lines.append("")

    # Bold keywords — always present
    lines += [
        "=== BOLD KEYWORDS ===",
        "[6–10 comma-separated ATS terms — tools, languages, platforms only]",
    ]

    return "\n".join(lines)
```

---

## JD Extract: Native Section-Header Output

### The simpler approach

Rather than having the backend transform JSON keys to compact labels, redesign the `extract_jd_intel` step to output this format natively. The extract LLM writes the compact text directly; the backend passes the relevant section straight through to the tailoring prompt with zero transformation.

This eliminates:
- The `_JD_EXTRACT_LABEL_MAP` backend mapping
- The 9-line JD INTELLIGENCE GUIDE in `tailor_resume_full/user.txt` (duplication of field descriptions)
- Any mismatch between what the backend remaps and what the prompt says

### New extract output format

The `extract_jd_intel` step produces two sections — one for machine-parseable metadata (role/company/location for cover letter and UI), one for the resume tailoring signal:

```
=== JD METADATA ===
ROLE: Senior Data Engineer
COMPANY: Acme Corp
LOCATION: Remote

=== JD INTEL ===
HOOKS: reliability engineering, API architecture, data pipeline scaling
MUST-MATCH: Kafka, Python, Kubernetes
KEYWORDS: distributed systems, event streaming, gRPC, observability
THEMES: data-driven decisions, cross-functional collaboration
AVOID: Agile, SDLC, stakeholder management, process optimization
BOLD-CANDS: Kafka, Kubernetes, Python, gRPC, Redis
DOMAIN: fintech data infrastructure for mortgage origination
LEVEL: Senior IC; owns team-level delivery end-to-end
```

### Redesigned `extract_jd_intel/user.txt`

Replace the current JSON schema template with:

```
Return the job description analysis in this exact format. No JSON, no markdown, no extra keys.

=== JD METADATA ===
ROLE: [normalized title only — remove employer, location, employment type]
COMPANY: [company name exactly as stated, or blank if not stated]
LOCATION: [City, ST for US cities only; blank for remote-only or unstated]

=== JD INTEL ===
HOOKS: [exactly 6 short verb+object competency hooks, comma-separated]
MUST-MATCH: [exact-match terms worth including when credible — tools, systems, languages, platforms]
KEYWORDS: [high-signal ATS technical terms; no responsibility phrases or basic tools]
THEMES: [responsibility ideas to translate naturally without mirroring JD wording]
AVOID: [generic responsibility phrases, weak umbrella terms, and tools too basic to signal]
BOLD-CANDS: [6–10 short source terms for bold_keywords; tools, languages, platforms, data methods only]
DOMAIN: [industry/product/domain context; use JD evidence only]
LEVEL: [one sentence on ownership footprint and decision scope]

Rules:
- Use JD evidence only. Do not infer unstated company facts, technology, level, or domain.
- All values are comma-separated on one line except LEVEL (one prose sentence).
- HOOKS: distinct major duties, deduped, 6 items, not full responsibility sentences.
- MUST-MATCH: exact systems/products/languages worth matching when the resume supports them.
- AVOID: includes generic soft skills, broad umbrella terms, and tools too basic to signal seniority.
- BOLD-CANDS: 1–3 word non-basic tools only; no responsibility phrases or soft skills.
- LEVEL: do not guess title ladder beyond what the JD states.
- If a value is empty, write the label with a blank value on its own line.

Job description:
$job_description
```

### How the `=== JD METADATA ===` section replaces `extract_job_target_metadata()`

Currently `extract_job_target_metadata()` in `cover_letter.py` parses the JSON `job_keywords` dict to extract role/company/location. With the new format, add a simple parser:

```python
def parse_jd_metadata(raw_extract: str) -> dict[str, str | None]:
    """Parse ROLE/COMPANY/LOCATION from the JD METADATA section."""
    result: dict[str, str | None] = {"role": None, "company": None, "location": None}
    in_metadata = False
    for line in raw_extract.splitlines():
        stripped = line.strip()
        if stripped == "=== JD METADATA ===":
            in_metadata = True
            continue
        if stripped.startswith("===") and in_metadata:
            break  # past METADATA section
        if in_metadata and ":" in stripped:
            label, _, value = stripped.partition(":")
            key = label.strip().lower()
            val = value.strip() or None
            if key == "role":
                result["role"] = val
            elif key == "company":
                result["company"] = val
            elif key == "location":
                result["location"] = val
    return result
```

This replaces the current multi-path extraction logic in `extract_job_target_metadata()` — one format, one parser, no JSON key aliases to maintain.

### How the `=== JD INTEL ===` section flows to tailoring

The backend stores the full extract text in the database. When building the tailoring prompt:

```python
def _jd_intel_section(raw_extract: str) -> str:
    """Slice the JD INTEL section from the extract output for injection."""
    in_intel = False
    lines = []
    for line in raw_extract.splitlines():
        if line.strip() == "=== JD INTEL ===":
            in_intel = True
            continue
        if line.strip().startswith("===") and in_intel:
            break
        if in_intel:
            lines.append(line)
    return "\n".join(lines).strip()
```

Inject this as `$jd_intel` in `tailor_resume_full/user.txt`. No label remapping, no dict lookup, no transform.

**Prompt file change** (`tailor_resume_full/user.txt`):
- Remove: entire JD INTELLIGENCE GUIDE section (9 lines referencing individual JSON keys)
- Replace variable: `$extract_jd_intel_output` → `$jd_intel`
- Replace 9-line guide with one line: `Use HOOKS as primary competency anchors; MUST-MATCH for exact-match terms when credible; AVOID to demote or skip; LEVEL as seniority ceiling.`

### Database storage change

Currently `job_keywords` stores a JSON dict. With the new format:
- Store the full raw text string in `job_keywords` (or a new `jd_extract_text` field)
- Backward compat: if stored value starts with `{`, treat as legacy JSON and fall through to old `extract_job_target_metadata()` path
- New: if stored value contains `=== JD METADATA ===`, use `parse_jd_metadata()`

This means old and new coexist without a migration.

**Token reduction:** JD section in tailoring prompt drops from ~5,063 → ~800 chars, saving ~1,066 input tokens. The extract step itself is faster since it outputs compact text (~300 tokens) vs nested JSON (~967 tokens). `extract_jd_intel` estimated wall time drops from ~21 sec to ~7–10 sec.

---

## Cover Letter: Section-Header Variant

The cover letter already uses delimiter markers (`<<COVER_LETTER>>` / `<<END_COVER_LETTER>>`). Standardize to `=== ===` format for consistency. This is a low-risk change to `cover_letter/user.txt` and `parse_combined_message_response()`.

**New output format:**
```
=== COVER LETTER ===
[150-word body, 3 paragraphs]

=== OUTREACH MESSAGE ===
[60-word message, 2–3 sentences]
```

**Parser change** (`cover_letter.py` → `parse_combined_message_response()`):

```python
# Current
COVER_RE = re.compile(r"<<COVER_LETTER>>(.*?)<<END_COVER_LETTER>>", re.DOTALL)
OUTREACH_RE = re.compile(r"<<OUTREACH_MESSAGE>>(.*?)<<END_OUTREACH_MESSAGE>>", re.DOTALL)

# New — also keep old patterns as fallback for in-flight requests
SECTION_RE = re.compile(
    r"===\s*COVER LETTER\s*===\s*(.*?)\s*(?===\s*OUTREACH|\Z)",
    re.DOTALL | re.IGNORECASE,
)
```

Keep both patterns in the parser during transition — old delimiter pattern as fallback — then remove after one release.

---

## Edge Case Catalog and Parser Defenses

### Header formatting variants

| Model output | What to do |
|---|---|
| `=== experience 0 ===` | Uppercase before matching: `"EXPERIENCE 0"` |
| `===EXPERIENCE 0===` | Strip `=` and spaces: same result |
| `=== EXPERIENCE 0` | Missing closing `===` — accept if `===` at start |
| `EXPERIENCE 0` | No `===` at all — warn, attempt to match as header if line matches `^[A-Z]+ \d+$` |
| `=== EXPERIENCE 0 === (extra notes)` | Strip comment after second `===`; keep idx |
| `=== EXPERIENCE 0 === Acme Corp...` | Same — annotation is informational, not parsed |

**Normalization function:**
```python
def _parse_header(line: str) -> tuple[str, int | None] | None:
    """Returns (section_type, index) or None if not a header."""
    stripped = line.strip("= ").strip()
    # Remove trailing annotation in parens
    stripped = re.sub(r"\s*\(.*", "", stripped).strip().upper()
    m = re.match(r"^(SUMMARY|EXPERIENCE|PROJECT|SKILLS|BOLD\s*KEYWORDS?)(?:\s+(\d+))?$", stripped)
    if not m:
        return None
    sec = m.group(1).replace(" ", "_")  # "BOLD KEYWORDS" → "BOLD_KEYWORDS"
    idx = int(m.group(2)) if m.group(2) else None
    return sec, idx
```

### Field label variants

| Model output | Normalize to |
|---|---|
| `B 0:` | `B0` |
| `BULLET 0:` | `B0` |
| `b0:` | `B0` |
| `B0 :` | `B0` |
| `BULLET0:` | `B0` |
| `POSITION :` | `POSITION` |
| `Tech Stack:` | `STACK` |
| `TECHSTACK:` | `STACK` |
| `KEYWORDS:` (inside experience) | `STACK` |
| `GROUP 0:` (inside SKILLS) | `G0` |
| `SKILL 0:` | `G0` |
| `g0:` | `G0` |

**Label normalization:**
```python
_LABEL_ALIASES = {
    "BULLET": "B",
    "TECH STACK": "STACK",
    "TECHSTACK": "STACK",
    "TECH_STACK": "STACK",
    "KEYWORDS": "STACK",
    "GROUP": "G",
    "SKILL": "G",
    "TITLE": "POSITION",
    "ROLE": "POSITION",
    "PROJECT NAME": "NAME",
    "BOLD": "BOLD",
    "BOLD KEYWORDS": "BOLD",
}

def _normalize_label(raw: str) -> str:
    upper = raw.strip().upper()
    # Normalize B\d+ and G\d+ variants
    m = re.match(r"^(?:BULLET|B)\s*(\d+)$", upper)
    if m:
        return f"B{m.group(1)}"
    m = re.match(r"^(?:B|BULLET)\s*(\d+)\s*-\s*WHY$", upper)
    if m:
        return f"B{m.group(1)}-WHY"
    m = re.match(r"^(?:GROUP|SKILL|G)\s*(\d+)$", upper)
    if m:
        return f"G{m.group(1)}"
    m = re.match(r"^(?:G|GROUP|SKILL)\s*(\d+)\s*-\s*WHY$", upper)
    if m:
        return f"G{m.group(1)}-WHY"
    return _LABEL_ALIASES.get(upper, upper)
```

### Retain signal variants

```python
# Canonical: [RETAIN] — parser also accepts these fallback aliases
_RETAIN_SIGNALS = {
    "[retain]",           # canonical (parser lowercases before check)
    "-", "--", "—", "–", # dash variants
    "null", "none", "unchanged", "keep", "n/a",  # word variants
    "",                   # blank value after prefix — retain with warning
}

def _is_retain(value: str) -> bool:
    return value.strip().lower() in _RETAIN_SIGNALS
```

`[RETAIN]` in the values list of a skill group (comma-split positions) follows the same check per chip:
```python
def _parse_skill_values(raw: str) -> list[str | None]:
    return [None if _is_retain(v) else v.strip() for v in raw.split(",")]
```

### Multiline bullet continuation

If a line has no recognized field prefix and the current context is a bullet field, append to the previous bullet text:

```python
# In parse loop: if current state is "inside bullet B{i}" and next line has no prefix:
if current_bullet is not None and ":" not in line and not line.startswith("==="):
    current_bullet_text += " " + line.strip()
    # parser logs a warning: "multiline bullet continuation in EXP {n} B{i}"
```

### Why on same line as value

Model may write: `B0: Led migration of 12 ETL jobs. WHY: Strongest story.`

Detect by checking if `WHY:` appears after a space on a value line:

```python
if " WHY:" in value_part:
    value_text, _, why_text = value_part.partition(" WHY:")
    entry.bullets[idx] = ParsedBulletEntry(value=value_text.strip(), why=why_text.strip())
```

### Out-of-range index

```python
if section_idx is not None and section_idx >= expected_count:
    parse_errors.append(f"Index {section_idx} out of range for {section_type} (contract has {expected_count})")
    current_section = None  # skip all lines until next valid header
    continue
```

### Duplicate section

If `=== SUMMARY ===` appears twice, last one wins. Parser overwrites the previous value. Log a warning but do not fail.

### Truncation mid-response

Because each line is independently parseable, truncation at any line produces a valid partial result. Everything before the truncation point applies; everything after retains the original. No retry needed unless the response is empty.

**Retry threshold:** Retry only if `bold_keywords` is empty AND `summary` was not emitted (implies very early truncation, likely a token-cap issue). Single retry with `max_tokens × 1.2`.

### Skills: wrong value count

Model emits `G0: Languages | Python, Go, SQL` but contract says `value_counts[0] = 5`. Options:
- Fewer values than contract: pad with `None` (retain remaining chips). Log warning.
- More values than contract: truncate to `value_counts[0]`. Log warning.

### Extra content before first header

Model may add a preamble: `"Here is the tailored resume output:\n\n=== SUMMARY ==="`. Parser: skip all lines until the first `===` header. Any line before the first `===` is discarded.

### ⬦ Budget annotation line

The template includes `⬦ Budget: max N of M bullets...` as a reminder to the model. The parser must not treat it as a field line. Skip any line starting with `⬦`.

---

## Data Structures

### `ParsedSectionDiff` (new, replaces `TailoringLLMResponseV2` in the parse path)

```python
# section_format.py

from __future__ import annotations
from dataclasses import dataclass, field

RETAIN = None  # sentinel value throughout the parsed diff

@dataclass
class ParsedBulletEntry:
    value: str | None       # None = retain original
    why: str | None = None

@dataclass
class ParsedExperienceEntry:
    position: str | None = None       # None = retain
    tech_stacks: str | None = None    # None = retain
    bullets: dict[int, ParsedBulletEntry] = field(default_factory=dict)

@dataclass
class ParsedSkillGroup:
    label: str | None = None          # None = retain
    values: list[str | None] = field(default_factory=list)  # None per slot = retain chip
    why: str | None = None

@dataclass
class ParsedSectionDiff:
    summary: str | None = None
    summary_why: str | None = None
    experience: dict[int, ParsedExperienceEntry] = field(default_factory=dict)
    projects: dict[int, ParsedExperienceEntry] = field(default_factory=dict)
    skills: list[ParsedSkillGroup] = field(default_factory=list)
    bold_keywords: list[str] = field(default_factory=list)
    parse_errors: list[str] = field(default_factory=list)
    parse_warnings: list[str] = field(default_factory=list)
```

### Adapter: `ParsedSectionDiff` → `TailoringLLMResponseV2`

To avoid rewriting the enrichment functions, add an adapter that converts `ParsedSectionDiff` to the existing `TailoringLLMResponseV2` shape. Enrichment code then runs unchanged.

```python
def to_llm_response_v2(parsed: ParsedSectionDiff) -> TailoringLLMResponseV2:
    """Convert ParsedSectionDiff to TailoringLLMResponseV2 for enrichment compatibility."""
    from app.services.tailoring.models import (
        TailoringLLMResponseV2, TailoredCell, CompactBulletDiff,
        TailoredSkillsGroup, SkillTailoredCell, SkillValueCell,
    )

    summary = TailoredCell(value=parsed.summary, why=parsed.summary_why or "") if parsed.summary is not None else None

    experience: dict[str, CompactBulletDiff] = {}
    for idx, entry in parsed.experience.items():
        bullets = {
            str(b_idx): TailoredCell(value=b.value, why=b.why or "")
            for b_idx, b in entry.bullets.items()
        }
        experience[str(idx)] = CompactBulletDiff(
            position=TailoredCell(value=entry.position, why="") if entry.position is not None else None,
            tech_stacks=TailoredCell(value=entry.tech_stacks, why="") if entry.tech_stacks is not None else None,
            bullets=bullets,
        )

    projects: dict[str, CompactBulletDiff] = {}
    for idx, entry in parsed.projects.items():
        bullets = {
            str(b_idx): TailoredCell(value=b.value, why=b.why or "")
            for b_idx, b in entry.bullets.items()
        }
        projects[str(idx)] = CompactBulletDiff(
            name=TailoredCell(value=entry.position, why="") if entry.position is not None else None,
            tech_stacks=TailoredCell(value=entry.tech_stacks, why="") if entry.tech_stacks is not None else None,
            bullets=bullets,
        )

    skills = []
    for grp in parsed.skills:
        skills.append(TailoredSkillsGroup(
            label=SkillTailoredCell(value=grp.label, why=grp.why),
            values=[SkillValueCell(value=v) for v in grp.values],
        ))

    return TailoringLLMResponseV2(
        summary=summary,
        experience=experience,
        projects=projects,
        skills=skills if skills else None,
        bold_keywords=parsed.bold_keywords,
    )
```

This adapter means `enrich_change_manifest_with_tailored_cells()` and `supplement_change_manifest_with_unchanged_cell_rationales()` require **zero changes**.

---

## Files Changed Per Phase

### Phase 0 — Infrastructure (new code only, feature-flagged off)

| Action | File | What changes |
|--------|------|-------------|
| Create | `apps/backend/app/services/tailoring/section_format.py` | Full parser, `ParsedSectionDiff`, normalizers, adapter |
| Create | `apps/backend/tests/service/tailoring/test_section_format.py` | Full edge-case test suite (see §Test Coverage) |
| Modify | `apps/backend/app/config.py` | Add `USE_SECTION_HEADER_FORMAT: bool = False` |

No prompt files touched. No existing code paths changed. Flag is `False` everywhere. This phase can be merged to main independently.

---

### Phase 1 — JD Extract Native Format (independent of format migration)

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/backend/app/prompts/text/extract_jd_intel/user.txt` | Replace JSON schema template with section-header output format spec |
| Modify | `apps/backend/app/services/tailoring/analysis.py` | `extract_jd_intelligence()`: switch from `complete_json()` to `complete()`; store raw text |
| Modify | `apps/backend/app/services/tailoring/prompting.py` | Add `_jd_intel_section()` slicer; pass `$jd_intel` variable instead of `$extract_jd_intel_output` |
| Modify | `apps/backend/app/services/cover_letter.py` | Replace `extract_job_target_metadata()` logic with `parse_jd_metadata()` from section parser |
| Modify | `apps/backend/app/prompts/text/tailor_resume_full/user.txt` | Replace `$extract_jd_intel_output` + 9-line GUIDE with `$jd_intel` + 1-line note |
| Modify | `apps/backend/app/routers/prompt_catalog_builder.py` | Update `_probe_system_message()` probe call for new variable name |
| Modify | `apps/backend/tests/` | Update prompt lint tests for variable name; add tests for `parse_jd_metadata()` and `_jd_intel_section()` |

**Backward compat:** if stored `job_keywords` starts with `{`, the old JSON path still runs. Old tailoring jobs and cover letter requests degrade gracefully.

This phase can be shipped independently before Phase 2. Quality-test with 10 real runs and verify cover letter metadata extraction.

---

### Phase 2 — Output Format: Primary Tailoring (core migration)

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/backend/app/services/tailoring/contracts.py` | Add `to_section_template()` method to `TailoringResponseContract` |
| Modify | `apps/backend/app/services/tailoring/prompting.py` | When flag is on: call `to_section_template()` instead of `to_prompt_dict()`; populate `$output_template` variable |
| Modify | `apps/backend/app/prompts/text/tailor_resume_full/user.txt` | Replace `RESPONSE CONTRACT\n$response_contract\n\nOUTPUT SCHEMA\n$resume_diff_rules` with `OUTPUT TEMPLATE\n$output_template` |
| Modify | `apps/backend/app/prompts/text/output_file_schema_rules/resume_diff_output.txt` | Replace OUTPUT CONTRACT section with section-header spec (or bypass entirely — the template is now self-documenting) |
| Modify | `apps/backend/app/services/tailoring/llm_calls.py` | `run_primary_tailoring()`: when flag on, call `complete()` (plain text) instead of `complete_json()`; parse raw text with `parse_section_format()` |
| Modify | `apps/backend/app/services/tailoring/validation.py` | Add `validate_section_header(parsed: ParsedSectionDiff, contract) -> DiffValidationResult`; keep `validate_compact_diff()` unchanged |
| Modify | `apps/backend/app/services/tailoring/preservation.py` | Add `apply_section_header_diff(original, parsed: ParsedSectionDiff) -> dict`; keep `apply_compact_diff()` unchanged |
| Modify | `apps/backend/app/services/tailoring/orchestration.py` | Branch on flag: if on → `run_primary_tailoring()` → parse → `validate_section_header()` → `apply_section_header_diff()` → `to_llm_response_v2()` → existing enrichment |

**Nothing changes in:**
- `change_manifest.py` (enrichment runs on `TailoringLLMResponseV2` via adapter)
- `models.py` (both schemas coexist)
- `analysis.py`
- All frontend code
- All API schemas

---

### Phase 3 — Output Format: Rewrite Tailoring

Same as Phase 2 but for `run_rewrite_tailoring()` and the rewrite prompt.

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/backend/app/prompts/text/rewrite_resume/user.txt` | Same output template pattern |
| Modify | `apps/backend/app/services/tailoring/llm_calls.py` | Same flag branch in `run_rewrite_tailoring()` |

---

### Phase 4 — Streaming Integration

Section-header format makes streaming possible in a way JSON never could. Each line is a self-contained parseable unit. The frontend can show content progressively as sections complete, dropping perceived latency from ~77 seconds to under 2 seconds for first visible output.

#### How streaming works (context for implementation)

**Without streaming (current):**
LLM generates all tokens → sends complete response → backend parses → frontend shows result.
User sees nothing for the full 77-second wall time.

**With Server-Sent Events (SSE):**
LLM generates one token → backend pipes it immediately → frontend receives it → browser shows it.
SSE is a standard HTTP protocol where the server sends a stream of `data: ...` lines to the browser over a persistent connection. The browser's `EventSource` API handles reconnection automatically.

```
HTTP/1.1 200 OK
Content-Type: text/event-stream
Cache-Control: no-cache

data: {"event": "section_start", "section": "SUMMARY"}\n\n
data: {"event": "line", "section": "SUMMARY", "text": "Built data pipelines..."}\n\n
data: {"event": "section_complete", "section": "SUMMARY", "value": "Built data pipelines..."}\n\n
data: {"event": "section_start", "section": "EXPERIENCE_0"}\n\n
...
data: {"event": "done"}\n\n
```

The frontend doesn't need to wait for `section_complete` to show something — it can render text character by character as `line` events arrive, exactly like ChatGPT's typewriter effect.

#### Event schema

```typescript
type StreamEvent =
  | { event: "section_start"; section: string }
  | { event: "line"; section: string; field: string | null; text: string }
  | { event: "field_complete"; section: string; field: string; value: string | null; why?: string }
  | { event: "section_complete"; section: string }
  | { event: "done"; apply_result: TailoringResult }  // sent after backend applies the diff
  | { event: "error"; message: string };
```

`field_complete` fires when the parser confirms a full field (after its WHY line or when the next field starts). `done` carries the fully applied result including `ResumeChange[]` for the change manifest.

#### Backend: streaming LLM call

LiteLLM supports streaming via the same `completion()` interface with `stream=True`:

```python
# llm_calls.py — new function
async def run_primary_tailoring_stream(
    prompt_context: TailoringPromptContext,
    max_tokens: int = 9000,
) -> AsyncIterator[StreamEvent]:
    """Stream tailoring output line by line, emitting parse events as each field completes."""
    stream = await litellm.acompletion(
        model=...,
        messages=[...],
        max_tokens=max_tokens,
        stream=True,
    )

    line_buffer = ""
    parser_state = StreamingParser()  # stateful line-by-line parser

    async for chunk in stream:
        delta = chunk.choices[0].delta.content or ""
        line_buffer += delta

        while "\n" in line_buffer:
            line, line_buffer = line_buffer.split("\n", 1)
            events = parser_state.feed_line(line)
            for event in events:
                yield event

    # Flush remaining buffer
    if line_buffer.strip():
        for event in parser_state.feed_line(line_buffer):
            yield event

    yield parser_state.finalize()  # returns "done" event with ParsedSectionDiff
```

The `StreamingParser` is the same state machine as `parse_section_format()` but incremental — it yields events instead of building a full `ParsedSectionDiff`. The `finalize()` call triggers `apply_section_header_diff()` and `build_change_manifest()` on the backend, then returns the result in the `done` event.

#### Backend: SSE endpoint

```python
# routers/tailoring.py — new route
from fastapi.responses import StreamingResponse

@router.get("/tailor/{job_id}/stream")
async def stream_tailoring(job_id: str, ...) -> StreamingResponse:
    async def event_generator():
        async for event in run_primary_tailoring_stream(prompt_context, max_tokens):
            yield f"data: {json.dumps(event)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
```

`X-Accel-Buffering: no` disables nginx proxy buffering, which would otherwise hold events until the buffer fills.

#### Frontend: SSE consumer hook

```typescript
// hooks/useTailoringStream.ts
export function useTailoringStream(jobId: string | null) {
  const [sections, setSections] = useState<Record<string, SectionState>>({});
  const [done, setDone] = useState<TailoringResult | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const es = new EventSource(`/api/tailor/${jobId}/stream`);

    es.onmessage = (e) => {
      const event: StreamEvent = JSON.parse(e.data);

      if (event.event === "field_complete") {
        setSections(prev => ({
          ...prev,
          [event.section]: {
            ...prev[event.section],
            [event.field]: event.value,
          }
        }));
      }
      if (event.event === "done") {
        setDone(event.apply_result);
        es.close();
      }
      if (event.event === "error") {
        es.close();
      }
    };

    return () => es.close();
  }, [jobId]);

  return { sections, done };
}
```

#### What the user sees

| Time | What appears |
|------|-------------|
| ~0.5 sec | Summary sentence renders (first section) |
| ~2–4 sec | First experience entry bullets fill in one by one |
| ~6–10 sec | All changed sections visible |
| ~10–14 sec | `done` event fires; change manifest panel populates |

With thinking disabled and sparse diff, the user is reading real resume content within 1–2 seconds of clicking Generate — the same feel as ChatGPT. The change manifest appears at the end when the backend has finished applying and diffing.

#### Files changed in Phase 4

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/backend/app/services/tailoring/section_format.py` | Add `StreamingParser` class with `feed_line()` and `finalize()` |
| Modify | `apps/backend/app/services/tailoring/llm_calls.py` | Add `run_primary_tailoring_stream()` |
| Modify | `apps/backend/app/routers/tailoring.py` | Add `GET /tailor/{job_id}/stream` SSE endpoint |
| Create | `apps/frontend/hooks/useTailoringStream.ts` | SSE consumer hook |
| Modify | `apps/frontend/components/tailor/resume-preview.tsx` | Accept streaming sections; render progressively |
| Modify | `apps/frontend/components/tailor/diff-preview-modal.tsx` | Show skeleton until `done` event fires |

---

### Phase 5 — Cover Letter Format Standardization

| Action | File | What changes |
|--------|------|-------------|
| Modify | `apps/backend/app/prompts/text/cover_letter/user.txt` | Change output instruction to `=== COVER LETTER ===` / `=== OUTREACH MESSAGE ===` |
| Modify | `apps/backend/app/services/cover_letter.py` | Update `parse_combined_message_response()` to use `=== ===` pattern with `<<>>` as fallback |
| Modify | `apps/backend/tests/service/test_cover_letter.py` | Update mock response to new format |

---

## `apply_section_header_diff()` — Implementation Sketch

This function mirrors `apply_compact_diff()` in behavior, taking `ParsedSectionDiff` instead of `dict`.

```python
def apply_section_header_diff(
    original_resume_data: dict[str, Any],
    parsed: ParsedSectionDiff,
) -> dict[str, Any]:
    """Apply a ParsedSectionDiff to original resume data.

    Returns the same dict shape as apply_compact_diff() — TailoringResumePayload-compatible.
    """
    import copy
    result = copy.deepcopy(original_resume_data)

    # Summary
    if parsed.summary is not None:
        text = parsed.summary
        if text and not contains_basic_resume_term(text):
            result["summary"] = normalize_metric_units(text)

    # Experience
    exp_list = result.get("workExperience", [])
    for idx, entry_diff in parsed.experience.items():
        if idx >= len(exp_list):
            logger.warning("section_header: experience index %d out of range", idx)
            continue
        entry = exp_list[idx]

        if entry_diff.position is not None:
            entry["position"] = entry_diff.position
            entry["title"] = entry_diff.position

        if entry_diff.tech_stacks is not None:
            entry["techStack"] = _strip_basic_terms_from_stack_line(entry_diff.tech_stacks)

        desc = entry.get("description") or entry.get("highlights") or []
        for b_idx, bullet in entry_diff.bullets.items():
            if bullet.value is None:
                continue  # retain
            if b_idx >= len(desc):
                logger.warning("section_header: bullet index %d out of range in exp %d", b_idx, idx)
                continue
            desc[b_idx] = normalize_metric_units(bullet.value)

    # Projects — same pattern, `name` instead of `position`
    proj_list = result.get("personalProjects", [])
    for idx, entry_diff in parsed.projects.items():
        if idx >= len(proj_list):
            logger.warning("section_header: project index %d out of range", idx)
            continue
        entry = proj_list[idx]

        if entry_diff.position is not None:  # stored as `position` in ParsedExperienceEntry
            if not contains_basic_resume_term(entry_diff.position):
                entry["name"] = normalize_metric_units(entry_diff.position)

        if entry_diff.tech_stacks is not None:
            entry["techStack"] = _strip_basic_terms_from_stack_line(entry_diff.tech_stacks)

        desc = entry.get("description") or entry.get("highlights") or []
        for b_idx, bullet in entry_diff.bullets.items():
            if bullet.value is None:
                continue
            if b_idx >= len(desc):
                logger.warning("section_header: bullet index %d out of range in proj %d", b_idx, idx)
                continue
            desc[b_idx] = normalize_metric_units(bullet.value)

    # Skills — delegate to existing helper
    if parsed.skills:
        skills_groups_as_dict = [
            {"label": g.label, "values": g.values}
            for g in parsed.skills
        ]
        result["skills"] = _apply_parsed_skills_groups(
            original_skills=original_resume_data.get("skills"),
            parsed_groups=skills_groups_as_dict,
        )

    # Bold keywords
    if parsed.bold_keywords:
        result["bold_keywords"] = parsed.bold_keywords

    return result
```

---

## `validate_section_header()` — What It Checks

The validation contract is simpler than `validate_compact_diff()` because the template already enforces structure:

```python
def validate_section_header(
    parsed: ParsedSectionDiff,
    contract: TailoringResponseContract,
) -> DiffValidationResult:
    errors: list[str] = []
    warnings: list[str] = []

    # 1. Summary always required
    if parsed.summary is None and not parsed.summary_why:
        warnings.append("summary not emitted — will retain original")

    # 2. Experience indices must be within contract range
    for idx in parsed.experience:
        if idx >= len(contract.experience_entries):
            errors.append(f"experience[{idx}] out of range (contract has {len(contract.experience_entries)})")

    # 3. Bullet indices within each entry
    for idx, entry in parsed.experience.items():
        if idx >= len(contract.experience_bullet_counts):
            continue
        max_b = contract.experience_bullet_counts[idx]
        for b_idx in entry.bullets:
            if b_idx >= max_b:
                errors.append(f"experience[{idx}].bullets[{b_idx}] out of range (contract has {max_b})")

    # 4. JD bullet budget
    for idx, entry in parsed.experience.items():
        if idx >= len(contract.direct_jd_bullet_budget):
            continue
        budget = contract.direct_jd_bullet_budget[idx]
        changed_count = sum(1 for b in entry.bullets.values() if b.value is not None)
        if changed_count > budget:
            warnings.append(
                f"experience[{idx}]: {changed_count} bullets rewritten, budget is {budget}"
            )

    # 5. Skills value counts
    for i, grp in enumerate(parsed.skills):
        if i >= len(contract.skill_group_value_counts):
            errors.append(f"skills group {i} out of range in contract")
            continue
        expected = contract.skill_group_value_counts[i]
        if len(grp.values) != expected:
            warnings.append(
                f"skills[{i}]: got {len(grp.values)} values, expected {expected}"
            )

    # 6. Bold keywords count
    if parsed.bold_keywords and not (6 <= len(parsed.bold_keywords) <= 10):
        warnings.append(f"bold_keywords has {len(parsed.bold_keywords)} terms (expected 6–10)")

    # 7. Forward parse errors
    errors.extend(parsed.parse_errors)
    warnings.extend(parsed.parse_warnings)

    return DiffValidationResult(valid=len(errors) == 0, errors=errors, warnings=warnings)
```

---

## Test Coverage Required (Phase 0)

Every parser edge case in the catalog above should have a test. The test file structure:

```python
# tests/service/tailoring/test_section_format.py

class TestHeaderParsing:
    def test_canonical_header()
    def test_lowercase_header()
    def test_missing_closing_marks()
    def test_header_with_company_annotation()
    def test_unknown_header_skipped()
    def test_out_of_order_sections()
    def test_duplicate_section_last_wins()

class TestFieldParsing:
    def test_canonical_bullet_label()
    def test_bullet_label_with_space()
    def test_bullet_label_spelled_out()  # BULLET 0
    def test_stack_aliases()  # TECH STACK, TECHSTACK, KEYWORDS
    def test_position_aliases()  # TITLE, ROLE
    def test_why_immediately_after_bullet()
    def test_why_on_same_line_as_value()
    def test_multiline_bullet_continuation()

class TestRetainSignal:
    def test_hyphen_is_retain()
    def test_em_dash_is_retain()
    def test_word_null_is_retain()
    def test_word_retain_is_retain()
    def test_blank_value_is_retain_with_warning()

class TestSkillsParsing:
    def test_canonical_skill_group()
    def test_skill_label_retain()
    def test_fewer_values_than_contract_pads()
    def test_more_values_than_contract_truncates()
    def test_why_on_skill_group()

class TestBoldKeywords:
    def test_comma_separated_list()
    def test_model_writes_bullets_instead()  # parser extracts text from bullets
    def test_empty_bold_keywords()

class TestRobustness:
    def test_preamble_text_before_first_header()
    def test_budget_annotation_line_skipped()  # ⬦ Budget line
    def test_truncated_response_partial_apply()
    def test_empty_section_all_retain()
    def test_omitted_section_all_retain()
    def test_out_of_range_index_skipped()

class TestAdapter:
    def test_to_llm_response_v2_preserves_summary()
    def test_to_llm_response_v2_experience_bullets()
    def test_to_llm_response_v2_retain_cells_as_null()
    def test_to_llm_response_v2_skills()
```

---

## Prompt File: Updated OUTPUT SCHEMA Section

The new `resume_diff_output.txt` (or inlined in user.txt) — the OUTPUT CONTRACT section becomes:

```
--- OUTPUT CONTRACT ---

FORMAT: Section-header block. Fill in the OUTPUT TEMPLATE exactly as provided.

RETAIN SIGNAL: Write [RETAIN] on any field line to keep the original value unchanged. Do not copy original text.

SPARSE SECTIONS: You may omit an entire === EXPERIENCE N === or === PROJECT N === section
if you are making no changes to it. Omitting is equivalent to retaining all cells in that section.
SUMMARY and BOLD KEYWORDS must always be emitted.

FIELD RULES:
- B{i}: — one bullet per line, no line breaks within the bullet text.
- B{i}-WHY: — max 12 words, plain language. Rationale covers the editorial decision, not a summary of the bullet.
- POSITION: — append only a truthful scope/platform/domain qualifier after the base title. Do not rename.
- STACK: — comma-separated tool names only. No prose.
- G{n}: — format is "label | val1, val2, val3". Pipe separates label from values. Values must match contract count exactly.
- BOLD KEYWORDS: — comma-separated on one line, 6–10 terms, tools/languages/platforms only.

LOCKS: Never write a field for: company, location, start_date, end_date, date, years, github, website, id.
These are shown in section headers for context only. Do not echo or modify them.

WRITING POLICY, SIGNAL STRATEGY, BANNED PATTERNS: [existing sections remain unchanged]
```

---

## Token Comparison After All Phases Complete

| Metric | Current | After all phases |
|--------|---------|-----------------|
| JD section (input) | ~5,063 chars / ~1,266 tok | ~800 chars / ~200 tok |
| Response contract (input) | ~400 chars / ~100 tok | ~1,400 chars / ~350 tok* |
| Resume output (output, full run) | ~10,916 chars / ~2,573 tok | ~5,800 chars / ~1,450 tok |
| Resume output (output, sparse) | N/A (full envelope required) | ~2,300 chars / ~580 tok |
| Thinking tokens (gemini-2.5-pro) | ~4,476 | 0 (after model switch) |
| **Total estimated wall time** | **~100 sec** | **~8–14 sec** |

*Contract grows because the template has human-readable placeholder text per slot, but it replaces the separate OUTPUT SCHEMA / resume_diff_rules section which was also large.

---

## Migration Checklist (ship one phase at a time)

- [ ] Phase 0: Parser + tests — merged to main, flag off, no behavior change
- [ ] Phase 1: JD extract format — quality A/B on 10 runs before merge
- [ ] Phase 2: Primary tailoring output — A/B on 20 runs with flag on in staging
- [ ] Phase 2: Prompt lint tests updated for new variable names
- [ ] Phase 2: Remove `validate_compact_diff` strict-mode requirement (now in `validate_section_header`)
- [ ] Phase 3: Rewrite tailoring — same A/B requirement
- [ ] Phase 4: Streaming — after Phase 2/3 stable for 1 week
- [ ] Phase 5: Cover letter — any time, independent
- [ ] Post-migration: Remove `TailoringLLMResponseV2` and `apply_compact_diff` after flag is on for 30 days
