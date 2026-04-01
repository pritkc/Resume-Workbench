# Resume Maker Plan: Phase 4

## Executive Summary

Your new constraints change the recommendation.

In phase 3, I leaned toward `Reactive Resume` as the cleanest long-term base.

After your latest points, I would now recommend:

**Build on top of `Resume-Matcher`, but replace its weakest layers with:**

- `RenderCV` for final rendering, preview fidelity, and template quality
- `PostgreSQL` for storage
- a simple 2-pass prompt chain plus validation layer

This is now the most straightforward and technically feasible execution path.

It gives you:

- the JD paste -> tailor -> cover letter -> LinkedIn message flow you already want
- a much easier path to a single-trigger "application pack" flow
- RenderCV-level output quality without trying to clone their entire closed web app
- much less product rebuilding than starting from `Reactive Resume`

My updated recommendation is:

## Final Pick

**Primary base:** `Resume-Matcher`  
**Rendering and design foundation:** `RenderCV`  
**Safety pattern to borrow:** `Reactive Resume`-style patch / diff discipline

## What Changed Since Phase 3

Three of your clarifications matter a lot:

1. You are okay with a single master resume and making forks from it.
2. The one-click application workflow matters more than platform purity.
3. You want the most straightforward execution path with minimal ambiguity and minimal rebuild risk.

That removes the biggest mismatch I previously had with `Resume-Matcher`.

Before, its single-master assumption was a real problem relative to your "many pinned base resumes" requirement. Now that this is acceptable, `Resume-Matcher` becomes much more attractive because it already matches your desired operational flow.

## What RenderCV Web Confirms

I checked the public RenderCV site and docs on **March 31, 2026**.

The official site currently says RenderCV is an "AI-native resume builder" with:

- import of an existing CV
- an AI career assistant
- a form editor or YAML editing
- job search
- JD-based tailoring
- cover letter generation
- data export as YAML, PDFs, and Typst sources

The most important public claims from the official site are:

- The AI assistant can edit the CV directly, tailor it to a job description, generate cover letters, and search for jobs.
- The user reviews and approves each change before it is applied.
- Paid plans include unlimited PDF downloads, public links, GitHub sync, AI editing, job search, and cover letter generation.
- The open-source engine remains available separately, and exported YAML can be used outside the web app.

The app docs also confirm that the product is still fundamentally schema-driven:

- structured input
- strong design controls
- YAML as a first-class representation
- automatic bold keyword support
- deterministic output paths

### Important inference

There is some visible drift between the public site and the openly accessible docs.

- The public site currently shows **nine visual themes**: `Classic`, `Ember`, `Engineering Classic`, `Engineering Resumes`, `Harvard`, `Ink`, `ModernCV`, `Opal`, `Sb2nov`.
- The accessible app docs page I could inspect still documents five named themes in its design section.

My inference is that the hosted product is evolving faster than the public docs and open repo surface.

That makes **trying to recreate the RenderCV web app 1:1 a high-ambiguity project**.

## Decision Table

| Option | Output Quality | Prompt Control | One-Click Workflow Fit | Execution Risk | My Verdict |
|---|---|---:|---:|---:|---|
| Buy `RenderCV Plus` and stop building | 5/5 | 1/5 | 3/5 | 1/5 | Best if you want to use, not build |
| Clone `RenderCV` web app | 5/5 | 5/5 | 5/5 | 5/5 | Not recommended |
| Build on `Reactive Resume` | 4/5 | 5/5 | 2/5 | 4/5 | Strong platform, but more work now |
| Build on `Resume-Matcher` only | 3/5 | 5/5 | 5/5 | 2/5 | Good prototype path |
| Build on `Resume-Matcher` + `RenderCV` engine | 5/5 | 5/5 | 5/5 | 2/5 | Recommended |

## Why I Do Not Recommend Cloning RenderCV Web

This is the most tempting option, but it is not the safest one.

Reasons:

- the web app itself is not open source
- the prompt system you care about is not exposed
- the AI workflow behavior is black-box
- the exact approval UX, prompt layering, and job search flow are not all documented
- the hosted app and public docs are not perfectly aligned
- recreating that polish exactly would be a large, ambiguous UI and product rebuild

If your goal were "replicate a beautiful app no matter how long it takes," that would be one thing.

But your goal is the opposite:

**a direct, reliable, technically feasible execution path with low ambiguity**

So I would explicitly rule this option out for phase 1.

## Why `Resume-Matcher` Is Now The Best Base

With your updated constraints, `Resume-Matcher` now has the best shape for the work you actually want to do.

### It already matches your core product loop

- choose the master resume
- paste a JD
- generate tailored content
- review diffs
- produce extra artifacts

That is already much closer to your day-to-day workflow than `Reactive Resume`.

### It already has the right artifact mindset

It already supports:

- tailored resume generation
- cover letter generation
- outreach / LinkedIn-style message generation
- preview / confirm flows

This is a major advantage because you explicitly want all of these after JD paste, preferably in one trigger.

### Its backend language aligns perfectly with RenderCV

This is the biggest practical point.

`Resume-Matcher` already has a Python backend. `RenderCV` is also Python-first.

That means we can integrate RenderCV much more naturally here than in a TypeScript-first stack.

Instead of rebuilding RenderCV web, we can simply:

- convert our internal resume structure into RenderCV-compatible input
- call the RenderCV engine in the backend
- generate HTML / PNG / PDF previews from the same rendering engine

That is far safer than trying to recreate RenderCV's UI from scratch.

## Recommended Architecture

## 1. Product Base

Fork `Resume-Matcher`.

Keep:

- its general frontend structure
- its JD paste flow
- its cover letter / outreach generation idea
- its preview / confirm pattern
- its existing prompt pack as the baseline

Replace:

- `TinyDB` with `PostgreSQL`
- current HTML/CSS print layer with `RenderCV` rendering
- raw full-resume rewrite tendency with diff / patch outputs only

## 2. Canonical Data Model

Use a simple model that reflects your updated needs:

- `master_resume`
- `resume_fork`
- `job_application`
- `generation_run`
- `artifact`

This is enough for now.

You do **not** need a complex lineage system if one master resume and forks are acceptable.

## 3. Rendering Layer

Use `RenderCV` as the rendering engine, not as the app shell.

Recommended approach:

- keep a canonical internal resume JSON model in the app
- build a deterministic adapter that converts that model into a supported RenderCV YAML shape
- use RenderCV to generate HTML / PNG / PDF from that shape

Why I prefer this over storing raw RenderCV YAML as the main source of truth:

- easier to keep the current Resume-Matcher editing flow
- easier to diff and patch specific fields
- easier to attach AI outputs to known paths
- less fragile than asking every AI step to emit valid YAML directly

## 4. WYSIWYG Strategy

This is the simplest realistic way to get closer to RenderCV web without cloning it:

- left side: expanded editable content view
- right side: live RenderCV-generated preview
- after each meaningful save or AI apply, regenerate preview HTML or PNG

That gives you:

- a much better WYSIWYG experience
- true preview parity with final export
- RenderCV-level spacing and design

without having to reproduce their closed frontend exactly.

## 5. Prompt Architecture

You said you do not want a giant agent graph. You just want one more layer of reasoning before the final output.

That is the right instinct.

I would keep the prompt system simple:

### Pass 1: Critic / Recruiter Lens

Inputs:

- master resume
- job description
- house writing rules

Outputs:

- missing matches
- weak bullets
- top keywords
- role emphasis suggestions
- risks / things not to claim

### Pass 2: Tailor Generator

Inputs:

- original resume
- pass 1 critique
- house writing rules

Outputs:

- targeted diff / patch only
- cover letter draft
- LinkedIn / outreach message draft

### Pass 3: Validator / Polish Layer

Inputs:

- pass 2 outputs
- original resume
- allowed style rules

Checks:

- no fabricated facts
- no date changes
- no unsupported skills
- no bad punctuation / weird formatting
- no layout-breaking verbosity

This is enough. I would not make it more complex at the start.

## Prompt Baselines To Reuse

Do not design prompts from zero.

Use:

- `Resume-Matcher`'s `DIFF_IMPROVE_PROMPT` as the main tailoring baseline
- `Resume-Matcher`'s refinement prompts for keyword injection and anti-AI cleanup
- `Resume-Matcher`'s cover letter and outreach prompt foundations
- `Reactive Resume`'s patch mindset and sanitization rules
- `RenderCV`'s schema discipline and formatting constraints

This is the best low-risk starting point.

## Single Trigger Workflow

This should become your main UX primitive:

### `Generate Application Pack`

Inputs:

- selected master resume
- job description
- optional company / role metadata
- optional tone / prompt preset

Outputs in one run:

- tailored resume diff
- final tailored fork
- cover letter
- LinkedIn / outreach message
- reasoning notes
- exported PDF

This is the flow you actually want, and `Resume-Matcher` is already closest to it.

## Straightforward Execution Plan

## Phase A

Fork `Resume-Matcher` and stabilize the base.

- keep current frontend and generation UX
- add Postgres
- preserve one master resume + forks only
- keep current AI flows working before major redesign

## Phase B

Swap in RenderCV rendering.

- build JSON -> RenderCV adapter
- support one default theme first
- use RenderCV-generated preview and PDF export
- validate one-page output with the chosen theme

## Phase C

Upgrade the AI workflow.

- replace full rewrite flows with diff / patch outputs
- add the critic pass
- merge resume + cover letter + LinkedIn generation into one run
- keep human approval before apply

## Phase D

Improve the editor UX.

- show expanded bullets by default
- add better side-by-side preview
- make edit / approve / regenerate loops faster

## Should You Buy RenderCV Plus?

Yes, but only for the right reason.

### Good reason to buy it

Buy a short plan if you want:

- to benchmark their UX closely
- to validate whether their AI already covers enough of your actual workflow
- to compare your future outputs against a very strong market reference

### Bad reason to buy it

Do **not** buy it assuming it will become the core platform you customize deeply.

The blockers you identified are real:

- unknown internal prompts
- black-box AI behavior
- fragmented task invocation
- limited control over your own prompt stack

So I would treat RenderCV Plus as:

- a benchmark product
- a short-term productivity tool
- a reference for output quality

not as the system we build our own workflow around.

## What I Would Personally Do

If I were optimizing for your exact brief, I would do this:

1. Buy one short RenderCV plan only for research and benchmarking.
2. Fork `Resume-Matcher`.
3. Replace storage first.
4. Integrate RenderCV as the renderer next.
5. Add the single-trigger application-pack workflow after that.
6. Only then refine prompts and polish the UI.

That path is the least ambiguous one I can currently see.

## Final Recommendation

For your stated priorities right now:

- **Do not clone RenderCV web**
- **Do not switch to Reactive Resume as the starting point**
- **Fork Resume-Matcher**
- **Integrate RenderCV rendering**
- **Use a simple 2-pass + validation AI workflow**

This is the most realistic path to:

- great templates
- better WYSIWYG
- one-click JD-driven output
- cover letter + LinkedIn generation
- prompt control
- low ambiguity
- fast execution

## Sources Checked

Official RenderCV sources reviewed on **March 31, 2026**:

- [RenderCV main site](https://rendercv.com/)
- [RenderCV CLI docs](https://docs.rendercv.com/)
- [RenderCV App Docs](https://appdocs.rendercv.com/)

Local repos reviewed again for this phase:

- `reference/rendercv`
- `reference/Resume-Matcher`
- `reference/reactive-resume`
