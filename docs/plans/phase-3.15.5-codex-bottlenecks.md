# Phase 3.15.5 - Resume Generation Bottlenecks

**Date:** 2026-05-15  
**Scope:** Tailor page Generate flow, focused on `resume_generate_full`.

## Summary

The slow part is the LLM generation path, not RenderCV.

Measured preview trace: `8713ab4b-5fe6-49b8-b10d-8c349632a893`

| Step | Time |
|---|---:|
| JD intelligence: `extract_jd_intel_output` | **20.875 s** |
| Main resume generation: `resume_generate_full` | **76.764 s** |
| Total LLM time | **97.639 s** |
| Non-LLM tail: postprocess + DB + RenderCV + export | **~1.5 s** |

The main issue is the combination of:

1. A heavy model route: measured run used `openai/gemini-2.5-pro` through CLIProxyAPI.
2. A verbose prompt/output contract.
3. Full structured JSON validation before the UI can show the result.
4. Proxy/provider capacity variability.

Hosted ChatGPT/Claude feels faster because it usually returns final prose/markdown directly. Our app asks for strict structured JSON, per-cell diff data, validation-safe output, then applies it locally.

## Out Of Scope

These ideas are removed from the active plan:

1. JD cache.
2. Creating separate `fast_full` / `sparse_full` modes.
3. OpenAI-specific `reasoning_effort: none` for GPT-5.2-class tailoring.
4. Streaming progress.
5. RenderCV optimization.
6. Sparse-diff rewrite.
7. Compact `why` experiments such as shorter keys, pipe-delimited cells, or word-count compression.

## Active Plan

### 1. Remove `why` From Unchanged Cells

**Problem:** Full mode currently asks the model to explain retained cells. That makes the response longer without changing the final resume.

**Plan:**

1. Update the shared resume diff schema text so cells with `"value": null` do **not** need `why`.
2. Keep `why` required only when a cell changes.
3. Update compact-diff validation to allow missing/empty `why` only for unchanged cells.
4. Update diff/change-manifest display to tolerate missing `why` on unchanged cells.
5. Keep `why` for changed summary, bullets, titles, tech stacks, skills, and bold keywords where it helps review.

**Expected result:** Smaller model output with minimal behavior change. This is safer than introducing a new prompt mode.

### 2. Add Provider-Specific Reasoning / Thinking Controls

**Problem:** Model name alone is not enough. Gemini, OpenAI-compatible proxies, and direct APIs expose reasoning/thinking controls differently. The app currently supports per-step model overrides, but not per-step reasoning or thinking options.

**Plan:**

1. Extend stored model override config to support per-step options, for example:

```json
{
  "model_overrides": {
    "tailor_resume_full": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "thinking_budget": 0,
      "timeout_seconds": 90
    }
  }
}
```

2. Keep backward compatibility with the current string form:

```json
{
  "model_overrides": {
    "tailor_resume_full": "gemini/gemini-2.5-flash"
  }
}
```

3. For direct Gemini/LiteLLM Gemini routing, pass Gemini 2.5 Flash `thinkingBudget: 0` through `extra_body` / Gemini-native request options.
4. For CLIProxyAPI, verify pass-through explicitly. If OpenAI-compatible proxy routing drops Gemini-native `thinkingConfig`, do **not** depend on it.
5. If proxy pass-through fails, use one of two paths:
   - bypass CLIProxyAPI only for heavy steps and call Gemini directly with `thinkingBudget: 0`
   - keep CLIProxyAPI but choose a non-thinking model alias for `tailor_resume_full`
6. Record the resolved provider, model, route, thinking budget, timeout, and retry count into `llm_calls.request_context`.
7. Add a small test command/eval run that compares:
   - current `gemini-2.5-pro`
   - `gemini-2.5-flash`
   - `gemini-2.5-flash` with `thinkingBudget: 0` when route supports it

**Expected result:** We can keep quality closer to Gemini 2.5 Flash while avoiding unnecessary hidden thinking time where the route supports it.

### 3. Strip Dead-Weight Resume Fields From Prompt Input

**Problem:** The resume prompt includes fields the model should not edit. Reading them adds input size with little benefit.

**Plan:**

1. Trim only true dead weight from the resume JSON before prompt serialization.
2. Drop opaque IDs and URLs:
   - experience: `id`
   - projects: `id`, `github`, `website`
   - skills: `id`
3. Keep company, dates, and locations for now. They help with chronology, recency, and context.
4. Keep requirement-like job fields for now until we verify the compact JD format.
5. Add prompt-size telemetry before/after trimming.

**Expected result:** Small but safe input reduction. This is not the biggest latency win, but it is low risk.

### 4. Shrink JD Intel Into `jd_signal_pack`

**Problem:** The tailoring prompt receives a large JD intelligence blob and then repeats slices of it in guide text. That increases prompt size and attention load.

**Plan:**

1. Create a deterministic `build_jd_signal_pack(job_keywords)` helper.
2. Convert the selected JD fields into compact labelled text instead of injecting the full JSON blob. Example:

```text
ROLE: Software Quality Assurance Analyst
COMPANY: Starbucks
HOOKS: testing activities; QA process support; defect traceability
MUST_MATCH: Python; SQL; test automation
AVOID: generic SDLC; stakeholder alignment
BOLD_CANDIDATES: Python; PostgreSQL; dbt
LEVEL: Individual contributor; execute and improve QA practices
```

3. Keep only the fields needed by resume tailoring:
   - target role/title
   - company/domain context
   - location
   - requirements / technical requirements for now
   - 5-8 responsibility themes
   - must-match technical keywords
   - transferable themes
   - low-signal terms to avoid
   - bold keyword candidates
   - level/seniority calibration
4. Remove the repeated JD INTELLIGENCE GUIDE block from the prompt and replace it with one short instruction line.
5. Drop verbose extractor fields that are useful for debugging but not needed by the tailoring prompt.
6. Replace `$extract_jd_intel_output` in the tailoring prompt with `$jd_signal_pack`.
7. Store both full JD intel and compact `jd_signal_pack` in trace metadata so quality issues can still be debugged.
8. Add before/after token-size telemetry for the tailoring prompt.

**Expected result:** Smaller, cleaner input while preserving the important JD notes.

### 5. Move Style Bans To Deterministic Cleanup

**Problem:** The prompt carries long banned-word and banned-pattern instructions. Some of these can be enforced after generation with code instead of spending prompt tokens.

**Plan:**

1. Split style rules into two groups:
   - **Model decision rules:** truthfulness, JD fit, evidence mapping, claim calibration.
   - **Deterministic cleanup rules:** banned phrases, weak verbs, em dash, obvious filler, repeated low-signal terms.
2. Keep only model decision rules in the prompt.
3. Move deterministic cleanup into the existing postprocess/finalize layer.
4. Add warnings when cleanup changes model output, so we can inspect whether the model keeps violating style.
5. Add focused tests for banned phrase removal and no-regression on technical content.

**Expected result:** Shorter prompt and more consistent style enforcement.

### 6. Cover Letter Input Tightening

**Status:** Not active for this phase.

The other latency plan suggests trimming cover-letter resume evidence to the top bullets. That is reasonable, but cover letter generation is optional and not the current blocker. Keep this as a later task unless cover-letter latency becomes a priority.

## Model Direction

Preferred immediate test path:

1. Keep the current architecture.
2. Try `tailor_resume_full` on Gemini 2.5 Flash.
3. Verify whether `thinkingBudget: 0` works through the current proxy path.
4. If not, test direct Gemini for `tailor_resume_full`.
5. Compare quality and latency against current Gemini 2.5 Pro.

Do not make model changes blindly. Use 10 representative JDs and compare:

1. Latency.
2. JSON validity.
3. Final resume quality.
4. False additions.
5. ATS/keyword fit.
6. Diff review usefulness.

## Implementation Order

1. Add timing/metadata fields for provider route, thinking budget, and resolved model.
2. Add provider-specific thinking-budget support, starting with Gemini 2.5 Flash.
3. Run model comparison on the current prompt.
4. Remove `why` from unchanged cells.
5. Strip dead-weight resume fields from prompt input.
6. Replace full JD intel in the tailoring prompt with compact labelled `jd_signal_pack`.
7. Move deterministic style bans out of the prompt and into cleanup.
8. Re-run the same model comparison and measure improvement.

## Target

The realistic first target is to move the main preview path from **~98 s LLM time** toward **20-35 s** without changing the product shape.

Further gains should come from reducing output and prompt size, not from RenderCV or upload handling.
