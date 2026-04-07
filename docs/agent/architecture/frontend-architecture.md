# Frontend Architecture

> Next.js app-router frontend with builder, application-pack review, RenderCV preview, and observability UI.

## Route Map

```text
apps/frontend/app/(default)/
├── dashboard/
├── builder/
├── llm-traces/
├── resumes/[id]/
├── settings/
└── tailor/
```

Other live route:

- `app/print/cover-letter/[id]` for Playwright cover-letter PDF generation

## Current Product Surfaces

### `/dashboard`

- master-resume upload and state tracking
- tailored resume history
- retry-processing for failed uploads
- filtering by company, role, date, and search

### `/tailor`

- job-description entry
- prompt selector backed by `/config/prompts` and `/config/generation-defaults`
- application-pack preview flow
- diff review before confirm

### `/resumes/[id]`

- resume detail view
- RenderCV preview panel
- rename, download, delete
- enrichment entry point for the master resume

### `/builder`

- visual editor and raw YAML editor
- cover-letter and outreach editing
- JD Match tab for tailored resumes
- RenderCV theme, locale, and runtime controls
- autosave, undo/redo, and raw-YAML validation handling

### `/settings`

- provider/model/api-base management
- prompt default selection
- language settings
- system status and danger-zone actions

### `/llm-traces`

- internal observability page for `llm_calls`

## Important Component Areas

| Area | Files |
|------|-------|
| Builder shell | `components/builder/resume-builder.tsx` |
| Resume forms | `components/builder/forms/*` |
| Tailor review | `components/tailor/diff-preview-modal.tsx` |
| RenderCV UI | `components/rendercv/*` |
| LLM observability UI | `components/observability/llm-trace-viewer.tsx` |
| Enrichment UI | `components/enrichment/*` |

## State And Persistence

Context providers:

- `StatusCacheProvider`
- `LanguageProvider`
- `ResumePreviewerContext`

Important local storage keys:

| Key | Purpose |
|-----|---------|
| `master_resume_id` | active master resume |
| `resume_builder_draft` | builder draft snapshot |
| `resume_builder_settings` | RenderCV theme settings snapshot |
| `resume_builder_raw_yaml` | raw YAML sections in builder |
| `resume_tailor_generation_defaults` | local mirror of latest tailor defaults |
| `resume_builder_ui_layout` | builder pane mode and split ratio |

## Rendering Truth

- RenderCV preview artifacts are the current rendering truth for saved preview and resume PDF work.
- The older React resume components still exist in the repo for UI features such as JD highlighting and legacy preview logic, but they are not the authoritative output path for the current product.
