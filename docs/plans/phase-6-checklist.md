# Phase 6 Implementation Checklist

Updated: 2026-04-01

This file tracks the executable implementation plan for the Phase 6 architecture.

## Milestone 1: Repo and Environment Foundation

Status: Completed

- [x] create dedicated implementation branch from `Resume-Matcher`
- [x] keep this planning repo as architecture/reference workspace
- [x] add Postgres to local dev stack
- [x] add SQLAlchemy and Alembic
- [x] confirm backend and frontend still boot

Milestone 1 test cases:

- [x] backend dependency sync completes on Python 3.13
- [x] backend module compile succeeds
- [x] backend test suite remains green
- [x] frontend test suite remains green
- [x] frontend production build succeeds

Milestone 1 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv sync --python 3.13 --extra dev`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npm test`
- [x] `npx next build --webpack`

## Milestone 2: Storage Migration

Status: Completed

- [x] define SQLAlchemy models
- [x] create initial Alembic migration
- [x] replace TinyDB repositories
- [x] migrate resume CRUD endpoints to Postgres
- [x] migrate job storage to Postgres
- [x] migrate improvement history to generation runs

Milestone 2 test cases:

- [x] repository tests cover resume/job/generation-run CRUD
- [x] reset flow clears relational tables and local artifacts
- [x] existing resume/job API integration tests still pass

Milestone 2 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npm test`

## Milestone 3: RenderCV Integration

Status: Completed

- [x] add `rendercv[full]` dependency
- [x] implement RenderCV adapter
- [x] implement theme profile mapping
- [x] generate YAML snapshots from internal resume JSON
- [x] compile PNG preview successfully
- [x] compile PDF successfully
- [x] store preview and PDF artifacts

Milestone 3 test cases:

- [x] adapter tests validate classic and moderncv snapshots
- [x] engine tests verify artifact discovery from RenderCV output
- [x] artifact API tests return generated preview/PDF assets

Milestone 3 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest tests/unit/test_rendercv_adapter.py tests/unit/test_rendercv_engine.py tests/integration/test_artifacts_api.py tests/unit/test_sql_storage.py`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npm test`

## Milestone 4: Application Pack Orchestration

Status: Completed

- [x] implement critic pass
- [x] implement diff-based tailor pass
- [x] implement validation pass
- [x] unify cover letter and outreach generation into one pack run
- [x] create preview endpoint
- [x] create confirm endpoint

Milestone 4 test cases:

- [x] preview orchestration test records generation run and artifacts
- [x] confirm flow persists tailored resume fork and application pack
- [x] unsupported claims are stripped by validation guard

Milestone 4 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest tests/integration/test_application_packs_api.py`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npm test`

## Milestone 5: Frontend Replacement Layer

Status: Completed

- [x] add RenderCV preview panel
- [x] add application pack panel
- [x] replace formatting controls with RenderCV theme controls
- [x] wire preview endpoint to tailor flow
- [x] wire confirm endpoint to final artifact actions

Milestone 5 test cases:

- [x] tailor flow displays diff plus RenderCV preview artifacts
- [x] resume viewer downloads RenderCV-backed PDF
- [x] theme control changes refresh preview request payloads

Milestone 5 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npm test`
- [x] `npx next build --webpack`

## Milestone 6: Cleanup and Stabilization

Status: Completed

- [x] remove old React resume template renderer
- [x] remove old resume print route
- [x] remove old CSS template settings model
- [x] keep cover letter and outreach editors
- [x] add adapter, orchestration, and preview tests

Milestone 6 test cases:

- [x] no production path depends on old resume print route
- [x] no production path depends on CSS template settings
- [x] global regression suite passes end to end

Milestone 6 verification log:

- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 python -m compileall app`
- [x] `UV_CACHE_DIR=/tmp/uv-cache uv run --python 3.13 pytest`
- [x] `npx vitest run tests/download-utils.test.ts tests/diff-preview-modal.test.tsx tests/tailor-page.test.tsx tests/resume-viewer.test.tsx tests/regenerate-wizard.test.tsx`
- [x] `npx next build --webpack`
- [x] `rg -n "template-settings" 'app/(default)' components/builder/resume-builder.tsx 'app/(default)/resumes/[id]/page.tsx' 'app/(default)/tailor/page.tsx`

## Global Acceptance Suite

- [x] master resume can be uploaded, parsed, edited, and saved
- [x] JD paste can generate a preview application pack
- [x] diff review can be confirmed into a tailored fork
- [x] cover letter and outreach message are generated with the same run
- [x] RenderCV preview and PDF come from the same stored snapshot
- [x] artifacts can be downloaded by ID
- [x] application history is queryable by company, role, and date
