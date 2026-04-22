# Resume Maker Plan: Phase 3

## Executive Summary

Your rough comparison was directionally correct.

- `RenderCV` has the strongest output quality and the strongest ATS evidence.
- `Resume-Matcher` has the most developed AI tailoring product flow.
- `Reactive Resume` is the best overall product and platform foundation.

My honest recommendation is:

- **Best long-term base for the actual product you described:** `Reactive Resume`
- **Best fast internal prototype for JD -> tailored resume workflows:** `Resume-Matcher`
- **Best renderer / ATS benchmark to borrow from, not to fork as the main app:** `RenderCV`

If I had to choose one repo to build the real product on top of, I would **fork `Reactive Resume` and port the best AI workflow ideas from `Resume-Matcher`**, while using `RenderCV` as the ATS and typography benchmark.

If I had to choose the fastest path to a personal-use tool in the shortest time, I would pick `Resume-Matcher`, but I would do that with open eyes: its storage model and "single master resume" assumptions will become refactor debt very quickly.

## What I Reviewed

- Your comparison notes in `Resume-tools-compare.md`
- `reference/reactive-resume`
- `reference/rendercv`
- `reference/Resume-Matcher`
- The main AI service files, prompt files, parser/export paths, and repo documentation for all three

## One-Line Verdict

| Repo | What It Is Best At | Why It Is Not Enough By Itself |
|---|---|---|
| `Reactive Resume` | Product-grade resume editor foundation | AI workflow is still relatively shallow for your use case |
| `RenderCV` | PDF quality, typography, ATS discipline | Not an open-source WYSIWYG product foundation |
| `Resume-Matcher` | Job-description-driven AI tailoring flow | Weak long-term architecture for public deployment |

## Scorecard

Scores are relative to **your** requirements, not generic repo quality.

| Criterion | Reactive Resume | RenderCV | Resume-Matcher |
|---|---:|---:|---:|
| WYSIWYG editing base | 5/5 | 1/5 | 3/5 |
| Public-product readiness | 5/5 | 2/5 | 2/5 |
| ATS-safe rendering evidence | 3/5 | 5/5 | 2/5 |
| PDF polish / "close to LaTeX" feel | 4/5 | 5/5 | 3/5 |
| AI tailoring sophistication | 3/5 | 1/5 | 5/5 |
| Prompt-chaining extensibility | 3/5 | 1/5 | 4/5 |
| Base resume -> variants workflow fit | 3/5 | 1/5 | 2/5 |
| Ease of adapting to your exact product | 4/5 | 2/5 | 4/5 |
| Infra quality for "personal now, public later" | 5/5 | 2/5 | 2/5 |
| Overall fit for your target system | 5/5 | 2/5 | 4/5 |

## Repo-by-Repo Deep Review

## 1. Reactive Resume

### What the repo is

This is the most complete **resume product foundation** of the three.

The repo already has:

- a structured resume domain model
- a real browser editor
- multiple templates
- authentication and persistence infrastructure
- import/export flows
- an existing AI integration layer

### Core stack

From the repo structure and `package.json`, the foundation is modern and product-oriented:

- React + TypeScript
- TanStack Start
- Tiptap
- PostgreSQL + Drizzle
- Better Auth
- ORPC
- S3-compatible storage patterns
- browser-based printing / PDF infrastructure

### AI mechanism

This repo's AI layer is not the richest, but it is the **cleanest structurally**.

Important files:

| File | What it does | Why it matters |
|---|---|---|
| `reference/reactive-resume/src/integrations/orpc/services/ai.ts` | Main AI service entry point | Central place to extend parse, tailor, and editing workflows |
| `reference/reactive-resume/src/integrations/ai/tools/patch-resume.ts` | Defines the `patch_resume` tool using JSON Patch | Strong foundation for deterministic, minimal edits |
| `reference/reactive-resume/src/integrations/ai/prompts/chat-system.md` | AI editing system prompt | Enforces tool-based edits instead of freeform output |
| `reference/reactive-resume/src/integrations/ai/prompts/tailor-system.md` | ATS-oriented tailoring prompt | Good starting point for role-specific rewrite workflows |
| `reference/reactive-resume/src/utils/resume/tailor.ts` | Validates indices, sanitizes text, converts tailor output to patches | Exactly the kind of "fail closed" layer your product needs |
| `reference/reactive-resume/src/integrations/ai/store.ts` | Stores AI provider settings in browser local storage | Useful for personal use, but a clear weakness for public SaaS |

### What is good here for your product

- The structured resume schema is already real, not hand-wavy.
- The `patch_resume` approach is one of the strongest patterns I saw in all three repos.
- The repo already thinks in terms of controlled mutations instead of "let the model rewrite everything and hope."
- The editing experience and template system are much closer to your WYSIWYG requirement than the other two repos.
- The broader architecture is much more compatible with "personal first, public later."

### Honest criticism

- The AI features are good, but they are still **single-step** compared to your desired multi-layer workflow.
- The current tailoring system is closer to "rewrite the resume for this job" than to "manage prompt graphs, critique stages, review gates, company memory, and variant lineage."
- AI provider credentials being stored client-side is acceptable for self-hosted power users, but it is not how I would ship a public multi-user product.
- The printer / storage path is more operationally involved than the simpler Playwright-based setups in the other repo.
- It does not natively model your "many base resumes pinned, then spawn tailored variants tied to company + role + timestamp" workflow yet.

### My call on Reactive Resume

This is the **best long-term base** if we want to avoid rebuilding fundamentals later.

I would not copy its AI system as-is and call the job done. I would treat this repo as:

- the editor foundation
- the domain model foundation
- the multi-user product foundation
- the place where we transplant a stronger AI workflow engine

## 2. RenderCV

### What the repo is

This is the best **typesetting and ATS benchmark** of the three, but it is **not the product shell you are looking for**.

It is a Python + YAML + Typst pipeline, not an open-source browser editor product.

### Core stack

- Python
- Pydantic schema validation
- YAML inputs
- Jinja templating
- Typst renderer
- PDF / PNG / HTML / Markdown generation

### ATS and output quality

This is where RenderCV is strongest.

Important files:

| File | What it does | Why it matters |
|---|---|---|
| `reference/rendercv/docs/ats_compatibility.md` | ATS compatibility report | The best ATS evidence among the three repos |
| `reference/rendercv/src/rendercv/renderer/typst.py` | Turns validated data into Typst | Strong reference for professional print output |
| `reference/rendercv/src/rendercv/renderer/pdf_png.py` | Compiles Typst to PDF/PNG | Useful if you ever want a second export path |
| `reference/rendercv/src/rendercv/schema/rendercv_model_builder.py` | Validates and assembles YAML into a typed model | Great example of strict content contracts |
| `reference/rendercv/src/rendercv/schema/json_schema_generator.py` | Generates JSON schema from the typed model | Useful pattern for external input validation |

The ATS report is especially important. It does not just claim "ATS friendly." It actually describes a reproducible test method across multiple themes and parsers. That is the strongest evidence base in any of the three repos.

### AI mechanism

This repo does **not** have an end-user AI tailoring product.

The AI-related files are about helping external coding agents generate valid RenderCV YAML, not about JD-driven resume rewriting inside an app.

Important files:

| File | What it does | Honest interpretation |
|---|---|---|
| `reference/rendercv/scripts/rendercv_skill/generate.py` | Generates an AI skill document from the live schema | Useful for agent interoperability, not product AI |
| `reference/rendercv/scripts/rendercv_skill/skill_template.j2.md` | Template for the generated skill | Shows how to teach an LLM the schema safely |
| `reference/rendercv/scripts/rendercv_skill/evals/prompts/skill_chat.js` | Prompt-eval support for the skill | Good eval discipline, but not end-user tailoring |

### What is good here for your product

- Best-looking output and strongest "close to LaTeX / Typst" feel.
- Very strong control over fonts, spacing, margins, and layout.
- Excellent schema discipline.
- Strong ATS methodology you should absolutely copy into your own validation harness.
- Inline markdown support and `bold_keywords` are useful ideas.

### Honest criticism

- This is not the open-source WYSIWYG product you want.
- The hosted UI is not the real repo base you can fully build on.
- There is no app data model for base resumes, variants, company history, prompts, or review flows.
- There is no existing end-user AI orchestration worth forking.
- If you choose this as the primary base, you are still building most of your actual product from scratch.

### My call on RenderCV

Do **not** choose this as the main repo to fork for your product.

Use it as:

- the ATS benchmark
- the typography benchmark
- the renderer quality benchmark
- a future optional export-engine reference

## 3. Resume-Matcher

### What the repo is

This is the most directly relevant **AI tailoring app** of the three.

If the question were only, "Which repo already feels closest to job-description paste -> AI edits -> compare -> export?" then this one would win.

### Core stack

- Next.js frontend
- FastAPI backend
- LiteLLM model gateway
- TinyDB JSON file storage
- Playwright PDF generation

### AI mechanism

This is the richest AI workflow I found in the three repos.

Important files:

| File | What it does | Why it matters |
|---|---|---|
| `reference/Resume-Matcher/apps/backend/app/llm.py` | LiteLLM wrapper, retries, JSON handling, health checks | Good central abstraction for multi-provider model calls |
| `reference/Resume-Matcher/apps/backend/app/services/parser.py` | Parses uploaded files into markdown, then into structured JSON with an LLM | Directly relevant to your import pipeline |
| `reference/Resume-Matcher/apps/backend/app/services/improver.py` | Main JD-based tailoring flow | Strong base for patch-oriented rewrite generation |
| `reference/Resume-Matcher/apps/backend/app/services/refiner.py` | Multi-pass refinement and keyword injection | Closest match to your prompt-layer ideas |
| `reference/Resume-Matcher/apps/backend/app/prompts/templates.py` | Core tailoring, keyword, diff, and auxiliary prompts | Main prompt library to study and adapt |
| `reference/Resume-Matcher/apps/backend/app/prompts/enrichment.py` | Weak-bullet analysis, candidate Q&A, regenerate flows | Useful for enrichment and manual review loops |
| `reference/Resume-Matcher/apps/backend/app/prompts/refinement.py` | AI phrase blacklist and final polish prompts | Useful post-processing discipline |
| `reference/Resume-Matcher/apps/backend/app/routers/resumes.py` | Preview / confirm tailoring workflow | Good example of materializing changes after review |
| `reference/Resume-Matcher/apps/backend/app/routers/enrichment.py` | Resume enrichment endpoints | Ready reference for interactive follow-up questions |

### Prompt design observations

This repo already contains several prompt patterns that are worth copying or reworking:

- `IMPROVE_RESUME_PROMPT_NUDGE`
- `IMPROVE_RESUME_PROMPT_KEYWORDS`
- `IMPROVE_RESUME_PROMPT_FULL`
- `DIFF_IMPROVE_PROMPT`
- `EXTRACT_KEYWORDS_PROMPT`
- `ANALYZE_RESUME_PROMPT`
- `ENHANCE_DESCRIPTION_PROMPT`
- `REGENERATE_ITEM_PROMPT`
- `REGENERATE_SKILLS_PROMPT`
- `KEYWORD_INJECTION_PROMPT`
- `VALIDATION_POLISH_PROMPT`

The most important one structurally is `DIFF_IMPROVE_PROMPT`, because it already moves the system away from "rewrite the whole resume blindly" and toward "make targeted, explainable changes at known paths."

That is much closer to the system you want.

### What is good here for your product

- Closest to your desired workflow today.
- Already centered around pasting a job description and tailoring against a selected resume.
- Already has preview / diff / confirm mechanics.
- Already has enrichment flows for weak bullets and candidate follow-up questions.
- Already has cover-letter and outreach generation.
- Playwright-based print path is simple and practical.
- The AI workflow is much easier to extend into prompt chaining than the other repos.

### Honest criticism

- `TinyDB` is the biggest architectural red flag in this repo.
- The repo assumes a **single master resume**, which conflicts directly with your "N base resumes pinned + many variants" need.
- Prompt management is still largely code-string-driven rather than a cleaner prompt registry / versioned workflow system.
- The overall system feels like an effective product prototype that grew organically, not a platform designed for future multi-tenant complexity.
- The editor experience is useful, but it is not as strong or as structurally elegant as `Reactive Resume`.
- Template quality is decent, but it is not the same class as `RenderCV`.

### My call on Resume-Matcher

This is the **best reference implementation for AI behavior**, but not the cleanest long-term platform.

If we fork it, I would immediately plan three major refactors:

1. Replace `TinyDB` with PostgreSQL.
2. Replace the single-master-resume assumption with true base-resume / variant / application lineage.
3. Move prompt definitions toward versioned, typed workflow nodes instead of only raw string templates.

## Detailed Comparison Table

| Topic | Reactive Resume | RenderCV | Resume-Matcher |
|---|---|---|---|
| Main value | Product shell and editor | Output engine and ATS proof | AI tailoring workflow |
| Editing model | Rich web editor, structured resume data | YAML-first, not WYSIWYG | App UI plus targeted edit flows |
| Resume schema discipline | Strong | Very strong | Moderate |
| Public deployment path | Good | Weak as a product shell | Needs major refactor |
| PDF quality | Good | Excellent | Good enough, less polished |
| ATS confidence | Moderate | High, with evidence | Moderate |
| AI import / parse | Present | Not productized | Strong |
| AI tailoring | Present but simpler | Not productized | Strongest |
| Prompt layering potential | Medium | Low | High |
| Variant lineage fit | Missing but addable | Missing | Weak current fit |
| Manual review UX | Strong editing foundation | Weak | Good preview flow |
| Final recommendation | Best base repo | Best benchmark repo | Best AI donor repo |

## What To Reuse From Each Repo

| Idea to reuse | Source repo | Why it should survive into your system |
|---|---|---|
| JSON Patch / minimal structured mutations | `Reactive Resume` | Best way to guarantee placement and valid edits |
| Strong typed resume model | `Reactive Resume` | Gives you stable contracts for AI, editor, and export |
| Diff / preview / confirm AI workflow | `Resume-Matcher` | Strong human-in-the-loop safety pattern |
| Multi-pass AI refinement | `Resume-Matcher` | Matches your prompt-chain experimentation needs |
| Weak-bullet analysis + candidate Q&A | `Resume-Matcher` | Great fit for enriching incomplete base resumes |
| ATS proof harness and metrics | `RenderCV` | You should test parseability instead of guessing |
| Typography and spacing discipline | `RenderCV` | Strong benchmark for your final PDF polish |

## My Recommended Build Strategy

## Option A: Recommended Product Path

**Fork `Reactive Resume`, then transplant selected `Resume-Matcher` AI patterns.**

Why I prefer this:

- You said you want to save time on fundamentals.
- `Reactive Resume` already saves more time on the difficult product fundamentals: editing, resume structure, multi-user shape, template architecture, and general platform quality.
- The AI logic from `Resume-Matcher` is easier to transplant than the entire product foundation from `Reactive Resume`.

What I would transplant first:

1. Resume parsing flow patterns from `apps/backend/app/services/parser.py`
2. Diff-oriented tailoring ideas from `DIFF_IMPROVE_PROMPT`
3. Multi-pass refinement ideas from `services/refiner.py`
4. Enrichment Q&A flows from `routers/enrichment.py` and `prompts/enrichment.py`
5. Simple Playwright-style print verification ideas from `Resume-Matcher`

What I would not transplant as-is:

- `TinyDB`
- single `is_master` logic
- prompt strings as the only source of workflow definition

## Option B: Fastest Prototype Path

**Fork `Resume-Matcher`, but refactor the storage and lineage model immediately.**

Use this option only if your priority is:

- getting an internal tool working very quickly
- experimenting on prompt chains before investing more in product polish

I would not treat this as "no-refactor-needed." It will save time early, but only if we accept that a serious platform cleanup is coming.

## Option C: What I Would Not Do

**Do not fork `RenderCV` as the primary app base.**

It is the wrong starting point for:

- a browser-first WYSIWYG workflow
- AI review loops
- resume lineage management
- company / role history
- prompt orchestration

## Final Recommendation

For the system you described across phase 1, phase 2, and this repo review:

- **Primary base repo:** `Reactive Resume`
- **Primary AI donor repo:** `Resume-Matcher`
- **Primary ATS / PDF benchmark repo:** `RenderCV`

If you force me to choose only one repo and forbid mixing ideas, my answer changes depending on the goal:

- **Best one-repo choice for long-term product quality:** `Reactive Resume`
- **Best one-repo choice for fastest personal-use AI tool:** `Resume-Matcher`

My actual recommendation is still the hybrid one:

**Build on `Reactive Resume`, copy the best AI patterns from `Resume-Matcher`, and hold your final PDF quality against `RenderCV`.**

## Blunt Criticism You Should Keep In Mind

- None of the three repos is already your product.
- `RenderCV` is the prettiest, but it would save you the least product work.
- `Resume-Matcher` is the closest to your AI use case, but its current data architecture is the weakest fit for your long-term goal.
- `Reactive Resume` is the cleanest foundation, but it will still require meaningful new AI workflow work.
- The highest-leverage strategy is **not** to pick a repo emotionally. It is to pick the repo whose weaknesses are cheapest to fix.

For your requirements, I believe the cheapest weaknesses to fix are:

- add stronger AI workflows to `Reactive Resume`

not:

- rebuild `Resume-Matcher` into a real multi-tenant resume platform
- or turn `RenderCV` into a browser-first AI product

## Suggested Phase 4

If we continue from here, the next useful step is to turn this recommendation into a concrete fork plan:

1. choose the base repo
2. map the exact tables / models / entities we need
3. identify which AI services and prompts to port
4. write the first migration and package layout
5. define the first one-page ATS-safe default template contract

That would give us a much more actionable implementation plan than staying at the comparison layer.
