# Architecture

## System overview

```mermaid
flowchart TB
    Browser["Browser"] --> Next["Next.js 16"]
    Next -->|same-origin proxy| FastAPI["FastAPI"]
    FastAPI --> SQLAlchemy["SQLAlchemy repositories"]
    SQLAlchemy --> Postgres[("PostgreSQL")]
    FastAPI --> Services["Resume and application services"]
    Services --> LiteLLM["LiteLLM"]
    LiteLLM --> Providers["Configured AI provider"]
    Services --> RenderCV["RenderCV"]
    RenderCV --> Files["PDF, PNG, YAML, Typst"]
    Services --> Traces["Generation runs and LLM calls"]
    Traces --> Postgres
    Files --> ArtifactRows["Artifact records"]
    ArtifactRows --> Postgres
```

## Frontend

`apps/frontend` is a Next.js App Router application.

- Dashboard manages the active resume and tailored copies.
- Builder edits structured content, RenderCV settings, cover letters, and outreach.
- Tailor streams generation progress and shows the diff before confirmation.
- Settings controls providers, prompts, model overrides, and language.
- LLM traces expose generation evidence and timing.

## Backend

`apps/backend` is a FastAPI application.

- Routers define the HTTP API.
- Services own parsing, tailoring, validation, rendering, and auxiliary writing.
- Repository classes isolate database access.
- Pydantic schemas define request and response contracts.
- Alembic migrations version the PostgreSQL schema.

## Resume rendering

Structured resume JSON is converted to a RenderCV payload, rendered into a bundle, stored on disk, and recorded in the artifacts table. Resume preview and PDF output use this same pipeline so the preview matches the exported document.

## Tailoring flow

```mermaid
sequenceDiagram
    participant UI as Tailor UI
    participant API as FastAPI
    participant AI as AI provider
    participant DB as PostgreSQL
    participant R as RenderCV

    UI->>API: Job description + active resume
    API->>AI: Extract job context
    API->>AI: Generate compact resume changes
    API->>API: Validate and apply changes locally
    API->>R: Render preview artifacts
    API->>DB: Store run, calls, and proposed pack
    API-->>UI: Diff, preview, warnings, trace ID
    UI->>API: Confirm
    API->>DB: Save tailored resume and application pack
```

## Source-of-truth rules

- PostgreSQL is the source of truth for application records.
- RenderCV is the source of truth for resume document output.
- `additional.groups` is the canonical flexible additional-section shape.
- Prompt source files live under `apps/backend/app/prompts/text`.
- LLM trace rows are the evidence layer for model calls.

The detailed engineering handbook is in [agent/README.md](agent/README.md).
