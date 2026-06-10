# Feature Guide

## Master resume

Resume Workbench keeps one active resume as the reusable source for future applications.

- Upload PDF, DOC, or DOCX files.
- Parse content into structured resume data.
- Edit fields directly in the visual builder.
- Switch to raw RenderCV YAML for advanced control.
- Add custom sections and grouped skills.
- Preview and export without losing the structured source.

## Tailoring

The Tailor workflow accepts a job description and creates a proposed resume change set.

1. Extract useful job context.
2. Generate a compact set of resume changes.
3. Apply and validate those changes locally.
4. Show the before-and-after diff.
5. Save a new tailored resume only after confirmation.

Full mode can run deeper critique and rewriting. Lite mode uses a smaller, faster generation path.

## Application packs

An application pack connects one job with:

- the tailored resume
- the original job description
- generated resume artifacts
- cover letter and outreach content
- saved application questions and answers
- generation run and trace identifiers

## Rendering

RenderCV is the source of truth for resume output.

- multiple theme profiles
- page and margin controls
- typography, color, spacing, and section settings
- locale phrases and month names
- PDF, PNG, YAML, Typst, Markdown, and HTML debug artifacts

Cover-letter PDFs use the dedicated frontend print route and Playwright.

## Prompt controls

The prompt catalog exposes shipped prompt sections, shared rules, variables, and response contracts. Local overrides can be applied without modifying the original prompt files.

## Observability

LLM calls are stored with operation names, models, timing, request scope, token estimates, and response metadata. The trace viewer groups calls into end-to-end workflows for debugging quality and latency.

## Enrichment

The enrichment workflow can ask targeted questions, improve selected entries, and regenerate individual resume items while preserving the rest of the resume.
