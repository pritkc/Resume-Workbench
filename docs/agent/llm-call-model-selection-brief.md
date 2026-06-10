# LLM call brief — model selection input

Use this document as **compact context** for an external advisor (or LLM) that compares providers/models on **price, context window, latency, reasoning quality, JSON reliability**, and **throughput**. Replace every `{{PLACEHOLDER}}` with your own estimates.

**Architecture (high level):** Backend calls models through a unified router (LiteLLM-style). Structured outputs use **JSON-object mode** with parse retries on failure; plain text tasks use standard completion. Optional **per-step model overrides** in app config map named pipeline steps to `model` or `provider/model`. Telemetry uses stable **`operation`** labels per call type (listed below).

---

## 1. Your operational assumptions (fill in)

| Input | Your value | Notes |
|-------|------------|--------|
| Estimated tailoring runs / day (full pipeline) | 20-30 | Preview + confirm separately if needed |
| Estimated JD extractions / day (cache misses) | 20-30 | Often fewer than tailors if JD is reused |
| Estimated resume parses / day | 0/ just one time to build up | Upload / re-upload |
| Cover+outreach combined generations / day | 10-20 | On-demand builder action; single LLM call returns both |
| Application-question fills / day | 20-25 | |
| Enrichment LLM calls / day (all ops) | 0-2 | Analyze / enhance / regenerate |
| Health checks / connection tests / day | 1-2 | Low tokens; may run often if automated |
| Monthly LLM budget (USD) | max $5 | |
| Target P95 latency for “main tailor” (ms) | faster and accurate - the better | User-perceived |
| Max acceptable P95 for critique + rewrite add-on (ms) | faster and accurate - the better | Full pipeline only |

---

## 2. Global constraints for any model choice

- **JSON-heavy workloads:** Tailoring, JD extraction, resume parsing, critique, rewrite, and application-question flows expect **valid JSON** under long prompts. Prefer models with strong **instruction following** and reliable **JSON schema adherence**.
- **Large prompts:** The main tailor prompt includes a **long shared rules block**, **compact resume JSON**, **JD-derived intel JSON**, and a **small response contract**. Budget **total context** for instructions + payloads, not completion alone. UI/catalog previews may cap displayed resume payload around **256 KiB**; live jobs can still send large structured resumes—plan for heavy users.
- **Completion ceilings:** Default **`max_tokens`** per operation are listed in §4; steps without an explicit ceiling often inherit a **4096** JSON completion default unless config overrides it.
- **Retries:** JSON paths **retry** on malformed output—budget **extra latency and duplicate cost** if the model is flaky.

---

## 3. Approximate prompt and payload sizes

Sizes below are **UTF-8 bytes** for **static** instruction templates (measured from shipped prompts). **`~tok (÷4)`** is a rough English planning estimate (not tokenizer-accurate).

### 3.1 Static prompt templates (instructions only)

| Pipeline step | Bytes (static) | ~tok (÷4) |
|---------------|---------------:|----------:|
| **Resume tailor (full)** — system + user shell | 518 + 1,338 = **1,856** | ~464 |
| **Shared diff / schema rules** (injected into full tailor + rewrite) | **7,736** | ~1,934 |
| **Full tailor minimum static block** (shell + rules in user message) | **9,592** | ~2,398 |
| **Resume tailor (lite)** — system + user | 3,015 + 573 = **3,588** | ~897 |
| **JD intelligence extraction** — system + user | 176 + 3,109 = **3,285** | ~821 |
| **Resume parse** — system + user | 75 + 1,026 = **1,101** | ~275 |
| **Critique** — system + user | 3,188 + 598 = **3,786** | ~946 |
| **Rewrite** — system + user shell (rules added like tailor) | 719 + 570 = **1,289** | ~322 |
| **Cover + outreach** — system + user | 1,056 + 3,414 = **4,470** | ~1,118 |
| **Application questions** — system + user | 563 + 3,454 = **4,017** | ~1,004 |
| **Enrichment — analyze** — system + user | 63 + 1,224 = **1,287** | ~322 |
| **Enrichment — enhance** — user | **735** | ~184 |
| **Enrichment — regenerate item** — user | **766** | ~192 |

Rewrite still includes the same **~7.7 KB** rules block as tailoring.

### 3.2 Hard caps and trims (product behavior)

| Mechanism | Value |
|-----------|------:|
| Master resume **preview** payload (display / catalog) | **256 KiB** |
| Resume **file upload** | **4 MB** max |
| JD trim for **some** prompts (e.g. application flows) | **4,000** chars default helper |
| Cover / outreach JD slice in prompt | **2,200** chars |
| Cover + outreach **completion** budget | **2,600** tokens |
| Application questions | ≤ **15** questions; ≤ **5,000** chars combined question text; answers capped at **2,500** chars each |
| Compact profile snippets for messaging (cover inputs) | e.g. summary **140** chars, highlights **100** chars, limited entries |
| Default JSON completion budget when not specialized | **4,096** tokens |
| Health check completion | **64** tokens |

**Tailoring vs cover:** JD extraction is called with the **full pasted job description** (not the 4k-trimmed helper). The **tailor** prompt is driven mainly by **derived JD-intel JSON**, not the raw JD text. Cover/outreach generation is not part of Tailor preview/confirm; it is triggered later from the builder.

### 3.3 Stored resumes — order of magnitude

Resumes are persisted as **markdown/source text** plus **structured JSON**. There is **no tight application-level cap** on stored size—only practical limits (upload size, DB, UX).

| Piece | Typical range (characters, order-of-magnitude) | Notes |
|-------|-----------------------------------------------|--------|
| Structured resume JSON sent to tailor | **~8k–80k** common; **100k+** possible | Grows with roles, bullets, skills |
| JD-intel JSON injected into tailor | **~1k–25k** | Depends on JD and extractor verbosity |
| Response contract JSON | **~500–4k** | Describes allowed edit surface |
| Parse call | **~1.1 KB** static prompts + **full resume text** | Same upload bound as above |

If you need **measured** percentiles for your traffic, sample **serialized resume length** from your own logs or warehouse—this doc does not include production statistics.

---

## 4. Operations inventory

| operation (telemetry label) | Mode | Default `max_tokens` | What it does (brief) |
|----------------------------|------|----------------------:|----------------------|
| `llm_health_check` | text | **64** | Connectivity smoke |
| `resume_parse_json` | JSON | **6144** | Unstructured resume → structured JSON |
| `extract_jd_intel_output` | JSON | **4096** (config may override) | Job description → intel JSON for tailoring |
| `resume_generate_full` | JSON | **15000** | Primary tailor: compact addressed diff JSON (**full** or **lite** prompt variant) |
| `critique_resume` | JSON | **4096** | Critique of first-pass diff |
| `rewrite_resume` | JSON | **15000** | Second-pass diff using critique |
| `cover_letter_outreach_generate` | text | **2600** | One call: cover letter + outreach |
| `application_questions_generate` | JSON | **4096** | Answers from compact profile |
| `enrichment_analyze_resume` | JSON | **8192** | Section analysis |
| `enrichment_reanalyze_resume` | JSON | **8192** | Re-run analysis |
| `enrichment_generate_description` | JSON | **4096** (typical default) | Enhance bullet/description from Q&A |
| `enrichment_regenerate_item` | JSON | **4096** | Regenerate one item |
| `enrichment_regenerate_additional_group` | JSON | **2048** | Regenerate a grouped batch |

---

## 5. Approximate context & reasoning profile

Use **`{{...}}`** where you plug in **your** token estimates from real traces. Static sizes are in **§3**.

| operation | Approx input drivers | Approx output | Reasoning need | Latency sensitivity |
|-----------|---------------------|---------------|----------------|---------------------|
| `resume_parse_json` | **~1.1 KB** static + full resume (**≤4 MB** upload) + **`{{PARSE_INPUT_TOKENS}}`** | JSON; **6144** cap | Medium | Medium |
| `extract_jd_intel_output` | **~3.3 KB** static + **full JD** + **`{{JD_EXTRACT_INPUT_TOKENS}}`** | Intel JSON; **4096** typical | Medium–high | Medium |
| `resume_generate_full` | **~9.6 KB** static + resume + intel + contract — often **~15k–120k+** chars total + **`{{TAILOR_PROMPT_INPUT_TOKENS}}`** | Large diff JSON; **15000** cap | **Very high** | **High** |
| `critique_resume` | **~3.8 KB** static + resume + diff + **`{{CRITIQUE_INPUT_TOKENS}}`** | JSON; **4096** | High | Medium |
| `rewrite_resume` | **~9.0 KB** static (shell + rules) + resume + diff + critique + **`{{REWRITE_INPUT_TOKENS}}`** | Large diff JSON; **15000** | **Very high** | High |
| `cover_letter_outreach_generate` | **~4.5 KB** static + compact profile + JD (**≤2200** chars) + **`{{COVER_INPUT_TOKENS}}`** | Dual prose; **2600** | Medium | Medium |
| `application_questions_generate` | **~4.0 KB** static + questions (**≤5000** chars) + profile + trimmed JD + **`{{AQ_INPUT_TOKENS}}`** | JSON; **4096** | Medium | Medium |
| Enrichment ops | **~0.7–1.3 KB** + section/item JSON + **`{{ENRICH_INPUT_TOKENS}}`** | JSON (see §4 caps) | Medium | Lower than tailor |
| `llm_health_check` | Minimal | **64** | Low | Low |

**Full tailoring chain:** JD extract (often cached) → **`resume_generate_full`** → optional **`critique_resume`** → optional **`rewrite_resume`** = **up to four** JSON-heavy calls per application pack (fewer with lite mode or critique disabled). Confirm does not re-run the tailor chain.

---

## 6. Per-step model overrides (config)

Configurable step IDs (when supported):

`parse_resume`, `extract_jd_intel`, `tailor_resume_full`, `tailor_resume_lite`, `critique_resume`, `rewrite_resume`, `cover_letter`, `answer_questions`

**Enrichment** steps typically follow the **global** default model unless the product adds overrides later.

**Selection hint:** Prefer the **strongest JSON model** on **`tailor_resume_full`** and **`rewrite_resume`**; consider a **cheaper** model for **`extract_jd_intel`** if quality holds.

---

## 7. Questions to ask the advisor LLM

1. Given **`{{PACKS_OR_TAILORS_PER_DAY}}`** and **`{{MONTHLY_BUDGET_USD}}`**, which **default model** best balances cost and reliable **`resume_generate_full`** JSON?
2. Should **`critique_resume`** / **`rewrite_resume`** match the tailor model or use a **cheaper** second model?
3. For **`extract_jd_intel_output`**, is a **smaller / cheaper** model enough given **`{{JD_TYPICAL_KB}}`**?
4. Which providers reliably support **JSON completion** at **`{{TAILOR_PROMPT_INPUT_TOKENS}}`** total context?
5. If **`{{TAILOR_P95_MS}}`** is tight, which models trade quality for latency on **large JSON outputs**?

---

## 8. Version note

Prompt sizes and **`max_tokens`** defaults change when the product changes—**re-validate** numbers before major provider or model switches. This brief is **not** a substitute for official pricing or quota documentation.
