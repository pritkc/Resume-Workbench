# Frontend Workflow

> Current user and state flows across dashboard, tailor, viewer, and builder.

## Core Product Loop

```text
Dashboard
  -> upload master resume
  -> Tailor page preview
  -> diff review + application-pack preview
  -> confirm tailored resume
  -> Resume viewer
  -> Builder for edits, YAML, RenderCV preview, cover letter, outreach, JD match
```

## Tailor Flow

1. Load master resume id from `localStorage`.
2. Fetch prompt options and generation defaults.
3. Upload the job description with `POST /jobs/upload`.
4. Preview via `POST /application-packs/preview`.
5. Show diff review modal.
6. Confirm via `POST /application-packs/confirm`.
7. Navigate to `/resumes/[id]`.

Important current behavior:

- preview creates an application pack and preview artifacts before a tailored resume exists
- preview response carries `request_id`, which is also used as the trace id for `/llm-traces`

## Viewer Flow

`/resumes/[id]` loads:

- processed resume data
- title
- theme settings
- RenderCV preview artifacts on demand

Master resumes expose enrichment. Tailored resumes expose JD Match once opened in the builder.

## Builder Flow

The builder has two editing modes for the resume tab:

- visual form editing
- raw RenderCV YAML editing across `cv`, `design`, `locale`, and `settings`

Other important behavior:

- autosaves draft changes
- supports undo/redo history
- keeps raw YAML and structured data in sync through normalize/save endpoints
- refreshes RenderCV preview from the same draft payload shape used for persistence
- manages cover-letter and outreach edit/generate flows

## Settings Flow

Settings owns:

- provider/model/api-base state
- prompt-default state
- language preferences
- system-health checks
- destructive actions like clearing keys or resetting the database

## Observability Flow

The application-pack panel links into `/llm-traces` with:

- `trace_id`
- `request_scope=resumes.improve_preview`

That is the quickest way to inspect a broken preview or a suspicious prompt result.
