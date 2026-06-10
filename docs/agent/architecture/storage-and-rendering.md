# Storage And Rendering

> Current persistence model and the RenderCV artifact pipeline.

## Storage Layers

### SQL layer

Source of truth:

- `apps/backend/app/db/models.py`
- `apps/backend/app/db/repositories/*`
- Alembic revisions in `apps/backend/alembic/versions/`

### Compatibility layer

`apps/backend/app/database.py`:

- wraps repository calls
- serializes ORM rows into dict payloads
- preserves the older `db.*` call style used by routers and services

### Config layer

`apps/backend/data/config.json` persists:

- provider/model/api-base settings
- prompt defaults
- generation defaults
- critique toggle
- per-step model overrides
- language settings
- API key maps

## RenderCV Pipeline

Resume rendering path:

1. resume JSON -> `rendercv_adapter.resume_to_rendercv_payload()`
2. payload -> YAML / Typst / PDF / PNG generation in `rendercv_engine.render_resume_bundle()`
3. files -> `artifact_service.store_rendercv_bundle()`
4. metadata rows -> `artifacts` table

Common artifact kinds:

- `rendercv_yaml_snapshot`
- `rendercv_typst`
- `resume_pdf`
- `resume_preview_png`
- `rendercv_markdown`
- `rendercv_html_debug`

## Theme Settings

Canonical runtime type:

- backend: `rendering/theme_profiles.py::RenderThemeSettings`
- frontend: `lib/types/render-theme.ts::RenderThemeSettings`

Important behavior:

- theme settings can be stored in a legacy flat format or the newer `theme_profiles` shape
- query-param based resume PDF and preview endpoints still map old controls through `legacy_to_theme_settings()`
- raw YAML edits are converted back into `RenderThemeSettings` through `theme_settings_from_rendercv_sections()`

## Draft Normalization Cycle

The raw-YAML builder works as a round-trip system:

1. structured resume + theme settings -> YAML sections (including app-only **metadata**)
2. user edits YAML
3. backend parses RenderCV sections (`cv`, `design`, `locale`, `settings`) back into resume data + theme settings; parses **`metadata`** separately (`services/cv_metadata.py`) for dashboard targets and bold keyword list
4. validation errors include section, line, column, and optional path (`metadata` is a valid section key for errors)

**Fifth section `metadata` (non-RenderCV):** persisted as `yaml_sections.metadata` and duplicated on `resumes.cv_metadata` (TEXT YAML). Root key must be `metadata:` with `role`, `company`, `location`, `bold_keywords`. Not passed to RenderCV CLI; used for list/dashboard targets and runtime bolding.

Endpoints:

- `POST /api/v1/resumes/draft/normalize`
- `POST /api/v1/resumes/draft/render-preview`
- `PATCH /api/v1/resumes/{resume_id}/draft`

## Playwright PDF Usage

Playwright is no longer the resume PDF backend.

It is still used for:

- cover-letter PDF generation
- generic document-PDF compatibility helpers in `app/pdf.py`
