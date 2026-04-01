# Resume Workbench

This repository is the active project root for the resume builder work.

## Layout

- `apps/`
  - active application code copied into the root repo
- `tests/`
  - project test coverage
- `docs/plans/`
  - phase-by-phase architecture and execution plans
- `docs/research/`
  - comparison notes and supporting research
- `reference/`
  - local upstream/source repos kept for analysis and benchmarking
  - intentionally not tracked by this root git repo

## Planning Docs

- `docs/plans/resume-plan.md`
- `docs/plans/resume-plan-phase2.md`
- `docs/plans/resume-plan-phase3.md`
- `docs/plans/resume-plan-phase4.md`
- `docs/plans/phase-5.md`
- `docs/plans/phase-6.md`
- `docs/plans/phase-6-checklist.md`
- `docs/plans/phase-6-global-test-cases.md`

## Working Approach

- Run `git status`, `git add`, `git commit`, and future implementation work from this root repo.
- Treat `reference/` as local source material only, not as part of this repo's history.
- Build on the Resume-Matcher foundation in the root codebase, with RenderCV integrated as the renderer and the planning docs as the source of truth.
