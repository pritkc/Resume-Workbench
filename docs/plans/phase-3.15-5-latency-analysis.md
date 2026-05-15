# Latency Analysis: Resume Generation Pipeline

> Revised with full breakdown — based on two real traced runs from 2026-05-14.
> Scope: `resume_generate_full` only. Cover letter excluded (separate optional call).

---

## Response Breakdown (Actual From Traced Run)

```
Total response: 10,916 chars / 2,573 output tokens

"why" field text (36 occurrences):
  → 5,531 chars  (50.7%)

Actual changes (value fields, positions, tech_stacks):
  → ~3,000 chars (~28%)

Structural JSON overhead (keys, braces, indices):
  → ~2,385 chars (~21%)
```

**Half the response is rationale text.** The actual resume data changes are maybe 1,000–1,500 chars of the output.

---

## All Weak Points, Ranked By Impact

### 1. Extended thinking is ON for both models — biggest single cause

gemini-2.5-pro and gemini-2.5-flash both run extended thinking by default. The thinking phase runs before the first output token. For the resume step: **4,476 thinking tokens ≈ 30–35 seconds of pre-generation overhead** before the model writes anything.

This is why even gemini-2.5-flash generated 285 cover letter tokens in 27.5 seconds — it thought for ~678 tokens first.

**Fix options:**
- Pass `thinkingConfig: {thinkingBudget: 0}` via the Gemini native API (not available through OpenAI-compatible endpoint)
- Or switch to a model without extended thinking (see model section)

---

### 2. "Why" fields inflate output by 51%

Every bullet, every retained cell, every tech_stack entry outputs a rationale string. These serve the UI change display and the (disabled) critique pipeline. But they double the token count.

**Current:** 2,573 output tokens with why fields  
**Without why fields:** ~1,200 output tokens  
**Potential speedup:** ~40–50% reduction in generation time

**Fix options:**
- **Option A — Strip why entirely:** Fastest, but loses the change rationale display in the UI
- **Option B — Why only on changed cells:** Null-value (retained) cells skip the why. Saves ~30%
- **Option C — Separate why call:** Generate the diff first (no why), then a lightweight call just for rationale on changed cells (parallelizable with rendering)

---

### 3. Full-envelope output (even retained cells must appear)

Currently every cell must appear in the output, even those with `"value": null` (no change). This means we get 36 cells in the output regardless of how many actually changed. For a resume where only 10–15 cells change, we output 20+ unnecessary retained cells.

**Fix: sparse diff** — output only changed cells. The apply logic already handles missing keys (assumes retain). This is the single highest-impact code change.

**Example:** If 12 of 36 cells actually change, output drops from 2,573 → ~800–1,000 tokens. At any model, that is 60% less generation time.

---

### 4. Resume JSON input is 4× larger than it needs to be

We send the full resume JSON including every immutable field (ids, dates, companies, locations, github links). The model cannot change these — but it still has to read and process them.

**Fix: strip immutable fields from resume input payload** before serializing to the prompt. Keep only fields the model can edit: position, tech_stacks, description bullets, skill group labels and values, summary, project names.

The response contract already lists immutable fields. We can apply the inverse mask to the resume before building the prompt.

**Estimate:** Resume input drops from 16,437 → ~9,000–11,000 chars (~30–35% reduction in resume section tokens).

---

### 5. JD extract JSON is large (21% of prompt)

The full JD extract goes into the prompt — all keys including calibration, keyword sources, transferable themes. The slice we built for the cover letter (4 keys only: role, company, responsibility_themes, calibration) is 1,116 chars vs the full extract at 5,063 chars.

If we apply the same slice to the resume prompt:
- JD section drops from 5,063 → ~1,200 chars
- Saves ~950 input tokens (~18% of total input)

The trade-off: less context for keyword matching. The model currently uses resume_bold_keyword_sources, low_signal_terms, and keyword_must_match from the full extract. A narrower slice loses those signals — quality risk, needs testing.

---

### 6. No streaming — all latency is perceived

At any latency, users see nothing until the complete response is ready. With streaming, the first characters appear in 1–2 seconds and the resume fills in progressively. This does not reduce actual latency but drops perceived latency by 80%.

This is what makes ChatGPT feel instant even when it takes 15 seconds — you're reading the output as it streams.

---

### 7. Retries can double worst-case latency

`resume_generate_full` has `retries=1` — meaning up to 2 attempts. If the first attempt truncates or produces malformed JSON, we re-run the full 77-second call. In the best case (no retry) this is invisible. In the worst case, it is 154 seconds.

Reducing max_tokens (already done with adaptive cap) reduces retry probability since truncation is less likely at tighter caps.

---

## Model Recommendations

### For resume_generate_full specifically

The task requires: structured JSON, strict format compliance, editorial quality for resume bullets, following a response contract. These are strong instruction-following requirements that favor larger models.

| Model | Est. time (current output) | Est. time (sparse diff) | Thinking | Quality for our task | Cost |
|-------|---------------------------|------------------------|----------|---------------------|------|
| **gemini-2.5-pro** (current) | 77 sec | 30 sec | ON | Excellent | High |
| **gemini-2.5-flash** | 35–40 sec | 15–18 sec | ON by default | Very good | Low |
| **gemini-2.5-flash, thinking=0** | 18–22 sec | 7–10 sec | OFF | Good | Low |
| **gemini-1.5-pro** | 45–55 sec | 18–24 sec | OFF | Very good | Medium |
| **gemini-1.5-flash** | 18–22 sec | 7–10 sec | OFF | Good | Very low |
| **claude-haiku-4-5** | 22–28 sec | 9–12 sec | OFF | Good–Very good | Very low |
| **claude-3-5-sonnet** | 32–40 sec | 13–17 sec | OFF | Excellent | Medium |
| **gpt-4o** | 28–35 sec | 11–14 sec | OFF | Excellent | Medium |
| **gpt-4o-mini** | 22–28 sec | 9–12 sec | OFF | Good | Very low |

> Estimated times assume 2,573 output tokens (current) and ~1,000 output tokens (sparse diff). Based on typical tok/sec rates for each model.

### Recommended combinations

**Best quality + reasonable speed (no code changes, just config):**
```
extract_jd_intel:   gemini-1.5-flash   (simple extraction, no thinking)
tailor_resume_full: gemini-2.5-flash   (better quality than 1.5, but still has thinking)
```
Estimated: extract 4–6 sec + generate 35–40 sec = 40–46 sec total. Not ideal, but no code change.

**Best speed/quality balance (config change + sparse diff):**
```
extract_jd_intel:   gemini-1.5-flash or gpt-4o-mini
tailor_resume_full: claude-haiku-4-5 or gpt-4o-mini
```
With sparse diff: extract 4 sec + generate 10–12 sec = 14–16 sec total. Under 15 seconds.

**Best quality + speed (when Gemini direct API is available):**
```
extract_jd_intel:   gemini-2.5-flash, thinking_budget=0
tailor_resume_full: gemini-2.5-flash, thinking_budget=0
```
Disabling thinking on 2.5-flash keeps the model's quality while removing the 30-second overhead. Estimated: extract 3–5 sec + generate 18–22 sec = 21–27 sec. With sparse diff: ~10–14 sec.

**Budget pick:**
```
All steps: gpt-4o-mini
```
Very cheap, decent quality, no thinking. With sparse diff: ~10–12 sec. Quality acceptable for most use cases, may need prompt tuning for format compliance.

### Models to avoid

- **gemini-2.5-pro** with thinking ON — excellent quality but too slow for interactive use
- **claude-3-opus** — slow and expensive
- **Any model through cliproxyapi "mixed" mode** — routing uncertainty adds unpredictable latency; fix the provider filter to a specific model

---

## Realistic Timeline After Each Fix

| Change | Effort | Time saved | New total |
|--------|--------|-----------|-----------|
| Today (baseline) | — | — | ~100 sec |
| Switch to gemini-1.5-flash (config only) | 5 min | ~55 sec | ~45 sec |
| Sparse diff (output only changed cells) | 2–3 days | ~30 sec from generation | ~15–20 sec |
| Strip immutable fields from resume input | 1 day | ~8 sec from extract/context | ~12–15 sec |
| Streaming | 1 week | 0 sec actual / ~90% perceived | ~12–15 sec actual / ~2 sec perceived |
| Disable thinking (gemini native API) | 2 days | ~30 sec from thinking overhead | ~15 sec |
| All above combined | 2 weeks | ~85 sec | **~10–12 sec / ~2 sec perceived** |

---

## Highest-Impact Changes Summary

**If you want one config change right now:** switch `tailor_resume_full` to `gemini-1.5-flash` or `gemini-1.5-pro`. No code changes. Goes from 77 sec to ~20–45 sec depending on the model.

**If you want to break under 20 seconds:** implement sparse diff. This is the most impactful code change — it cuts the output token count by 50–60% regardless of what model you use.

**If you want to break under 10 seconds:** sparse diff + gemini-1.5-flash (or gpt-4o-mini / claude-haiku-4-5). These are complementary — model removes thinking overhead, sparse diff removes output bloat.

**If you want it to feel instant:** add streaming on top of any of the above.

---

## Implementation Notes

### Sparse diff change
- Output contract: change `FULL ENVELOPE` rule in `resume_diff_output.txt` to say "output only cells with `value` changes; omit unchanged cells"
- Backend: `apply_compact_diff` already returns original values for missing keys — no change needed there
- Validation: `validate_compact_diff` needs to handle sparse responses (currently expects all cells)
- Observability: change manifest still works (compares original vs final, not LLM output)
- "Why" fields: can keep on changed cells, drop on retained cells

### Disable thinking on Gemini
- Requires switching from OpenAI-compatible endpoint to native Gemini client, OR confirming cliproxyapi passes through `thinkingConfig` in extra_body
- LiteLLM supports `extra_body={"thinkingConfig": {"thinkingBudget": 0}}` for Gemini — needs testing with current proxy setup

### Strip immutable fields from resume input
- In `prompting.py` or wherever the resume JSON is serialized for the prompt, apply a mask removing: `id`, `date`, `years`, `github`, `website`, `location`, `start_date`, `end_date`, `company` (the full immutable field list from the response contract)
- The model knows not to change these fields — no need to send them as input

---

## Implementation Brief (Revised)

> Revised based on follow-up analysis. Exact changes only.

---

### Q0: Output tokens vs input tokens — which actually costs time?

**Short answer: output tokens dominate by ~15×. Instructions are noise.**

Here is why, with real numbers from the traced run:

**Output token generation** is sequential — the model generates one token at a time, in order. At ~35–50 tokens/sec for gemini-2.5-pro, generating 1,300 "why" tokens costs roughly **26–37 seconds of real time**. Every output token you eliminate removes wall time 1:1.

**Input token processing** (called prefill) is parallel — the GPU processes all input tokens simultaneously before generating anything. Reducing 1,300 input tokens (e.g. stripping immutable resume fields) saves roughly **0.5–1.5 seconds** of prefill, not 30 seconds.

| What you eliminate | Tokens saved | Time saved |
|-------------------|-------------|-----------|
| "Why" fields (all 36) | ~1,300 output | ~30–35 sec |
| Resume immutable fields (ids, URLs) | ~400 input | ~0.5 sec |
| Unused JD extract fields | ~275 input | ~0.3 sec |
| Instruction text (system + user guide) | ~100 input | ~0.1 sec |

**Conclusion on instructions (#0-A):** Flattening `system.txt` (300 tokens) or the JD INTELLIGENCE GUIDE (112 tokens) saves fractions of a second. Not worth quality risk. The bottleneck is output, not instructions.

The only way to win on the output side — while keeping "why" — is to make the output itself more compact. See item 2 below.

---

### 1. Disable extended thinking — the single biggest fix

**What thinking is:** gemini-2.5-pro and gemini-2.5-flash run an internal reasoning chain before writing the first output character. These "thinking tokens" are not shown in the response but burn real compute. The traced run showed 4,476 thinking tokens before the model wrote anything — roughly **30–35 seconds of silence** before generation started.

**For direct API (no cliproxy) — add one config block in `llm.py`:**

LiteLLM supports passing arbitrary parameters to Gemini via `extra_body`. In the `_build_kwargs()` / completion call in `llm.py`, add:

```python
# For gemini-2.5 models only: disable thinking overhead
if provider == "google" and "2.5" in model_name:
    kwargs["extra_body"] = {"thinkingConfig": {"thinkingBudget": 0}}
```

Requires `GEMINI_API_KEY` in `.env` and `provider="google"` (not `"openai"`) in the step's model config. Change step models to `google/gemini-2.5-flash` in `config.json`.

**For cliproxy path — why it can't pass thinking config:**

When `ai_route="cliproxyapi"`, `config.py` forces `provider="openai"` and LiteLLM hits `http://127.0.0.1:8317/v1` as an OpenAI-compatible endpoint. cliproxy forwards requests in OpenAI format to the actual provider. `thinkingConfig` is a Gemini-native REST parameter that has no equivalent in the OpenAI API spec — cliproxy drops it silently. There is no way to pass it through without modifying cliproxy itself.

**Two real options for cliproxy users:**

**Option A (zero code, 5 minutes):** Switch to a non-thinking model in cliproxy. Any alias resolving to `gemini-1.5-flash`, `gpt-4o-mini`, `claude-haiku-4-5`, or `deepseek-chat` has no extended thinking. Set in `config.json`:
```json
"step_model_overrides": {
  "extract_jd_intel": "<cliproxy-alias-for-gpt-4o-mini>",
  "tailor_resume_full": "<cliproxy-alias-for-haiku-or-deepseek>"
}
```
Result: ~20–30 sec total (vs 100 sec today). No code change at all.

**Option B (1 day, proper fix):** Bypass cliproxy for the two heavy steps. Add `GEMINI_API_KEY`, set those steps to `google/gemini-2.5-flash`, apply `thinkingBudget=0` in llm.py. Keep cliproxy for everything else. Use cliproxy for fallback only.

**Model recommendations (ranked by speed/quality):**

| Model | Thinking | Est. time (current format) | Quality for our task |
|-------|----------|--------------------------|---------------------|
| gemini-2.5-flash, thinking=0 | OFF | ~18–22 sec | Very good |
| DeepSeek-V3 (`deepseek-chat`) | OFF | ~18–24 sec | Very good, strong JSON |
| claude-haiku-4-5 | OFF | ~22–28 sec | Good–Very good |
| gpt-4o-mini | OFF | ~22–28 sec | Good |
| gemini-1.5-flash | OFF | ~18–22 sec | Good |
| gemini-2.5-pro (current) | ON | ~77 sec | Excellent (overkill) |

**DeepSeek-V3** (`deepseek-chat`) — no thinking, excellent structured JSON output, ~$0.27/M input + $1.10/M output. Already in `SUPPORTED_PROVIDERS`. Add `DEEPSEEK_API_KEY` to `.env`. Do not use DeepSeek-R1 — that model uses extended thinking, same problem as gemini-2.5-pro.

---

### 2. Compact output format — keep all "why" fields, reduce their token cost

We keep why on all cells (changed and retained) for QA. The question is: how do we make the output smaller without losing the why content?

**Why JSON is expensive:** Every cell in the current format looks like:
```json
{"value": "Built pipeline reducing P99 by 40%.", "why": "Strongest story; leads the role — retained"}
```
That's 12 chars for `"value":` + 7 chars for `"why":` = 19 chars of key overhead per cell, plus all the `{}` braces. Multiply by 36 cells = ~684 chars of pure syntax, ~171 tokens of overhead.

**Three compact options:**

**Option A — Shorter key names** (`v` / `w` instead of `value` / `why`):
```json
{"v": "Built pipeline reducing P99 by 40%.", "w": "Strongest story; retained"}
```
Saves ~8 chars per cell × 36 cells = ~288 chars / ~72 tokens. Parse by renaming in `apply_compact_diff`. Easy to implement, reversible. Minimal win.

**Option B — Constrain why length in the prompt:**
Add to `resume_diff_output.txt` TAILORED CELL rule: `"why": max 12 words, no full sentences, no repetition of the cell text.`
Current average why is ~20–25 words (~120 chars). At 12 words max (~65 chars): saves ~55 chars per cell × 36 cells = ~1,980 chars / ~495 tokens. This is **the most impactful change that requires zero format code change**. Apply logic unchanged. Just adds a word-count constraint to the prompt.

**Option C — Pipe-delimited inline strings** (parse in-house):
Instead of a two-key object, emit a single string with separator:
```json
"bullets": {
  "0": "Built pipeline reducing P99 by 40%. ||| Strongest story; retained"
}
```
Backend splits on `|||`: left = value, right = why. Eliminates all cell-level JSON structure overhead (~24 chars per cell × 36 cells = ~864 chars / ~216 tokens). Requires changing the prompt contract, updating `apply_compact_diff` to split, and updating the frontend change-display code to read why from the split. Risk: if bullet text contains `|||` (unlikely but possible), need escaping.

**Recommended:** Option B first (add word limit to prompt, zero code change), then evaluate. If output is still large, layer Option C on top.

**Combined with sparse diff (emit only changed cells):** Even with why kept on all cells, sparse diff still eliminates the retained cells entirely. If 12 of 36 cells change, output drops by 67% regardless of why format. Sparse diff and why-compression are complementary — do both.

---

### 3. Resume JSON input — keep dates, strip true dead weight

Dates (`start_date`, `end_date`, `date`) stay in the input — the model uses them to calibrate recency language and temporal scope in rewrites. Stripping them would degrade output quality.

What to actually strip:

```python
_DROP_EXPERIENCE = {"id", "location"}
_DROP_PROJECT = {"id", "github", "website"}
_DROP_SKILL = {"id"}
```

This removes IDs (opaque strings the model ignores), URLs, and location strings. Company names stay — context for writing. Dates stay.

**Estimated savings:** ~300–400 input tokens, ~0.5 sec. Small but free — do it.

---

### 4. JD extract — flatten format, eliminate the guide duplication

**The duplication problem:** `user.txt` currently has:
1. The full JD extract JSON (5,063 chars) with descriptive key names like `responsibility_themes`
2. A 9-line JD INTELLIGENCE GUIDE that re-describes how to use each of those same keys

The guide is 450 chars of instruction that restates what the JSON keys already say.

**Bigger win — convert the JD extract from JSON to compact labelled text before injecting:**

Instead of injecting the raw JSON, reshape it in the backend before building the prompt:
```
HOOKS: reliability engineering, API architecture, data pipeline scaling
MUST-MATCH: Kafka, Python, Kubernetes
KEYWORDS: distributed systems, event streaming, gRPC
DOMAIN: fintech data infrastructure for mortgage origination
AVOID: Agile, SDLC, stakeholder management, process optimization
BOLD-CANDIDATES: Kafka, Kubernetes, Python, gRPC, Redis
LEVEL: Senior IC; owns team-level delivery end-to-end
```

This compact text (~600–800 chars) replaces the current JSON section (~3,100 chars after stripping unused keys) and the 9-line GUIDE section (450 chars). Drops the JD section from ~5,063 → ~800 chars — saves **~4,263 chars / ~1,066 input tokens** from the JD section alone.

Remove `location`, `requirements`, `technical_requirements` keys first (already unused, saves 1,097 chars), then reshape the remaining 8 keys to the flat text format above.

**File to change:** Wherever `extract_jd_intel_output` is serialized into the prompt (likely `orchestration.py`). Also remove the JD INTELLIGENCE GUIDE block from `tailor_resume_full/user.txt` (replace with one line: `Use HOOKS as primary competency anchors; MUST-MATCH for exact terms; AVOID for terms to demote; LEVEL as ceiling.`)

**Time saved:** Input tokens at prefill speeds — ~1–2 seconds. Not dramatic on its own, but it also reduces prompt size enough to push the resume JSON to a lower attention cost.

---

### 5. Cover letter — tighter resume input

The CL prompt needs narrative evidence, not a full resume dump. Current `_tailored_resume_evidence_json()` sends all bullets and tech_stacks (estimated 8,000 chars). A 150-word cover letter needs at most 2 bullets per role.

**Change in `apps/backend/app/services/cover_letter.py` → `_tailored_resume_evidence_json()`:**
```python
for exp in evidence.get("workExperience", []):
    exp.pop("tech_stacks", None)
    bullets = exp.get("highlights", exp.get("description", []))
    if len(bullets) > 2:
        exp["highlights"] = bullets[:2]
for proj in evidence.get("personalProjects", []):
    for k in list(proj.keys()):
        if k not in ("name", "highlights"):
            proj.pop(k, None)
    proj["highlights"] = proj.get("highlights", [])[:1]
```

**Compensation:** The CL prompt instructs the model to "restate at a narrative level" not copy bullets verbatim. 2 bullets per role gives enough evidence for the P2 paragraph. JD extract provides the anchor for P1.

**Estimated savings:** CL resume input drops from ~8,000 → ~2,500 chars. At ~35 tok/sec output rate, the CL call drops from ~27 sec to ~8–10 sec.

---

### 6. Priority table (revised)

| # | Change | Effort | Expected total after |
|---|--------|--------|---------------------|
| 1 | Switch to non-thinking model via cliproxy (config only) | 5 min | ~25–32 sec |
| 2 | Constrain why to 12 words (prompt change only) | 30 min | ~18–24 sec |
| 3 | Sparse diff (prompt + relax validator) | 2–3 days | ~8–12 sec |
| 4 | JD extract compact text format | 4 hr | ~7–10 sec |
| 5 | Strip dead-weight resume fields (ids, URLs) | 2 hr | ~7–9 sec |
| 6 | Disable thinking via direct Gemini API + thinking_budget=0 | 1 day | ~5–7 sec |
| 7 | CL tighter resume slice | 2 hr | CL: ~8 sec |
| 8 | Streaming (perceived latency, not actual) | 1 week | feels instant |

---

## Streaming, JSON, and Format — Complete Explanation

> You said you're new to this. This section explains everything from scratch, including things outside our codebase.

---

### What streaming is

**Without streaming (what we do now):**
1. User clicks Generate
2. Model starts generating tokens (words/sub-words) one at a time
3. All tokens accumulate server-side
4. Model finishes the entire response
5. Server sends the complete response to the browser
6. Browser shows the result

The user sees nothing for the entire generation time (77 seconds for us). Then everything appears at once.

**With streaming:**
1. User clicks Generate
2. Model generates token #1 → server immediately sends it → browser shows it
3. Model generates token #2 → sent → shown
4. ...continues until done

The user sees text appearing word by word, like watching someone type in real time. ChatGPT does this. The total generation time is identical — but perceived latency drops from 77 seconds to ~1–2 seconds until first visible content.

---

### Why we can't stream our current format

Our model response is a JSON object:
```json
{"summary": {"value": "Built X.", "why": "..."}, "experience": {...}, ...}
```

JSON is only valid when complete. You cannot parse half a JSON object:
```
{"summary": {"value": "Built X.", "why": "Retained because
```
This is invalid JSON — no parser can read it. So even if we streamed the bytes, we'd have to buffer them all before doing anything, which gives us nothing over waiting for the complete response.

This is **the fundamental tension**: structured diff format (needed for machine-readable edits) vs streaming (requires parseable partial output).

---

### What we could do instead

**Option A — Streaming plain text, then structured diff separately:**
Split into two calls:
1. First call: stream a plain-text version of the tailored resume (user sees it progressively, ~1–2 sec to first content, full text in ~15–20 sec)
2. Second call (parallel or after): structured JSON diff for storing changes to the database

User reviews the streaming resume immediately. In the background, the diff call computes which cells changed. Two calls, but user-perceived time goes to ~2 seconds.

**Option B — Section-by-section streaming with delimiters:**
Tell the model to output each section with a delimiter:
```
---SUMMARY---
One-sentence thesis here.
---EXPERIENCE---
[experience text]
---END---
```
Browser parses by delimiter as the stream arrives — shows each section as soon as its delimiter is received. Each section appears progressively. No JSON, so no buffering needed. Backend parses sections by splitting on delimiters. Loses the granular cell-level diff tracking (we'd have to diff the sections ourselves).

**Option C — Incremental JSON (stream + parse):**
Python library `ijson` can parse JSON incrementally as bytes arrive. The backend opens a streaming connection to the LLM, pipes bytes through ijson, and emits parsed cells to the frontend via Server-Sent Events (SSE) as each cell completes. Very complex to implement. Each cell appears in the UI as soon as it finishes generating.

**What ChatGPT does:** Option A — it streams the markdown/text response directly. There is no structured diff. You just get the new resume text. ChatGPT has no concept of "which bullet changed" — it replaces everything. We have more structure because we track individual cell edits.

---

### Why we have retry, and the risks

**Why retry exists:**
LLMs can fail to produce valid JSON in two ways:
1. **Truncation**: model runs out of allowed output tokens mid-JSON (`...,"why": "Lead` — cut off). The response is malformed.
2. **Format drift**: model writes a comment, adds markdown fences (` ```json `), or deviates from the schema. The response doesn't parse.

When either happens, our `complete_json()` catches the parse error and re-calls the model with the same prompt (and sometimes a higher max_tokens to avoid truncation). This retry is silent to the user.

**The risk:** If the first attempt takes 77 seconds and fails, retry takes another 77 seconds. Worst case is **154 seconds** for a single tailoring operation. We have `retries=1` (up to 2 total attempts) for `tailor_resume_full`.

Adaptive max_tokens cap (already implemented) reduces retry probability because truncation becomes less likely when the cap matches the actual expected output size.

**Why not just use plain text?**

If we didn't need to track which cells changed, we could ask for a plain text resume and never deal with JSON. Plain text:
- Streams trivially
- Never truncates mid-structure
- Never needs retry for parse errors
- Is ~4× shorter in token count (900 tokens vs 2,573)

But then we lose:
- Knowing which specific bullets were rewritten (for the change display in the UI)
- The "why" rationale per cell (for QA)
- The ability to selectively apply only certain changes
- The granular diff stored in the database

The JSON format is a deliberate trade-off: structured edits + rationale tracking, at the cost of latency, retry risk, and streaming incompatibility. The question is whether that trade-off is worth it for your use case.
