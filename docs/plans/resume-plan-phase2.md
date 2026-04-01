# Resume Maker Plan: Phase 2

## Executive Summary

Your phase-2 requirements change the center of gravity of the product.

This is no longer just:

- a rich text resume editor
- a PDF generator
- a place to paste LLM output

It is now a **resume adaptation system** with four first-class concerns:

1. **ATS-safe output**
2. **resume lineage and variant management**
3. **deterministic AI-assisted rewriting**
4. **one-page fit optimization**

My revised recommendation is:

- `Next.js + React + TypeScript` for the product shell
- `pnpm` monorepo with shared packages
- `Tiptap` for field-level editing and review
- `PostgreSQL + Drizzle ORM` as the primary system database
- `pgvector` plus Postgres full-text search for JD matching and history retrieval
- `S3-compatible storage` for PDFs and artifacts
- `Trigger.dev` for durable multi-step AI and export workflows
- `Langfuse` for prompt management, traces, experiments, and prompt versioning
- `Promptfoo` for offline regression/eval suites for prompts and output quality
- `AJV + JSON Schema` for runtime validation of canonical resume and patch contracts
- shared `HTML/CSS` template renderer + `Playwright/Chromium` for export
- `pretext` as a **fit-assist / line-measurement subsystem**, not the PDF renderer

The biggest architectural recommendation is this:

**Do not ask any LLM to generate the final printable resume as raw freeform text and trust it.**

Instead, make every AI layer produce either:

- a typed `ResumePatch` object
- or a fallback patch syntax that can be parsed into `ResumePatch`

Then run that through:

- schema validation
- merge rules
- one-page fit checks
- ATS checks
- final renderer

That is how you get the strongest possible guarantee of correct placement and formatting.

## Direct Feedback on Your Needs

### What I agree with strongly

- Personal-use-first but public-ready is the right framing.
- ATS-first is the right default for the first template.
- Base resumes plus many derived variants is the correct data model.
- Prompt chaining should stay flexible because you are still learning the best workflow.
- External LLM copy/paste support is important and worth treating as a real feature.
- One-page fit deserves dedicated engineering and should not be “just manual tweaking”.

### What I would push back on

#### “100% guarantee” needs to be split into two promises

You can realistically guarantee:

- correct schema
- correct field placement
- correct section ownership
- correct rendering rules

You cannot honestly guarantee:

- that the LLM chose the best bullet
- that the content is factually optimal
- that every ATS will score it perfectly

So the product promise should be:

**100% deterministic formatting and placement, human-reviewed content quality.**

#### ATS “calibration” should be treated as a test harness, not a magic score

There is no universal ATS truth score. What you can do well is:

- build ATS-safe templates
- export PDFs with a clean text layer
- parse your own PDFs back into text
- compare extracted order and content to the canonical resume
- enforce conservative design rules

That is much stronger than chasing random “ATS score” widgets.

#### Do not overbuild the prompt graph too early

Your use case sounds like a workflow, not an open-ended agent system.

Start with a **typed deterministic pipeline**:

- parse JD
- critique
- retrieve relevant bullets
- generate patch
- normalize patch
- fit to one page
- ATS check
- render

If later you truly need dynamic agents, you can add that. Do not begin there.

## Revised Product Principles

### 1. Multi-tenant-ready from day one

Even if you are the only user at first:

- every row should have `ownerUserId`
- every public object should have a stable public ID
- no local-disk storage assumptions
- no hardcoded single-user shortcuts in data shape

This avoids a painful refactor later.

### 2. Base resumes are immutable anchors

Pinned resumes should behave like source branches.

- a base resume is a stable master
- a variant is created from a specific base snapshot
- an application resume is a materialized variant tied to a job/company
- later edits should be tracked as patches and snapshots

Do not mutate the base resume invisibly when generating job-specific versions.

### 3. The template owns layout

Pasted content and LLM output should never directly control:

- margins
- font sizes
- spacing
- columns
- section ordering rules

The template owns layout. Inputs only provide content and approved metadata.

### 4. Preview and export must share the exact renderer

If preview and PDF use different layout logic, your one-page behavior and ATS behavior will drift.

### 5. Fail closed, not open

If an AI output cannot be normalized into a valid patch:

- do not “best effort” silently
- flag the exact parse or validation problem
- let the user repair it or re-run

## Revised Final Stack

## App and Monorepo

- `pnpm` workspaces
- optional `Turborepo`
- packages split into:
  - `apps/web`
  - `apps/worker`
  - `packages/resume-schema`
  - `packages/render-core`
  - `packages/prompt-core`
  - `packages/ats-core`
  - `packages/external-patch-format`

Why:

- clean separation now
- no big refactor later when you split workers and services

## Frontend

- `Next.js`
- `React`
- `TypeScript`
- `Tiptap`
- `TanStack Query`
- `Zustand` for local editor/workbench state

Why:

- excellent fit for a browser-first editing product
- Tiptap is still the best balance for structured rich text
- easy future deployment and internal tooling

## Backend / Core Services

- `Next.js` route handlers or typed RPC for app-facing APIs
- `Trigger.dev` for long-running workflows
- `Langfuse` for prompt registry + traces + experiments
- `Promptfoo` for regression testing in CI

Why:

- your AI pipeline has retries, human review points, and long-running work
- Trigger.dev is a cleaner v1/v2 fit than jumping straight to Temporal
- Langfuse keeps prompts versioned and observable outside code deploys
- Promptfoo gives you prompt regression testing as your rules evolve

## Data and Search

- `PostgreSQL`
- `Drizzle ORM`
- `pgvector`
- Postgres full-text search

Why:

- one database can carry your operational data, search metadata, and similarity retrieval
- no need for an external vector DB at this stage
- easy to scale later without changing the conceptual model

## Storage

- `S3` / `R2` / `MinIO` compatible object storage

Store:

- exported PDFs
- prompt run artifacts
- diff snapshots
- optional extracted text / ATS debug outputs

## Validation

- canonical contracts as `JSON Schema`
- runtime validation via `AJV`
- TypeScript types generated from shared contract definitions

Why:

- external imports and AI outputs need hard runtime validation
- contracts should be usable outside the frontend

## PDF / Rendering

- shared HTML/CSS template renderer
- `Playwright + Chromium` export worker
- self-hosted fonts

Why:

- still the best path for true WYSIWYG
- easy to compare live preview against exported output

## One-Page Fit Engine

- `pretext` for fast text measurement and line-count estimation
- actual render truth still comes from the HTML/CSS renderer

Why:

- pretext is excellent for fit prediction, overflow warnings, and candidate ranking
- it should not replace the actual browser render/export pipeline

## Optional Later Additions

- `PrinceXML` if you later want premium paged-media features
- `Better Auth` or equivalent when you move to public auth
- external browser/PDF service only when you truly need it

## Why `pretext` Should Be a Helper, Not the Foundation

Using `pretext` is a smart idea, but only for the correct layer.

What it is good for:

- fast text measurement
- line-count prediction
- trying multiple candidate bullet sets quickly
- one-page fit heuristics
- overflow estimation before expensive PDF export

What it should not be responsible for:

- canonical rendering
- final PDF layout
- template truth
- ATS truth

Reason:

The final printable document still needs to be validated by the actual renderer and PDF exporter. Pretext helps you **search for a fit**, but it should not be the thing you trust as the final output contract.

## ATS-First Template Design

For the default template, I recommend:

- single-column layout
- no required icons for meaning
- no multi-column sidebar in v1 ATS template
- no text rendered as SVG paths
- no tables for core work history
- no header/footer tricks for important content
- standard section names:
  - `Summary`
  - `Experience`
  - `Projects`
  - `Education`
  - `Skills`
- consistent dates
- explicit location text
- real text links, not image badges

### ATS Calibration Pipeline

Every exported PDF should get an internal ATS report:

1. Generate PDF
2. Extract text back from PDF
3. Compare extracted text with canonical plain-text resume
4. Check reading order
5. Check section title vocabulary
6. Check link and contact visibility
7. Check date normalization
8. Check whether any critical fields disappeared or moved badly

Report categories:

- `parse_safety`
- `text_layer_integrity`
- `section_order_integrity`
- `keyword_coverage`
- `overflow_risk`
- `template_rule_violations`

This is a much stronger system than a vague ATS score.

## Revised Canonical Data Model

I would use these core entities.

### User and Ownership

- `users`
- `user_settings`
- `prompt_preferences`

### Resume Library

- `base_resumes`
- `base_resume_snapshots`
- `resume_variants`
- `resume_variant_snapshots`
- `resume_patches`
- `resume_tags`

### Job Targeting

- `companies`
- `job_postings`
- `applications`
- `application_resume_links`

### Prompt / AI System

- `prompt_packs`
- `prompt_pack_versions`
- `workflow_specs`
- `workflow_spec_versions`
- `workflow_runs`
- `workflow_node_runs`
- `model_configs`

### Output and QA

- `pdf_artifacts`
- `ats_reports`
- `fit_reports`
- `external_imports`
- `manual_review_events`

## Resume Lineage Model

This part matters a lot for your use case.

Recommended model:

- `Base Resume`
  - your canonical long-lived resume for a domain
  - example: `base-frontend`, `base-backend`, `base-general`
- `Variant`
  - a reusable branch from a base resume
  - example: `stripe-leaning-variant`
- `Application Resume`
  - a concrete snapshot tied to a specific company/job/date

Every application resume should store:

- parent base resume snapshot ID
- applied patch list
- prompt pack version
- workflow spec version
- final rendered snapshot
- ATS report ID
- exported PDF artifact ID

This gives you:

- reproducibility
- debuggability
- easy backtracking
- search by company/role/date

## Recommended User Journey

### Flow 1: Build and pin base resumes

1. Import or create a resume
2. Normalize it into canonical schema
3. Save as a base resume
4. Pin it
5. Tag it by role family and seniority

### Flow 2: Create a targeted application resume

1. Select a base resume
2. Paste job description
3. Confirm or edit company, role, location
4. Choose prompt pack
5. Run adaptation workflow
6. Review generated patch diff
7. Accept/reject edits
8. Run fit + ATS checks
9. Export PDF
10. Save under application history

### Flow 3: Paste output from an external LLM

1. Select a base resume or existing variant
2. Paste external `ResumePatch` syntax
3. Parse and validate
4. Show diff
5. Allow manual edits
6. Run fit + ATS checks
7. Export and archive

### Flow 4: Search old resumes later

Filter by:

- company
- role
- date range
- base resume
- prompt pack
- model
- ATS report status
- exported or not exported

## AI / Prompt Architecture

This is the most important architecture change for phase 2.

## Core Rule

Do not store “prompt strings” as the real system.

Store:

- prompt pack metadata
- versioned node prompts
- input schema
- output schema
- fallback model config
- retry policy
- post-processing rules

## Recommended Node Types

Each workflow node should be typed.

### 1. JD Intake Node

Input:

- raw JD text
- optional company metadata

Output:

- normalized job posting object
- extracted company name
- role title
- location
- skills / keywords
- seniority

### 2. Resume Critique Node

Input:

- selected base resume snapshot
- normalized job posting
- instruction pack

Output:

- structured critique
- missing keywords
- weak bullets
- suggested sections to emphasize

### 3. Retrieval Node

Input:

- critique
- base resume
- historical accepted bullets
- optional company history

Output:

- ranked candidate bullets
- ranked section priorities

Use:

- full-text search
- semantic similarity via `pgvector`

### 4. Rewrite Node

Input:

- selected candidate bullets
- critique
- prompt pack

Output:

- `ResumePatch`

### 5. Normalization Node

Input:

- `ResumePatch`

Output:

- validated patch or hard failure

This node is where placement becomes deterministic.

### 6. Fit Node

Input:

- merged resume snapshot
- template rules

Output:

- fit report
- overflow sections
- optional compression suggestions

### 7. ATS Audit Node

Input:

- merged resume snapshot
- rendered PDF or HTML

Output:

- ATS report

### 8. Export Node

Input:

- approved snapshot

Output:

- PDF artifact
- filename
- metadata checksum

## Should You Use Agents?

My recommendation:

- **No**, not as the primary architecture
- **Yes later**, only if your workflows truly need dynamic tool choice

Why:

Your process is mostly predetermined. This matches a workflow system better than an autonomous agent loop.

If you later need agentic research or deeper job/company analysis, add it behind a typed boundary. Do not let it own the main resume generation path.

## Human Review Points

You should explicitly support review at:

- critique accepted or skipped
- patch accepted or partially edited
- fit auto-compression accepted or rejected
- ATS warning acknowledged

This will produce much higher quality than a “single-shot generate resume” flow.

## Prompt Management Design

Use `Langfuse` for:

- prompt templates
- prompt versioning
- labels like `dev`, `staging`, `prod`
- trace linking
- experiment datasets

Use `Promptfoo` for:

- regression suites
- pass/fail assertions
- comparing prompt pack versions
- comparing model choices

### Suggested Prompt Pack Model

A prompt pack should include:

- name
- purpose
- target role family
- global writing instructions
- forbidden phrases / styles
- keyword strategy
- max bullets per section
- max line / section budgets
- model defaults
- fallback model defaults

Store it as versioned configuration, not freeform text in code.

## The Final Guarantee Layer

Your strongest placement guarantee will come from this rule:

**The last AI-facing step never outputs final printable HTML or PDF content.**

It outputs only:

- canonical `ResumePatch` JSON
- or fallback `ResumePatch Markdown`

Then your deterministic system does:

1. parse
2. validate
3. merge
4. render
5. audit
6. export

That is the correct final-layer design.

## Proposed External Paste Format

I recommend a short syntax called `ResumePatch Markdown v1`.

It should be easy enough to ask any external LLM for it.

### Goals

- easy for humans to read
- easy for LLMs to produce
- targets explicit fields
- avoids full-document ambiguity

### Example

```md
RESUME_PATCH: 1
BASE_RESUME: base-frontend
COMPANY: Stripe
ROLE: Senior Frontend Engineer
LOCATION: San Francisco, CA

[set basics.location]
San Francisco, CA

[replace summary]
Frontend engineer focused on performance, product quality, and experimentation at scale.

[replace experience/acme-2022/bullets]
- Built **React/TypeScript** onboarding flows used by 1.2M users and increased activation by 14%.
- Partnered with design and data teams to reduce checkout friction, improving conversion by 9%.

[append skills]
- Experimentation
- Web performance

[notes]
- Keep Education unchanged
- Keep Projects unchanged
```

### Why this is better than asking for a whole resume

- explicit target paths
- smaller surface area for failure
- easier diffs
- easier validation
- easier merge conflict handling

## One-Page Fit Strategy

One-page support should not be a last-minute UI tweak.

Build it as a real subsystem.

### Fit Engine Inputs

- template metrics
- font metrics
- section budgets
- required sections
- optional sections
- bullet importance ranking

### Fit Engine Actions

- swap to shorter approved bullet variants
- shorten summary
- reduce allowed section gap within floor values
- trim least relevant bullets
- move overflow items to an archived/non-print variant

### Fit Engine Rules

- never silently delete content
- every auto-trim is shown as a proposed change
- always preserve an untrimmed snapshot

### Role of `pretext`

Use `pretext` to score candidate fits quickly before the expensive final render.

The actual pass/fail must still come from the real renderer and PDF export.

## Feature List

## V1 Must-Haves

- base resume library
- pinned base resumes
- variant lineage
- one ATS-first template
- JD intake and metadata extraction
- prompt packs
- deterministic `ResumePatch` pipeline
- side-by-side diff review
- live print preview
- one-page fit warnings
- ATS readback report
- PDF export
- searchable application history
- external `ResumePatch Markdown v1` import

## V1.5

- accepted-bullet memory and reuse
- company memory
- prompt pack comparison
- model fallback strategies
- partial auto-fit suggestions
- richer ATS rule explanations

## V2

- multiple templates
- public multi-user accounts
- shared prompt libraries
- advanced evaluation dashboards
- optional agentic company/job research
- premium print engine option

## Suggestions

### Strong recommendation: start narrower than your architecture

Architecture should be flexible.
Product scope should still be narrow.

I would start with:

- 1 user
- 1 ATS-safe template
- 2 or 3 pinned base resumes
- 1 deterministic prompt workflow
- 1 external patch format
- 1 export path

### Strong recommendation: build evaluation data from day one

Whenever you:

- accept a generated bullet
- reject a generated bullet
- manually edit a generated bullet

log that event.

That becomes your best future training/evaluation dataset.

### Strong recommendation: separate company/job metadata from filename

Use a clean filename like:

- `firstname_lastname_rsm_<publicId>.pdf`

Store company, role, job URL, and timestamp in the database, not the filename.

## Risks and Criticisms

### Risk 1: too much AI orchestration too early

If you build a giant node graph before you understand what actually improves outcomes, you will create complexity without value.

Recommendation:

Start with 4-6 nodes, not 15.

### Risk 2: overtrusting semantic search

Retrieval should help rank candidate bullets, not replace human judgment.

### Risk 3: trying to make the ATS template fancy

Your ATS-first template should be boring in the right ways.

Save visual experimentation for later templates.

### Risk 4: letting external LLM outputs bypass normalization

Never do this.

Everything must pass through the same parser, validator, and merge pipeline.

### Risk 5: trying to solve one-page fit only with font shrinking

That degrades output quality fast.

You need content prioritization, not just smaller typography.

## Final Recommendation

Build this as a **typed resume adaptation platform**, not just a resume editor.

The best phase-2 architecture is:

- `Next.js + React + Tiptap` for the UI
- `PostgreSQL + Drizzle + pgvector` for the data layer
- `Trigger.dev` for durable workflow execution
- `Langfuse` for prompt management and traces
- `Promptfoo` for evaluation and regression testing
- shared `HTML/CSS + Playwright` for preview/export
- `pretext` only as a fit-assist and measurement engine
- a canonical `ResumeDoc` plus `ResumePatch` contract as the system-of-record

If you keep that core shape, you can stay personal-use simple now and still grow to a public multi-user product later without a large refactor.

## Sources Consulted

Official/current references reviewed on 2026-03-30:

- [Reactive Resume introduction](https://docs.rxresume.org/getting-started)
- [Reactive Resume project architecture](https://docs.rxresume.org/contributing/architecture)
- [Reactive Resume JSON Resume schema docs](https://docs.rxresume.org/guides/json-resume-schema)
- [Reactive Resume schema endpoint notes](https://rxresu.me/schema.json)
- [Pretext GitHub repository](https://github.com/chenglou/pretext)
- [Trigger.dev docs](https://trigger.dev/docs)
- [Trigger.dev product overview](https://trigger.dev/product)
- [Trigger.dev AI agents / workflows](https://trigger.dev/product/ai-agents)
- [Langfuse overview](https://langfuse.com/docs)
- [Langfuse prompt management](https://langfuse.com/docs/prompt-management/overview)
- [Promptfoo getting started](https://www.promptfoo.dev/docs/getting-started/)
- [Promptfoo command line / eval docs](https://www.promptfoo.dev/docs/usage/command-line/)
- [LangGraph workflows vs agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
- [LangGraph overview](https://docs.langchain.com/oss/javascript/langgraph)
- [JSON Resume docs](https://docs.jsonresume.org/schema)
- [JSON Resume schema site](https://jsonresume.org/schema/)
- [pgvector release and docs index](https://pgxn.org/dist/vector/)
- [PostgreSQL full text search docs](https://www.postgresql.org/docs/current/textsearch.html)
