# Phase 3.7.1 — Prompt system redesign (tailoring / main resume generation)

**Status:** Design / plan  
**Audience:** Product owners and engineers; focuses on outcomes and safe workflows, not prescribed file names unless they clarify responsibility.  
**Scope:** Main resume **tailoring** pipeline (JD → intelligence → tailor → structured JSON). **Enrichment** flows are out of scope for this document.  
**Companion:** [`docs/prompts/llm-prompt-composition.md`](../prompts/llm-prompt-composition.md) describes today’s static templates, runtime assembly, and catalog mapping.

---

## 1. Goals (what “good” looks like)

1. **Operational clarity** — A human can answer: *What text shapes behavior? What is frozen? What is safe to rewrite for tone?* without spelunking unrelated code.
2. **Safe iteration** — Improving “writing quality” or “voice” instructions must not accidentally change **JSON shape**, **key names**, **indexing rules**, or **validation assumptions** that the rest of the app depends on.
3. **Two clear modes** — **Full edit** (default) vs **light touch**, each with **isolated** instructional content so the model does not get mixed signals from one shared system prompt plus a tiny `MODE:` line.
4. **Room to grow** — Optional steps (reflection, critique, second pass) can be added **later** without a big-bang rewrite, using a **simple** composition model (ordered blocks / steps), not a new platform.
5. **Stability first** — The current chain is **stable** for JSON output; changes must be **incremental** and **guard-railed**, not fragile.

**Non-goals for this phase**

- A dedicated version control system for prompts (Git is enough).
- New infrastructure dependencies (databases, workflow engines, LangChain-style frameworks) unless a future phase proves unavoidable.
- Pixel-perfect UI specs (only design-level UX: what is editable where).

---

## 2. Current structure — issues and strengths

### 2.1 Issues (why iteration feels hard)

| Issue | Why it hurts |
|--------|----------------|
| **Fragmentation** | Tailoring lives in `templates.py`, assembly in `services/tailoring/prompting.py`, contracts elsewhere. “What applies where?” requires reading multiple files. |
| **One system prompt for all modes** | `TAILORING_SYSTEM_PROMPT` is written for strong rewriting; light-touch only differs by a **short** `MODE:` line. Easy for the model to follow the louder global instructions instead of the line. |
| **Three modes, thin differentiation** | `nudge` / `keywords` / `full` share the same template; only `TAILORING_MODE_CONSTRAINTS` changes. `IMPROVE_STRATEGY_GUIDANCE` exists but **is not sent** to the model (dead weight and confusion). |
| **Calibrated vs copy mixed in one blob** | OUTPUT FORMAT rules sit next to voice/ATS guidance. Pasting “better prose” from another LLM risks touching **contract** language. |
| **Extension story unclear** | Adding critique/refine steps today implies new ad-hoc calls and duplicated strings—not a named, ordered “pipeline” concept. |
| **Catalog vs source** | Catalog API helps visibility; it does not by itself enforce *what* may be edited safely. |

### 2.2 What is already good (preserve)

| Strength | Why keep it |
|----------|-------------|
| **Single LLM call for tailor** | Simple, fast, predictable; good baseline latency and cost. |
| **Explicit response contract JSON** | `build_response_contract` + compact diff path is a **strong** stability anchor. |
| **JD intelligence as structured input** | Separating analysis from tailoring is the right split; no need to merge those prompts. |
| **Git-tracked Python templates** | Reviewable diffs, no mystery state. |
| **Prompt catalog + composition doc** | Good orientation layer; should align naming with any new “block” model. |

---

## 3. Principles

### 3.1 Separate “contract” from “content”

**Contract (calibrated — change rarely, review with tests)**

- JSON-only requirement, allowed top-level keys, experience/projects indexing rules, omit rules, what must **not** be emitted, retry hints tied to shape.
- Anything parsers (`TailoringLLMResponse`, diff application, PDF/render) assume.

**Content (experimental — safe to iterate often)**

- Tone, voice, banned words, ATS *philosophy* (not the exact key schema), “how aggressive” rewriting feels—**when** those instructions do not contradict the contract.

**Mechanism (lightweight)**

- Physically or logically group text so editors see a **header or file boundary**: e.g. `TAILORING_OUTPUT_CONTRACT.md` (conceptually) vs `TAILORING_VOICE_FULL.md`. In code this can be **concatenation** of string constants in a fixed order—not a framework.

### 3.2 Two modes = two instruction bundles, not one line

- **`full`** (default): Full resume edit aligned to role; stronger rewriting allowed **within** contract.
- **`light`**: Minimal change; preserve structure/titles unless contract allows optional fields; explicit “do not rewrite everything.”

Each mode should have **its own** combined instruction surface for *strategy* (system + user intro sections), so the model is not resolving conflict between a global “rewrite bullets” system block and a single “conservative” sentence.

*Mapping from today:* Drop the middle **`keywords`** mode to reduce overlap, or map old `keywords` users to **`full`** with a one-time default change (migration section).

### 3.3 Versioning and guards

- **Semantic labels** inside the repo: `PROMPT_VERSIONS["tailoring_*"]` already exists—extend mentally to **contract version** vs **content version** if needed (could be same bump or two keys).
- **Tests as the real guard:** JSON schema validation, golden fixtures, and integration tests on `resume_generate_full` are the safety net—not a separate product feature.
- **UI editing (future):** Only **content** blocks exposed; **contract** blocks read-only or behind “advanced / repo only.”

### 3.4 Simplicity over abstraction

- Prefer **named string constants + one assembler function** over a plugin registry service.
- “Pipeline” = **ordered list of steps** in code (or config file in repo) where each step is `call_llm(model_id, messages_builder)`—add steps by inserting a row, not rewriting the universe.

---

## 4. Conceptual architecture

### 4.1 Layers (logical, not necessarily separate services)

```mermaid
flowchart TB
  subgraph inputs["Inputs"]
    JD[Job description]
    RES[Resume data]
    MODE[Mode: full | light]
    LANG[Content language]
  end

  subgraph analysis["Analysis — existing, keep stable"]
    JDI[JD intelligence extraction\njob_extract_keywords]
  end

  subgraph tailor["Tailoring — focus of this redesign"]
    RC[Response contract builder]
    ASM[Prompt assembler\nmode-specific blocks + shared runtime slots]
    LLM[Primary tailor LLM call]
  end

  subgraph optional["Optional future steps — extension points"]
    S2[Step 2: critic / reflection]
    S3[Step 3: final merge / polish]
  end

  subgraph output["Output"]
    JSON[Structured JSON → existing validation & apply]
  end

  JD --> JDI
  JDI --> ASM
  RES --> RC
  RC --> ASM
  MODE --> ASM
  LANG --> ASM
  ASM --> LLM
  LLM --> JSON
  LLM -.-> S2
  S2 -.-> S3
  S3 -.-> JSON
```

**Assembler idea:** Build `system_prompt = CONTRACT_BLOCK + MODE_STRATEGY_BLOCK[mode]` and `user_prompt = USER_SHELL` with placeholders `{job_intelligence}`, `{original_resume}`, `{response_contract}`, `{output_language}`. Shared **runtime** slots stay one function so you cannot “forget” a placeholder.

### 4.2 Blocks / adapters (terminology)

Use **blocks** (fixed names) instead of heavy “adapter” frameworks:

| Block | Role | Edit frequency |
|-------|------|----------------|
| **Output contract** | JSON keys, indices, omissions | Rare; requires tests |
| **Mode strategy (full)** | How aggressively to align | Often |
| **Mode strategy (light)** | Preservation rules | Often |
| **Shared craft rules** | Voice, ATS quality bar (non-schema) | Often |
| **User shell** | Ordering of JOB INTELLIGENCE / RESUME / CONTRACT | Occasional |
| **Runtime slots** | Filled from code only | Never hand-edited as “prompt” |

Optional future steps are **new blocks** that take **previous JSON or text** as input and return **JSON** (or text for a non-JSON critic step), with a **single** merge rule documented in one place.

### 4.3 Data flow (tailoring only)

1. **JD text** → `extract_jd_intelligence` → **job intelligence JSON** (unchanged pipeline).
2. **Resume** → **response contract** from resume shape + mode (existing contract builder; ensure **light** mode tightens “what may change” if needed).
3. **Assembler** picks **mode bundle**, fills **user** message.
4. **Primary LLM** returns JSON → existing validation / diff / apply.

Future: step 2 might be “critic” reading draft JSON; step 3 “final tailor” with same contract block repeated.

---

## 5. Extension points (add/remove/reorder without rewrite)

**Assumption:** Extension means **optional additional LLM calls** after or before the primary call, controlled by **feature flags** or a **short ordered list** in one module.

| Mechanism | Complexity | Use when |
|-----------|------------|----------|
| **Flag: `enable_critic_step`** | Lowest | One extra call, same repo |
| **Ordered `TAILORING_STEPS: list[Step]`** | Low–medium | Multiple steps, clear order |
| **Separate module per step** | Low | Each step owns its prompt strings |

**Rules to avoid breakage**

- Every step that emits JSON must **reuse the same OUTPUT CONTRACT block** (or a strict superset agreed in review).
- Non-JSON steps (critic) must output **structured** feedback (e.g. JSON list of issues) or constrained text parsed defensively—never free-form that replaces the main JSON without validation.

**Reorder:** Changing order = reordering the list or flags; **no** change to JD extraction.

---

## 6. Model routing (per-step)

**Assumption:** You want **different models per step** later (e.g. fast model for light touch, stronger model for full, small model for critique).

**Preferred path:** **CLIProxyAPI** (`cliproxyapi`) as the primary abstraction—already routes to multiple providers; per-step **model alias** or **profile** in config extends naturally.

**Direct API:** Same interface in `complete_json` / `complete`; pass `model` from per-step config. Supporting both is **not** heavy if routing is **one function** “resolve model for operation + step” reading from existing LLM config.

**Defer if scope is large**

- Per-step **cost caps** and **fallback** chains.
- Automatic model A/B in production.
- Dynamic model selection based on resume size (can stay manual config first).

**Minimal first step:** Single global model remains default; add **optional** `model_override` per step in config file only (no UI).

---

## 7. UX / operations (design level)

| Concern | Direction |
|---------|-----------|
| **Finding prompts** | One **tailoring** section in docs + catalog mirroring **block names** (`contract`, `strategy_full`, `strategy_light`, `user_shell`). |
| **Editing safely** | CONTRIBUTOR rule: “Never edit `contract` without running tailoring tests.” Optionally Markdown mirrors of blocks in `docs/prompts/blocks/` **generated or manually synced**—optional, not required for phase 1. |
| **UI (later)** | Settings: edit **content** blocks only; **contract** read-only with “edit in repo” tooltip. Mode picker: **two** options with short explanations. |
| **Paste workflow** | When pasting from external LLM, paste only into **strategy** or **craft** files/sections—never into contract without review. |

---

## 8. Risks and mitigation

| Risk | Mitigation |
|------|------------|
| JSON regressions | Contract isolated; integration tests; schema validation; bump `PROMPT_VERSIONS` when contract changes. |
| Mode confusion after collapsing three→two | Map old `keywords` → `full`; keep `nudge` behavior under **`light`** with clearer copy; document in changelog. |
| Over-abstraction | Cap at “named blocks + assembler + optional step list”; no generic plugin SDK in v1. |
| Second-step pipelines increase latency/cost | Feature-flagged; default off; measure before enabling in prod. |
| Drift between docs and code | Single assembler builds strings; docs link to function names; catalog API reflects blocks (future). |

---

## 9. Migration (incremental, no big-bang)

**Phase A — Clarify without behavior change**

1. Document two target modes; remove dead `IMPROVE_STRATEGY_GUIDANCE` **or** wire it into prompts (pick one to reduce confusion).
2. Split **contract** vs **craft** strings in code (concatenation only).

**Phase B — Two modes**

1. Replace `nudge` / `keywords` / `full` with **`light`** and **`full`** in API + UI + defaults.
2. Introduce **mode-specific strategy blocks** (system and/or user): duplicate and tailor text deliberately—small duplication is OK for clarity.
3. Align default to **`full`** (per product preference).

**Phase C — Optional steps**

1. Add one optional “critic” step behind flag; reuse contract for final JSON-producing step.
2. Per-step model override in config.

**Phase D — UI editing (optional)**

1. Expose content blocks via API; protect contract server-side.

---

## 10. Explicit assumptions

1. **JD intelligence extraction** stays as today; this redesign focuses on **tailoring** prompt assembly and modes.
2. **Output JSON contract** remains compatible with existing `TailoringLLMResponse` / apply path unless a dedicated migration epic changes the schema.
3. **CLIProxyAPI** is the preferred route for multi-model routing; direct API remains supported via the same completion layer.
4. **Two modes** are sufficient: “full” and “light”; former `keywords` users are folded into **full** unless analytics show a distinct need later.

---

## 11. Success criteria

- A new contributor can state **where** contract ends and content begins in under five minutes.
- Swapping **voice** text does not require touching **JSON key** instructions.
- **Light** and **full** produce **internally consistent** instructions (no conflicting system-level rewrite rules).
- Adding a **flagged** second LLM step does not require rewriting JD extraction or contract builder.

---

## 12. Open follow-ups (not blocking design approval)

- Exact **default** for users who had `keywords` selected in stored preferences.
- Whether **light** mode tightens **response contract** (fewer allowed edits) vs only **prompt** instructions—product call with engineering estimate.

---

*End of design document.*
