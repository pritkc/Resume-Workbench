# Phase 3.15.5 Claude Calibration Report

## What This Document Is

A direct read of the test run at `docs/plans/test_runs/0a7bf7b4-18c6-4559-a916-bd183957d962` against the current LLM prompt and runtime configuration. It extends the existing budget analysis in `phase-3.15-5-token-budget-calibration.md` with revised P0 architecture, precise cap recalculations, and additional output quality observations.

All token estimates use `ceil(characters / 4)` — the same fallback as `app/llm.py`.

---

## Test Run: Confirmed Measurements

| Operation | Prompt bytes | Prompt est. tokens | Response bytes | Response est. tokens | Current output cap | Cap used |
|---|---:|---:|---:|---:|---:|---:|
| `extract_jd_intel_output` | 8,475 | 2,119 | 3,916 | 979 | 4,096 | 24% |
| `resume_generate_full` | 23,444 | 5,861 | 11,235 | 2,809 | 15,000 | 19% |
| `cover_letter_outreach_generate` | 19,798 | 4,950 | 1,294 | 324 | 2,600 | 12% |

Note: the prompt bytes for `extract_jd_intel_output` are measured against the current production `user.txt` (which includes all fields). The stored `prompt.txt` in the test run is smaller because it captured an older schema version — see Data Issue section below.

---

## Cover Letter Input Prompt: Current Composition

Reading `CL/prompt.txt` directly:

| Block | Bytes | Est. tokens | Share |
|---|---:|---:|---:|
| System + user instructions | ~1,482 | 371 | ~7% |
| JOB TARGET (JSON) | 115 | 29 | <1% |
| JOB DESCRIPTION (raw, trimmed to 2,200 chars) | 2,233 | 559 | ~11% |
| CANDIDATE PROFILE (compact, top 2 entries) | 1,367 | 342 | ~7% |
| TAILORED RESUME (full normalized JSON) | 11,622 | 2,906 | ~59% |
| Cover/outreach rules | 2,955 | 739 | ~15% |
| **Total** | **~19,774** | **~4,944** | **100%** |

The TAILORED RESUME block occupies 59% of the prompt and carries significant redundancy:

| Redundant field | Issue |
|---|---|
| `title` per experience entry | Exact duplicate of `position` |
| `date` per entry | Formatted duplicate of `start_date` + `end_date` |
| `years` per entry | Same as `date` — a third representation of the same dates |
| `description` array per entry | First item is `tech_stacks` again; remaining items are the same bullets as `highlights` |
| `role` field in projects | Exact duplicate of `tech_stacks` |
| `personalInfo` contact fields | `email`, `phone`, `socialNetworks`, `profileLinks`, `customConnections`, `photoUrl`, `photo` — none of these appear in a cover letter body |
| `sectionMeta` array | UI display ordering metadata; no editorial value |

Additionally, CANDIDATE PROFILE and TAILORED RESUME are redundant with each other. Both exist in the same prompt — the profile is a compact subset of the resume.

---

## P0 — Cover Letter Input Restructure (Revised)

### What changes

**Remove CANDIDATE PROFILE entirely.** Since TAILORED RESUME is already in the prompt, CANDIDATE PROFILE is a strict subset of it. Sending both adds ~342 tokens and no new information.

**Replace raw JOB DESCRIPTION with a narrative slice of the JD extract.** The `job_keywords` dict (output of `extract_jd_intel_output`) is already passed to `generate_cover_letter_and_outreach` in `cover_letter.py`. Currently it is only used to extract `role`, `company`, and `location` for the JOB TARGET JSON. Instead, pass a sliced version of it as the job context block.

Slice fields for cover letter use (narrative, not ATS-targeting):

```json
{
  "role": { "title": "...", "scope": "..." },
  "company": { "name": "...", "company_context": "...", "team_context": "...", "domain_context": "...", "product_context": "..." },
  "responsibility_themes": ["...", "..."],
  "calibration": { "level_expectations": "..." }
}
```

Skip: `requirements`, `technical_requirements`, `resume_technical_keywords`, `keyword_must_match`, `transferable_themes`, `low_signal_terms`, `resume_bold_keyword_sources`, `resume_domain_keywords`, `location`, `scale_signals`. These are resume-tailoring fields, not cover letter narrative fields. If `job_keywords` is unavailable (cache miss), fall back to the raw JD trimmed to 1,500 chars.

**Strip TAILORED RESUME of all duplicate and non-editorial fields.** Keep all experience entries (full career breadth matters for cover letter) but clean each entry to only the fields the model needs:

Per experience entry — keep:
- `position`, `company`, `location`, `start_date`, `end_date`, `techStack`, `highlights`

Per experience entry — remove:
- `id`, `title` (dup of position), `date` (dup of start/end), `years` (dup of date), `description` (dup of highlights + tech_stacks)

Per project — keep:
- `name`, `techStack`, `highlights`

Per project — remove:
- `id`, `role` (dup of techStack), `date`, `years`, `github`, `website`, `description`

From `personalInfo` — keep:
- `name`, `location`, `title`/`headline` (used in CL salutation and voice)

From `personalInfo` — remove:
- `email`, `phone`, `socialNetworks`, `profileLinks`, `customConnections`, `photo`, `photoUrl`

Remove entirely:
- `sectionMeta` array
- `customSections` is already `{}` but can be omitted

### Estimated new prompt size

| Block | Current est. tokens | Revised est. tokens |
|---|---:|---:|
| System + user instructions | 371 | 371 |
| JOB TARGET | 29 | 29 |
| JD EXTRACT SLICE (role/company/themes/calibration) | — | ~200 |
| JOB DESCRIPTION (raw, removed) | 559 | 0 |
| CANDIDATE PROFILE (removed) | 342 | 0 |
| TAILORED RESUME (cleaned, all entries) | 2,906 | ~950 |
| Cover/outreach rules | 739 | 739 |
| **Total** | **~4,944** | **~2,289** |

Estimated reduction: ~2,655 tokens (~54%) while keeping the full experience breadth.

### Implementation

Files to change:
- `apps/backend/app/services/cover_letter.py` — `_build_message_prompt_inputs`: remove `resume_profile` from return value; add `jd_extract_slice` built from `job_keywords`; replace `_tailored_resume_json` with a new `_tailored_resume_evidence_json` that strips the redundant fields
- `apps/backend/app/services/message_profiles.py` — `CandidatePromptProfile` and `_build_message_prompt_inputs` no longer called for CL; class stays for future use
- `apps/backend/app/prompts/text/cover_letter/user.txt` — remove `CANDIDATE PROFILE` section; rename `JOB DESCRIPTION` → `JD INTELLIGENCE`; update variable placeholder to `$jd_extract_slice`
- `apps/backend/app/prompts/cover_letter.py` — update `build_messages` signature to drop `resume_profile`, add `jd_extract_slice`

---

## P0 — Cap Recalculations

### cover_letter_outreach_generate

Output is strictly bounded by prompt rules: 150-word cover letter + 60-word outreach message.

| Metric | Value |
|---|---|
| Word limit (prompt rule) | 210 words total |
| Token estimate at 1.33 tokens/word | ~279 tokens content |
| Wrapper tag overhead | ~20 tokens |
| Observed in test run | 324 tokens |
| Current initial cap | 2,600 |
| Current retry cap | 3,200 |

Proposed:
- **Initial cap: 800** (2.5× observed; 3.6× word-bound estimate)
- **Retry cap: 1,200** (3.7× observed; handles verbose providers)
- Timeout: **45 seconds** (text output, small cap — fits comfortably within the outer 240s wall clock)

Rationale: the 150-word and 60-word limits in the prompt are hard constraints. The model cannot produce more output without violating them. Even a verbose provider staying within those limits cannot exceed ~400 tokens. A cap of 800 gives 2× safety headroom above that worst case.

---

### resume_generate_full and rewrite_resume

Current cap of 15,000 is 5–7× the observed output. The RESPONSE CONTRACT already encodes the exact grid the model must emit, making the maximum possible output deterministic before the call.

**Cell count formula** (from contract):

```
exp_bullets  = sum(contract.experience.bullet_counts)
proj_bullets = sum(contract.projects.bullet_counts)
skill_values = sum(contract.skills.value_counts)
scalar_cells = (exp_entries × 2) + (proj_entries × 2) + skill_groups + 2  # position+stacks, name+stacks, labels, summary+bold
total_cells  = exp_bullets + proj_bullets + skill_values + scalar_cells
```

Each cell emits `value` + `why`. Empirical calibration from this test run:
- Total cells: 66 (13 exp bullets + 3 proj bullets + 29 skill values + 8 exp scalars + 6 proj scalars + 5 skill labels + 2)
- Observed minified tokens: 2,266
- Tokens per cell: 2,266 / 66 ≈ **34 tokens/cell**
- Pretty-print multiplier: 2,809 / 2,266 = **1.24×**

**Adaptive cap formula:**

```python
def compute_adaptive_max_tokens(contract: ResponseContract, mode: str) -> int:
    exp_bullets = sum(contract.experience.bullet_counts)
    proj_bullets = sum(contract.projects.bullet_counts)
    skill_values = sum(contract.skills.value_counts)
    scalar_cells = (
        len(contract.experience.bullet_counts) * 2
        + len(contract.projects.bullet_counts) * 2
        + len(contract.skills.value_counts)
        + 2  # summary + bold_keywords
    )
    total_cells = exp_bullets + proj_bullets + skill_values + scalar_cells
    estimated_minified = total_cells * 34
    estimated_pretty = int(estimated_minified * 1.25)   # model ignores minify instruction
    with_headroom = int(estimated_pretty * 1.40)        # 40% safety buffer
    floor = 6_000 if mode == "full" else 4_096
    ceiling = 8_000
    return max(floor, min(ceiling, with_headroom))
```

**Validation against this test run:**
- `total_cells = 66`; `estimated_pretty = 66 × 34 × 1.25 = 2,805`; `with_headroom = 3,927`; `max(6000, min(8000, 3927)) = 6,000`
- Observed: 2,809 tokens → 6,000 cap gives 2.14× headroom. Comfortable.

**Large resume scenario** (20 bullets, 6 entries, 5 projects, 40 skill values):
- `total_cells ≈ 20 + 5 + 40 + 12 + 10 + 10 + 2 = 99`; `estimated_pretty = 99 × 34 × 1.25 = 4,208`; `with_headroom = 5,891`; capped to `max(6000, min(8000, 5891)) = 6,000`

**Very large resume** (35 bullets, 7 entries, 6 projects, 50 skill values):
- `total_cells ≈ 35 + 6 + 50 + 14 + 12 + 12 + 2 = 131`; `estimated_pretty = 131 × 34 × 1.25 = 5,558`; `with_headroom = 7,781`; result `= max(6000, min(8000, 7781)) = 7,781`

For all realistic resumes: **cap stays within 6,000–8,000**. 15,000 is never needed.

Proposed:
- **resume_generate_full: adaptive, floor 6,000, ceiling 8,000** (down from fixed 15,000)
- **rewrite_resume: same adaptive formula, same floor/ceiling** (same contract shape)
- Store `computed_max_tokens`, `total_cell_count`, `exp_bullet_count`, `proj_bullet_count`, `skill_value_count` in trace metadata for calibration

---

### extract_jd_intel_output

One sample. Output schema has bounded structure (fixed keys, bounded list lengths). Even for a very dense JD with many listed tools, the output ceiling is structurally limited.

| Metric | Value |
|---|---|
| Observed | 979 tokens |
| Schema upper bound estimate | ~1,800–2,000 tokens (dense JD, many tools) |
| Current cap | 4,096 |

Proposed:
- **Reduce cap to 2,500** — gives ~1.25–1.4× headroom over estimated worst-case
- Conservative given single sample; revisit after 10+ traces
- If a response hits near-limit warning (≥85% of 2,500), bump to 3,000 on retry

---

### critique_resume

No response captured in this test run.

Proposed: **Keep at 4,096 until a real critique response is captured.**

---

### Summary of All Cap Changes

| Operation | Current cap | Proposed cap | Rationale |
|---|---:|---:|---|
| `extract_jd_intel_output` | 4,096 | 2,500 | Schema bounds suggest ~2,000 max; 1 sample is cautious |
| `resume_generate_full` | 15,000 | adaptive 6,000–8,000 | Contract grid makes output deterministic; 34 tok/cell empirical |
| `rewrite_resume` | 15,000 | adaptive 6,000–8,000 | Same output shape as full primary |
| `critique_resume` | 4,096 | keep 4,096 | No sample yet |
| `cover_letter_outreach_generate` initial | 2,600 | 800 | 150+60 word prompt constraint; 2.5× observed |
| `cover_letter_outreach_generate` retry | 3,200 | 1,200 | 3.7× observed; handles verbose providers |

---

## P1 — LLM Timeout Alignment

The inner timeout for `resume_generate_full` at `max_tokens=15,000` is ~659 seconds. The outer preview wall clock is 240 seconds. The inner timeout is unreachable — the route aborts first. This applies to `rewrite_resume` as well.

After the cap reduction to 8,000, the formula-based timeout drops but is still likely too loose without per-call overrides.

Proposed per-operation timeout overrides (all fit inside 240s outer wall clock):

| Operation | Proposed inner timeout | Rationale |
|---|---:|---|
| `extract_jd_intel_output` | 90s | Fast JSON; bounded schema output |
| `resume_generate_full` | 170s | Largest JSON; leaves 70s for post-processing and PDF |
| `critique_resume` | 90s | Medium JSON; no sample yet |
| `rewrite_resume` | 170s | Same shape as full primary |
| `cover_letter_outreach_generate` | 45s | Text output; 800-token cap; no JSON parsing |

Files: `apps/backend/app/llm.py` (add optional `timeout_seconds` override to `complete()` and `complete_json()`), `apps/backend/app/services/tailoring/llm_calls.py` (pass per-operation values).

---

## P1 — Bold Keyword Quality: Methodology Labels Leaking

The `resume_generate_full` response for this test run produced:

```
"Software Testing", "Test Case Design", "Data Validation", "Defect Tracking",
"SDLC", "Python", "SQL", "JIRA", "Relational Databases", "AWS"
```

Three of ten violate the schema rule "prefer tools, languages, platforms, frameworks, data methods; avoid generic domain labels and umbrella terms":

| Keyword | Issue |
|---|---|
| `Software Testing` | Generic domain label — exactly the kind the schema rules prohibit |
| `Relational Databases` | Umbrella infrastructure category — not a specific product or technology |
| `SDLC` | Methodology/process label — not a tool, language, or platform |

Root cause: the JD for this QA role names no specific tools or platforms. The model defaulted to methodology labels when it ran out of high-signal technical terms. The existing examples in `resume_diff_output.txt` cover output types like "Process Optimization" but not the methodology-label failure mode.

Proposed addition to `output_file_schema_rules/resume_diff_output.txt`, after the existing exclusion examples:

> Also exclude: methodology and process labels (SDLC, Agile, Scrum, CI/CD pipeline, test automation), generic infrastructure categories (Relational Databases, Cloud Storage, Distributed Systems, Message Queue), and competency phrases (Test Case Design, Project Management, Stakeholder Communication, Defect Tracking). When the JD names no high-signal technical tools, draw bold_keywords only from tools, languages, and platforms that appear in the resume evidence.

---

## P2 — JSON Formatting Telemetry Before Prompt Changes

Both JSON responses came back pretty-printed inside triple-backtick fences despite the prompt requesting minified, fence-free JSON.

| Operation | Captured bytes | Minified bytes | Wasted tokens |
|---|---:|---:|---:|
| `extract_jd_intel_output` | 3,916 | ~3,328 | ~147 |
| `resume_generate_full` | 11,235 | ~9,061 | ~544 |

At 25 tailoring runs/day: ~13,600 avoidable output tokens/day (~400K/month).

Before changing the prompt, add telemetry to every JSON call in `app/llm.py`:
- `response_had_fence: bool`
- `raw_response_chars: int`
- `minified_chars: int` (when parse succeeds)
- `formatting_overhead_chars: int`

Decide on a prompt wording change only after seeing fence frequency across models and prompt variants.

---

## Data Issue — Test Run File Mismatch (Confirmed, Clarified)

The calibration doc already notes that `extract_jd_intel_output/prompt.txt` contains a Neighbor Data Engineer JD while `respose.txt` contains a Starbucks QA extraction. Reading the files directly confirms this and adds a second layer:

**The stored `prompt.txt` uses an older schema.** The shape template in the file is missing four fields that are present in the current production `apps/backend/app/prompts/text/extract_jd_intel/user.txt`:
- `keyword_must_match`
- `transferable_themes`
- `low_signal_terms`
- `resume_bold_keyword_sources`

The `respose.txt` contains all four fields populated — confirming it was generated by the current (newer) prompt, not the one stored in the file.

The calibration doc's input size estimate for `extract_jd_intel_output` (8,475 bytes) was measured from the current production `user.txt`, not from the test run `prompt.txt` (which is 7,409 bytes). The output size estimate (979 tokens) is from the actual response and is accurate.

**Net effect on calibration:** the output-side estimates are reliable. The input-side estimate for `extract_jd_intel_output` reflects the current production prompt correctly (8,475 bytes / 2,119 tokens).

**Action:** when capturing future test runs, save the live prompt string from the same HTTP request that generated the response — not the template file from disk.

---

## What Stays Unchanged

- `critique_resume` cap stays at 4,096 until a real critique response is captured.
- The shared `output_file_schema_rules` block is not removed or split. It is large (~9,747 bytes / 2,437 tokens), but encoding it once in shared rules is safer than duplicating a partial version.
- The 240-second outer preview timeout stays until we have post-cap latency traces.
- `application_questions_generate` cap stays at 4,096 — not in this test run.

---

## Acceptance Criteria

1. Cover/outreach prompt no longer includes CANDIDATE PROFILE or the full normalized resume JSON.
2. Cover/outreach prompt metadata shows input near or below 2,400 estimated tokens.
3. Cover/outreach output still parses correctly with wrapper tags; both fields save.
4. `resume_generate_full` and `rewrite_resume` record `computed_max_tokens` and cell counts in trace metadata.
5. `resume_generate_full` succeeds for this captured contract shape with an 8,000-token cap.
6. `cover_letter_outreach_generate` succeeds with an 800-token initial cap for this captured output.
7. Existing JSON fence-tolerant parsing is untouched.
8. Docs updated after implementation.

---

## Open Questions

1. Should the JD extract slice for cover/outreach fall back to raw JD (trimmed) when `job_keywords` is a cache miss, or should we always compute the extract inline?
2. Should `extract_jd_intel_output` be reduced to 2,500 now (one sample) or wait for 10+ traces?
3. Should bold keyword violations trigger a logged warning in trace metadata so we can measure frequency before deciding on a prompt fix?
4. Should `computed_max_tokens` and cost per operation appear in the `/llm-traces` UI for self-service calibration?
