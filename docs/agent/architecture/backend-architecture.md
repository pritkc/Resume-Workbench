# Backend Architecture

> FastAPI + LiteLLM + SQLAlchemy/Alembic + RenderCV

## High-Level Shape

The backend is organized around a compatibility layer:

- new persistence lives in `app/db/*`
- most business logic still calls `db.*` from `app/database.py`
- `app/database.py` serializes SQLAlchemy models back into the older dict-style interface used by routers and services

That means new schema work should happen in SQLAlchemy repositories and Alembic, even if routers still read like legacy code.

## Key Directories

```text
apps/backend/app/
├── main.py
├── config.py
├── llm.py
├── database.py
├── db/
│   ├── base.py
│   ├── models.py
│   ├── session.py
│   └── repositories/
├── prompts/
├── rendering/
├── routers/
├── schemas/
└── services/
```

## Router Surface

| Router | Purpose |
|--------|---------|
| `health.py` | health and status |
| `config.py` | LLM config, language, prompt defaults, generation defaults, API keys, reset |
| `jobs.py` | job-description upload and retrieval |
| `resumes.py` | upload, draft normalize/save, tailor flows, RenderCV preview/PDF, title and auxiliary content |
| `application_packs.py` | preview/confirm wrappers and pack listing |
| `artifacts.py` | artifact download |
| `llm.py` | LLM trace listing and summaries |
| `themes.py` | theme option listing |
| `enrichment.py` | resume enrichment and regenerate flows |

## Storage Model

Primary SQL tables:

- `users`
- `resumes`
- `jobs`
- `application_packs`
- `generation_runs`
- `artifacts`
- `llm_calls`

Important relationships:

- a master or tailored resume lives in `resumes`
- a job description lives in `jobs`
- preview/confirm flows create `application_packs`
- each pack stage creates a `generation_run`
- RenderCV outputs are stored as `artifacts`
- every LLM attempt can create an `llm_call`

## Live Service Responsibilities

| Module | Responsibility |
|--------|----------------|
| `services/parser.py` | PDF/DOCX -> markdown -> structured resume JSON |
| `services/improver.py` | job keyword extraction, primary full tailoring prompt, prompt contract shaping, local verifier, resume diff summaries |
| `services/refiner.py` | local AI-phrase cleanup and master-alignment helpers; older keyword-injection prompt retained but not used in the active tailoring path |
| `services/cover_letter.py` | cover letter, outreach, and local title generation |
| `services/additional_groups.py` | canonical additional-group normalization |
| `services/artifact_service.py` | persist RenderCV bundle files and create artifact rows |

## Rendering Model

Resume rendering now flows through:

1. `rendercv_adapter.py`
2. `rendercv_engine.py`
3. `artifact_service.py`

Outputs commonly include:

- YAML snapshot
- Typst source
- PDF
- PNG preview images
- markdown snapshot
- HTML debug snapshot

Playwright in `app/pdf.py` still exists for non-resume documents, especially cover-letter PDFs.

## LLM Model

Top-level request flows create trace context with `llm_trace_scope()`, then nested calls use:

- `complete_json()` for structured outputs
- `complete()` for plain text

Those attempts persist to `llm_calls`, including retries, finish reasons, token usage, estimated costs, and previews.
