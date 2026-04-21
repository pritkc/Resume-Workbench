# Planning documents

This folder holds **phase plans**, **design explorations**, and **historical checklists** for the Resume Workbench fork. Treat them as **engineering narrative**, not as guaranteed current behavior—always verify against code and [docs/agent/README.md](../agent/README.md).

## Where to start

| Doc | Role |
|-----|------|
| [phase-6-checklist.md](phase-6-checklist.md) | High-level completion checklist for the storage / Postgres migration era |
| [phase-6.md](phase-6.md) | Phase 6 umbrella plan |
| [resume-plan.md](resume-plan.md) | Early multi-phase roadmap (may reference superseded stack details) |

## Naming

- **`phase-3.x*`** — Prompt, UI, CLIProxy, and feature refactors. Multiple files with similar names (e.g. `phase-3.7.1-*-Opus` vs `-codex`) are **parallel writeups**; newer work may supersede older drafts.
- **Typo rename:** `phase-3.5.1-additional-questions-feature-design.md` (formerly `additonal` in the filename).

## Historical accuracy

Older plans may mention **`templates.py`**, **TinyDB**, or **absolute machine paths**. The live codebase uses **split prompt modules** under `apps/backend/app/prompts/`, **Postgres + SQLAlchemy**, and **repo-relative** paths in new docs.
