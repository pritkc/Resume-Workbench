# Phase 3.12.1 — Documentation, Agent Onboarding, and Deprecation Cleanup

> **Purpose:** After a large divergence from `upstream/main` (348 files touched in `upstream/main...HEAD` at time of writing), the repository still carries **stale upstream assumptions** (TinyDB, old prompt layout, wrong skill paths), **contradictory user-facing setup docs**, **typo’d root docs**, and **overlapping planning documents**. This plan lists **every file area to touch** and **what to do**, so implementers can execute in focused PRs without missing stragglers.

> **Success criteria:** A new coding agent (or human) can read **`docs/agent/README.md`**, run **`docs/agent/quickstart.md`**, and trust that **setup, architecture, and “where prompts live”** match the code. Deprecated paths are **labeled, consolidated, or removed** without breaking builds.

---

## 1. Baseline and how to re-audit

- **Upstream reference:** `upstream/main` (merge base used for the fork’s work).
- **Regenerate the changed-file list anytime:**
  ```bash
  git fetch upstream
  git diff --name-only upstream/main...HEAD
  ```
- **Approximate scale:** ~348 paths changed vs upstream; tens of thousands of insertions. Cleanup is **mostly documentation and dependency hygiene**, not a rewrite of product code—unless a review finds **dead code** safe to delete.

---

## 2. Critical factual errors to fix first (cross-cutting)

These are **verified contradictions** between docs and the current tree:

| Issue | Where it appears | Correct direction |
| --- | --- | --- |
| **TinyDB described as the database** | `SETUP.md` (Database Management + Project Structure), `.github/skills/*`, `.github/agents/*`, `.github/copilot-instructions.md`, `.github/prompts/backend-dev.prompt.md` | Backend persistence is **Postgres + SQLAlchemy + Alembic**; `app/database.py` is a **compatibility façade** over repositories (see `docs/agent/scope-and-principles.md`). **Remove or archive TinyDB** as a *current* stack item everywhere. |
| **`tinydb` still in Python deps** | `apps/backend/pyproject.toml`, `apps/backend/requirements.txt` | **No `import tinydb`** in `apps/backend/**/*.py`. Plan: **drop `tinydb` from dependencies** after `uv lock` / tests; fix the lone stale comment in `apps/backend/app/routers/resumes.py` (`TinyDB doesn't have…`). |
| **Docs still point at `app/prompts/templates.py`** | Same files as below | Versus `upstream/main`, **`templates.py` was deleted** and prompts were split across **`apps/backend/app/prompts/*.py`** (`tailor_resume_full.py`, `parse_resume.py`, `_prompt_loader.py`, etc.). **Replace every `templates.py` reference** with the real module map + `llm-prompt-inventory.md`. |
| **Skill path `.agents/skills/...` does not exist** | `.claude/skills/codebase-navigator/SKILL.md` (and any copy) | Scripts live under **`.github/skills/codebase-navigator/scripts/`** (verify); update paths so agents do not hit dead instructions. |
| **i18n docs vs code** | `docs/agent/features/i18n.md`, `docs/agent/features/i18n-preparation.md` vs `apps/frontend/i18n/config.ts` (`English only`) vs `apps/frontend/messages/*.json` (multiple locales present) | **Reconcile:** document the *actual* runtime behavior (single active locale vs files kept for future use). Merge or clearly mark one file as **archive**. |
| **README uses machine-absolute paths** | `README.md` | Replace `/Users/.../resume-workk/...` with **repo-relative** paths (`apps/frontend`, etc.). |
| **Root `package.json` metadata** | `package.json` | `description` is invalid HTML; `repository`/`homepage` still point at **upstream** repo—decide **fork URL** or neutral wording for this workspace. |

---

## 3. Root repository (`/`)

| File / area | Action |
| --- | --- |
| `README.md` | Remove absolute paths; keep “Resume Workbench” positioning; ensure links to `SETUP.md` and `docs/agent/` are consistent; optionally add a short **“For AI agents: start at docs/agent/README.md”** blurb. |
| `package.json` | Fix `description`; align `repository` / `bugs` / `homepage` with **this** fork or mark as unofficial fork; keep `test:e2e` script as-is unless Playwright config changes. |
| `package-lock.json` | No change unless `package.json` changes. |
| `playwright.config.ts`, `tests/*.spec.ts`, `tests/playwright-fixtures.ts` | Doc-only cross-link from `docs/agent/quickstart.md` if any port/URL assumptions differ; otherwise **verify** E2E env vars match docs (`E2E_FRONTEND_URL` in `package.json` script). |
| `Makefile` | Already minimal (CLIProxy helpers). **Optional:** add commented pointer to `docs/plans/phase-3.6.2-CLIProxyAPI-technical-flow.md` for discoverability—only if you want Makefile self-documenting. |
| `docker-compose.yml` | Already Postgres-centric; **no TinyDB**. Ensure `SETUP.md` troubleshooting (PDF / `FRONTEND_BASE_URL`) stays aligned with compose env vars. |
| `orchastration.md` | **Rename** to `orchestration.md` (fix typo) **or** move content to `docs/agent/architecture/backend-orchestration-flow.md` and replace root file with a one-line pointer. **Update all internal links** (if any) and add entry from `docs/agent/README.md`. Content is valuable but misplaced at repo root. |
| `scripts/sync-upstream-references.sh`, `scripts/cliproxy-health.sh`, `scripts/capture-builder-section-screenshots.cjs` | Confirm each is referenced from `SETUP.md`, `Makefile`, or internal docs; add **“Purpose”** one-liner to `docs/agent/README.md` or `docs/agent/workflow.md` if missing. |
| `infra/cliproxyapi/*` | Document relationship to Option C in `SETUP.md` (already partially there); no code change unless config template drifts. |

---

## 4. User-facing setup and localized READMEs

| File | Action |
| --- | --- |
| `SETUP.md` | **Replace** “TinyDB / `apps/backend/data/`” database section with **Postgres**: `docker compose up -d postgres`, `DATABASE_URL`, `uv run alembic upgrade head`, backup/restore via `pg_dump` / volume—not JSON files. **Replace** project tree lines that say `database.py` is TinyDB and `data/` is DB storage. **Align** copy instructions: canonical file is ambiguous today—see §8. |
| `SETUP.es.md`, `SETUP.ja.md`, `SETUP.zh-CN.md` | Mirror **the same structural fixes** as English (TinyDB → Postgres, tree diagram, troubleshooting). |
| `README.md` (root) | Same as §3; ensure “Setup Docs” still points to `SETUP.md` after edits. |
| `README.es.md`, `README.ja.md`, `README.zh-CN.md` | Scan for TinyDB / old architecture / upstream-only URLs; align with root `README.md` intent. |

---

## 5. `docs/agent/` — canonical agent handbook (full file list)

**Goal:** One coherent story: stack, flows, prompts, PDF pipelines, i18n, design references.

### 5.1 Index and cross-cutting

| File | Action |
| --- | --- |
| `docs/agent/README.md` | Refresh **Current Truths** (RenderCV, application-packs, LLM traces, `additional.groups`). **Expand** “Start Here” to include **`design/`** with explicit **archive vs live** labels. Fix any **`templates.py`** mention. Add pointer to relocated **`orchestration`** doc if moved from root. |
| `docs/agent/quickstart.md` | Confirm **Node** / **Next** versions against `apps/frontend/package.json`. Align **Python version** with `docs/agent/coding-standards.md` (both should match `apps/backend/.python-version` / `pyproject`). Confirm `.env` copy path matches §8. |
| `docs/agent/scope-and-principles.md` | Keep as north star; verify no stale “retired” claims need updating (e.g. print routes). |
| `docs/agent/workflow.md` | Ensure branch/PR expectations match this fork; link to Playwright and migration commands if agents are expected to run them. |
| `docs/agent/coding-standards.md` | **Fix:** Python version line, **remove `templates.py`**, describe real prompt modules, keep `pdf.py` asyncio note only if still accurate. |

### 5.2 LLM and observability

| File | Action |
| --- | --- |
| `docs/agent/llm-integration.md` | Replace `templates.py` table with **module map**; align with `app/llm.py` trace scopes. |
| `docs/agent/llm-prompt-inventory.md` | Full pass: inventory must list **actual files** under `app/prompts/`. |
| `docs/agent/llm-observability.md` | Ensure `/llm-traces` and DB table names match `app/db/models.py`. |

### 5.3 APIs

| File | Action |
| --- | --- |
| `docs/agent/apis/api-flow-maps.md` | Keep “legacy improvement” wording where API still does that; add note that **`POST /resumes/improve`** may be **deprecated for product** but still documented for API completeness. **Cover-letter PDF** flow: confirm `build frontend print URL` still matches `app/pdf.py` + `app/print/...` routes. |
| `docs/agent/apis/backend-requirements.md` | Audit env vars vs `app/config.py`. |
| `docs/agent/apis/front-end-apis.md` | Audit `lib/api/*` vs document. |

### 5.4 Architecture

| File | Action |
| --- | --- |
| `docs/agent/architecture/backend-architecture.md` | Remove TinyDB implications; clarify SQLAlchemy as source of truth; **`pdf.py`** scope for cover letter vs RenderCV for resume. |
| `docs/agent/architecture/backend-guide.md` | **Remove `templates.py` references**; update router/prompt pointers. |
| `docs/agent/architecture/frontend-architecture.md` | Add **`/run-timing`** if it remains a supported surface; verify route list matches `apps/frontend/app/(default)/*/page.tsx`. |
| `docs/agent/architecture/frontend-workflow.md` | Align with builder/tailor flows. |
| `docs/agent/architecture/storage-and-rendering.md` | RenderCV artifact dirs, Alembic, no TinyDB. |
| `docs/agent/architecture/nextjs-critical-fixes.md` | Verify against **installed Next** version and `nextjs-performance` / `react-patterns` skills. |

### 5.5 Features

| File | Action |
| --- | --- |
| `docs/agent/features/application-packs.md` | Match `application_packs` router behavior. |
| `docs/agent/features/additional-groups-and-raw-yaml.md` | Match `additional_groups` service + builder UI. |
| `docs/agent/features/enrichment.md` | Match enrichment router + UI folder. |
| `docs/agent/features/custom-sections.md` | Verify against schema. |
| `docs/agent/features/jd-match.md` | Verify JD comparison components still accurate. |
| `docs/agent/features/resume-templates.md` | Clarify React resume components vs RenderCV; **`pdf.py`** for cover letter. |
| `docs/agent/features/adding-resume-templates.md` | Already marked historical in README—add YAML front matter **“Status: archive”** or merge into `resume-templates.md`. |
| `docs/agent/features/i18n.md` | Reconcile with **`i18n/config.ts`** and `messages/*`; fix **`templates.py`** path; update “two language settings” if UI changed. |
| `docs/agent/features/i18n-preparation.md` | Either **merge into `i18n.md`** or mark **superseded** with link. |

### 5.6 Design (`docs/agent/design/`)

| File | Action |
| --- | --- |
| `design-system.md`, `style-guide.md`, `swiss-design-system-prompt.md` | Mark as **design reference**; ensure no conflicting tokens vs `globals.css`. |
| `template-system.md`, `pdf-template-guide.md`, `print-pdf-design-spec.md`, `resume-template-design-spec.md` | Clarify **RenderCV** vs legacy React; cross-link `storage-and-rendering.md`. |
| `design/templates/swiss-single-spec.md`, `design/templates/swiss-two-column-spec.md` | Keep as **PDF/layout specs**; ensure naming matches theme IDs in code. |

### 5.7 `docs/agent` files unchanged vs `upstream/main` (still require audit)

`git diff upstream/main...HEAD` does **not** list these paths, which means they match upstream text but the **product code on this branch has moved on**. They must be read for drift and updated like the rest of the handbook.

| File | Why audit |
| --- | --- |
| `docs/agent/architecture/nextjs-critical-fixes.md` | Next.js version and app-router patterns may differ from `apps/frontend/package.json`. |
| `docs/agent/features/i18n.md` | Must match `apps/frontend/i18n/config.ts` and actual translation loading. |
| `docs/agent/features/i18n-preparation.md` | Merge or mark superseded; avoid two competing i18n stories. |
| `docs/agent/design/design-system.md` | Cross-check with builder and `globals.css`. |
| `docs/agent/design/style-guide.md` | Same. |
| `docs/agent/design/swiss-design-system-prompt.md` | Same; used when generating UI. |
| `docs/agent/design/template-system.md` | RenderCV + theme profiles vs prose. |
| `docs/agent/design/pdf-template-guide.md` | PDF pipeline accuracy. |
| `docs/agent/design/print-pdf-design-spec.md` | Same. |
| `docs/agent/design/resume-template-design-spec.md` | Same. |
| `docs/agent/design/templates/swiss-single-spec.md` | Theme/template IDs. |
| `docs/agent/design/templates/swiss-two-column-spec.md` | Theme/template IDs. |

---

## 6. `.github/` — agents, skills, Copilot, prompts

| Path | Action |
| --- | --- |
| `.github/agents/backend-dev.agent.md` | Replace TinyDB with **Postgres/SQLAlchemy**; fix `database.py` description. |
| `.github/agents/fastapi.agent.md` | **Remove** “TinyDB, not SQLAlchemy”—opposite of reality. |
| `.github/agents/full-stack.agent.md` | Same stack fix. |
| `.github/agents/frontend-dev.agent.md`, `react-patterns.agent.md`, `tailwind-patterns.agent.md`, `codebase-navigator.agent.md` | Scan for upstream-only or TinyDB mentions. |
| `.github/skills/backend-dev/SKILL.md` | Rewrite for **SQLAlchemy repos**, Alembic, no TinyDB. |
| `.github/skills/fastapi/SKILL.md` | Same. |
| `.github/skills/full-stack/SKILL.md` | Same. |
| `.github/skills/codebase-navigator/SKILL.md` | Fix **`database.py`** line; fix **script paths** if wrong. |
| `.github/prompts/backend-dev.prompt.md` | Remove TinyDB. |
| `.github/copilot-instructions.md` | Fix `database.py` bullet and any storage description. |
| `.github/workflows/playwright.yml` | Ensure paths and branch filters match this repo’s E2E layout. |
| `.github/CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `ISSUE_TEMPLATE/*` | Light pass for upstream URLs vs fork. |

---

## 7. `.claude/` and Cursor skills (parallel copies)

| Path | Action |
| --- | --- |
| `.claude/skills/codebase-navigator/SKILL.md` | Fix **`.agents/skills` → actual script location**; fix TinyDB line. |
| `.claude/skills/fastapi/SKILL.md` | Align with `.github` version after edits (consider **single source** long-term: symlink or doc that one is canonical). |
| Other `.claude/skills/*` | Diff against `.github/skills/*` where names match; **propagate** backend stack corrections to avoid Cursor vs GitHub agent drift. |

**Policy recommendation (for plan execution):** After edits, add **`docs/agent/README.md` bullet**: “Skills: prefer `.claude/skills` in Cursor; `.github/skills` for GitHub Copilot agents—keep them in sync.”

---

## 8. Backend environment templates

| File | Action |
| --- | --- |
| `apps/backend/.env.example` | Used by `SETUP.md` quick start. |
| ~~`apps/backend/.env.sample`~~ | **Removed** — canonical template is **`apps/backend/.env.example`** (see `docs/agent/quickstart.md`). |
| **Decision** | **Pick one canonical name** (` .env.example` is common in SETUP; `quickstart` uses `.sample`). Either: (a) **delete/merge** duplicates with a short note in `SETUP.md` + `quickstart.md`, or (b) keep both identical via generation script—**document the choice** in `docs/agent/quickstart.md`. |

---

## 9. Dependency and comment cleanup (code)

| File | Action |
| --- | --- |
| `apps/backend/pyproject.toml` | Remove **`tinydb`** if unused; run `uv lock` and tests. |
| `apps/backend/requirements.txt` | Either **delete** (if fully replaced by `uv`/`pyproject`) or **regenerate** from lock for downstream consumers—**document** which install path is canonical in `SETUP.md`. |
| `apps/backend/app/routers/resumes.py` | Update misleading **TinyDB** comment on IDs to **SQL/Postgres** semantics. |

---

## 10. `docs/plans/` — planning archive strategy

**Problem:** 46+ plan files; many are **historical design iterations** (multiple `phase-3.7.1-*`, `phase-3.11.*` composer/codex/opus variants). They are valuable but noisy.

| Action | Detail |
| --- | --- |
| Add `docs/plans/README.md` | Index **canonical phases** vs **superseded exploratory docs**; link to `phase-6-checklist.md` for completion tracking. |
| Typo fix | Rename or add redirect note: `phase-3.5.1-additonal-questions-feature-design.md` → consider fixing filename in a dedicated PR (git mv) to avoid broken links—grep references first. |
| Absolute paths | Files like `phase-3.2-repair-llm-pipe.md` embed `/Users/...` links—**replace with repo-relative paths** in a cleanup pass. |
| Mark completion | Where work is done (e.g. Postgres migration), add one-line **banner** at top: “Status: completed / superseded by …”. |

**Do not delete** wholesale without review—prefer **index + status banners**.

---

## 11. Frontend notes (doc alignment only)

| Topic | Action |
| --- | --- |
| `apps/frontend/lib/i18n/messages.ts` | Only registers `en` while `messages/` has more JSON—**document intentional partial rollout** or wire remaining locales—product decision; minimum is **honest docs**. |
| `@deprecated` in `apps/frontend/lib/utils/additional-groups.ts` | Keep until removal story exists; **docs/agent/features/additional-groups-and-raw-yaml.md** should mention deprecation timeline if any. |

---

## 12. Optional follow-ups (out of strict doc scope)

- **Dead code hunt:** After docs are truthful, run coverage / unused export analysis on `apps/frontend/components/resume/*` (React templates) and confirm what is still required for JD highlighting vs removable.
- **API deprecation:** If `POST /api/v1/resumes/improve` is truly legacy, add **OpenAPI summary deprecation** + agent doc note.

---

## 13. Suggested execution order (PR-sized)

1. **Deps:** remove `tinydb`, fix comment in `resumes.py`, refresh locks.
2. **Agent handbook:** `docs/agent/README.md`, `coding-standards.md`, `llm-*.md`, `backend-guide.md`, `i18n*.md`, `api-flow-maps.md`.
3. **SETUP + localized SETUP/README.**
4. **`.github/` and `.claude/skills/`** stack strings + paths.
5. **Root:** `README.md`, `package.json`, `orchastration.md` rename/move.
6. **`docs/plans/`** index + relative links + banners.

---

## 14. Appendix — files changed vs `upstream/main` (inventory)

The following is the **complete** path list from `git diff --name-only upstream/main...HEAD` at plan authoring time. Use it as a **coverage checklist** so no area is forgotten during cleanup (many paths are code that only needs **comment/dep review**, not rewrites).

<details>
<summary>348 paths (click to expand)</summary>

```
.github/workflows/playwright.yml
.gitignore
Makefile
README.es.md
README.ja.md
README.md
README.zh-CN.md
SETUP.es.md
SETUP.ja.md
SETUP.md
SETUP.zh-CN.md
apps/backend/.env.example
apps/backend/.gitignore
apps/backend/alembic.ini
apps/backend/alembic/env.py
apps/backend/alembic/script.py.mako
apps/backend/alembic/versions/.gitkeep
apps/backend/alembic/versions/0001_phase6_storage.py
apps/backend/alembic/versions/0002_llm_observability.py
apps/backend/alembic/versions/0003_multi_resume_active_pin.py
apps/backend/alembic/versions/0004_cv_metadata.py
apps/backend/app/config.py
apps/backend/app/database.py
apps/backend/app/db/__init__.py
apps/backend/app/db/base.py
apps/backend/app/db/models.py
apps/backend/app/db/repositories/__init__.py
apps/backend/app/db/repositories/application_packs.py
apps/backend/app/db/repositories/artifacts.py
apps/backend/app/db/repositories/generation_runs.py
apps/backend/app/db/repositories/jobs.py
apps/backend/app/db/repositories/llm_calls.py
apps/backend/app/db/repositories/resumes.py
apps/backend/app/db/session.py
apps/backend/app/llm.py
apps/backend/app/main.py
apps/backend/app/prompt_overrides/.gitignore
apps/backend/app/prompts/__init__.py
apps/backend/app/prompts/_constants.py
apps/backend/app/prompts/_prompt_loader.py
apps/backend/app/prompts/_refinement.py
apps/backend/app/prompts/_rules/__init__.py
apps/backend/app/prompts/_rules/critique.py
apps/backend/app/prompts/_rules/jd_intel.py
apps/backend/app/prompts/_rules/resume_diff.py
apps/backend/app/prompts/_schema.py
apps/backend/app/prompts/answer_questions.py
apps/backend/app/prompts/cover_letter.py
apps/backend/app/prompts/critique_resume.py
apps/backend/app/prompts/enrichment.py
apps/backend/app/prompts/extract_jd_intel.py
apps/backend/app/prompts/parse_resume.py
apps/backend/app/prompts/refinement.py
apps/backend/app/prompts/rewrite_resume.py
apps/backend/app/prompts/tailor_resume_full.py
apps/backend/app/prompts/tailor_resume_lite.py
apps/backend/app/prompts/tailoring_blocks.py
apps/backend/app/prompts/tailoring_catalog.py
apps/backend/app/prompts/templates.py
apps/backend/app/rendering/__init__.py
apps/backend/app/rendering/document_pdf.py
apps/backend/app/rendering/rendercv_adapter.py
apps/backend/app/rendering/rendercv_engine.py
apps/backend/app/rendering/theme_profiles.py
apps/backend/app/routers/__init__.py
apps/backend/app/routers/application_packs.py
apps/backend/app/routers/artifacts.py
apps/backend/app/routers/config.py
apps/backend/app/routers/enrichment.py
apps/backend/app/routers/health.py
apps/backend/app/routers/jobs.py
apps/backend/app/routers/llm.py
apps/backend/app/routers/prompt_catalog_builder.py
apps/backend/app/routers/resumes.py
apps/backend/app/routers/themes.py
apps/backend/app/schemas/__init__.py
apps/backend/app/schemas/enrichment.py
apps/backend/app/schemas/models.py
apps/backend/app/services/__init__.py
apps/backend/app/services/additional_groups.py
apps/backend/app/services/application_questions.py
apps/backend/app/services/artifact_service.py
apps/backend/app/services/cover_letter.py
apps/backend/app/services/cv_metadata.py
apps/backend/app/services/improver.py
apps/backend/app/services/message_profiles.py
apps/backend/app/services/parser.py
apps/backend/app/services/prompt_utils.py
apps/backend/app/services/refiner.py
apps/backend/app/services/resume_codes.py
apps/backend/app/services/section_metadata.py
apps/backend/app/services/tailoring/__init__.py
apps/backend/app/services/tailoring/analysis.py
apps/backend/app/services/tailoring/change_manifest.py
apps/backend/app/services/tailoring/contracts.py
apps/backend/app/services/tailoring/diffing.py
apps/backend/app/services/tailoring/legacy_diffs.py
apps/backend/app/services/tailoring/llm_calls.py
apps/backend/app/services/tailoring/models.py
apps/backend/app/services/tailoring/orchestration.py
apps/backend/app/services/tailoring/preservation.py
apps/backend/app/services/tailoring/prompting.py
apps/backend/app/services/tailoring/suggestions.py
apps/backend/app/services/tailoring/verification.py
apps/backend/pyproject.toml
apps/backend/tests/conftest.py
apps/backend/tests/integration/test_application_packs_api.py
apps/backend/tests/integration/test_artifacts_api.py
apps/backend/tests/integration/test_config_api.py
apps/backend/tests/integration/test_health_api.py
apps/backend/tests/integration/test_jobs_api.py
apps/backend/tests/integration/test_llm_api.py
apps/backend/tests/integration/test_regenerate_endpoints.py
apps/backend/tests/integration/test_resume_api.py
apps/backend/tests/service/test_application_questions.py
apps/backend/tests/service/test_cover_letter.py
apps/backend/tests/service/test_improver.py
apps/backend/tests/unit/test_apply_diffs.py
apps/backend/tests/unit/test_compact_diff.py
apps/backend/tests/unit/test_config.py
apps/backend/tests/unit/test_cv_metadata.py
apps/backend/tests/unit/test_llm_text_completion.py
apps/backend/tests/unit/test_prompt_assembly.py
apps/backend/tests/unit/test_prompt_composer.py
apps/backend/tests/unit/test_prompt_registry.py
apps/backend/tests/unit/test_refiner.py
apps/backend/tests/unit/test_rendercv_adapter.py
apps/backend/tests/unit/test_rendercv_engine.py
apps/backend/tests/unit/test_resume_auxiliary_generation.py
apps/backend/tests/unit/test_resume_codes.py
apps/backend/tests/unit/test_resume_diff.py
apps/backend/tests/unit/test_skill_group_labels.py
apps/backend/tests/unit/test_sql_storage.py
apps/backend/tests/unit/test_tailoring_change_manifest.py
apps/backend/tests/unit/test_tailoring_prompt_equivalence.py
apps/backend/tests/unit/test_theme_profiles.py
apps/backend/tests/unit/test_verify_diffs.py
apps/backend/uv.lock
apps/frontend/.gitignore
apps/frontend/app/(default)/css/globals.css
apps/frontend/app/(default)/dashboard/page.tsx
apps/frontend/app/(default)/llm-traces/page.tsx
apps/frontend/app/(default)/resumes/[id]/page.tsx
apps/frontend/app/(default)/run-timing/page.tsx
apps/frontend/app/(default)/settings/page.tsx
apps/frontend/app/(default)/settings/prompt-catalog/page.tsx
apps/frontend/app/(default)/tailor/page.tsx
apps/frontend/app/layout.tsx
apps/frontend/app/print/resumes/[id]/page.tsx
apps/frontend/components/application/additional-questions-panel.tsx
apps/frontend/components/builder/add-section-dialog.tsx
apps/frontend/components/builder/cover-letter-editor.tsx
apps/frontend/components/builder/cover-letter-preview.tsx
apps/frontend/components/builder/cv-metadata-panel.tsx
apps/frontend/components/builder/draggable-list-item.tsx
apps/frontend/components/builder/draggable-section-wrapper.tsx
apps/frontend/components/builder/formatting-controls.tsx
apps/frontend/components/builder/forms/additional-form.tsx
apps/frontend/components/builder/forms/additional-groups-form.tsx
apps/frontend/components/builder/forms/education-form.tsx
apps/frontend/components/builder/forms/experience-form.tsx
apps/frontend/components/builder/forms/generic-item-form.tsx
apps/frontend/components/builder/forms/generic-list-form.tsx
apps/frontend/components/builder/forms/generic-text-form.tsx
apps/frontend/components/builder/forms/personal-info-form.tsx
apps/frontend/components/builder/forms/projects-form.tsx
apps/frontend/components/builder/forms/summary-form.tsx
apps/frontend/components/builder/generate-prompt.tsx
apps/frontend/components/builder/highlight-bullets-dnd.tsx
apps/frontend/components/builder/highlighted-resume-view.tsx
apps/frontend/components/builder/jd-comparison-view.tsx
apps/frontend/components/builder/jd-display.tsx
apps/frontend/components/builder/outreach-editor.tsx
apps/frontend/components/builder/outreach-preview.tsx
apps/frontend/components/builder/raw-yaml-editor.tsx
apps/frontend/components/builder/regenerate-dialog.tsx
apps/frontend/components/builder/regenerate-diff-preview.tsx
apps/frontend/components/builder/regenerate-instruction-dialog.tsx
apps/frontend/components/builder/regenerate-wizard.tsx
apps/frontend/components/builder/resume-builder.tsx
apps/frontend/components/builder/resume-form.tsx
apps/frontend/components/builder/section-header.tsx
apps/frontend/components/builder/skill-group-values-dnd.tsx
apps/frontend/components/builder/sortable-highlight-row.tsx
apps/frontend/components/builder/template-selector.tsx
apps/frontend/components/builder/utilities-workspace.tsx
apps/frontend/components/common/resume_previewer_context.tsx
apps/frontend/components/dashboard/resume-component.tsx
apps/frontend/components/dashboard/resume-upload-dialog.tsx
apps/frontend/components/observability/llm-trace-viewer.tsx
apps/frontend/components/preview/paginated-preview.tsx
apps/frontend/components/rendercv/application-pack-panel.tsx
apps/frontend/components/rendercv/artifact-gallery.tsx
apps/frontend/components/rendercv/render-locale-controls.tsx
apps/frontend/components/rendercv/render-preview-panel.tsx
apps/frontend/components/rendercv/render-runtime-settings-controls.tsx
apps/frontend/components/rendercv/render-theme-controls.tsx
apps/frontend/components/rendercv/rendercv-controls-shared.tsx
apps/frontend/components/resume/additional-group-section.tsx
apps/frontend/components/resume/resume-modern-two-column.tsx
apps/frontend/components/resume/resume-modern.tsx
apps/frontend/components/resume/resume-single-column.tsx
apps/frontend/components/resume/resume-two-column.tsx
apps/frontend/components/settings/model-picker-modal.tsx
apps/frontend/components/settings/pipeline-diagram.tsx
apps/frontend/components/settings/prompt-card.tsx
apps/frontend/components/settings/prompt-field-chrome.tsx
apps/frontend/components/settings/prompt-section-tree.tsx
apps/frontend/components/settings/shared-rules-card.tsx
apps/frontend/components/tailor/diff-preview-modal.tsx
apps/frontend/components/ui/button.tsx
apps/frontend/components/ui/confirm-dialog.tsx
apps/frontend/components/ui/dropdown.tsx
apps/frontend/components/ui/input.tsx
apps/frontend/components/ui/retro-tabs.tsx
apps/frontend/components/ui/rich-text-editor.tsx
apps/frontend/components/ui/rich-text-toolbar.tsx
apps/frontend/components/ui/textarea.tsx
apps/frontend/components/ui/toggle-switch.tsx
apps/frontend/hooks/use-highlight-row-ids.ts
apps/frontend/i18n/config.ts
apps/frontend/lib/api/client.ts
apps/frontend/lib/api/config.ts
apps/frontend/lib/api/enrichment.ts
apps/frontend/lib/api/index.ts
apps/frontend/lib/api/llm.ts
apps/frontend/lib/api/resume.ts
apps/frontend/lib/builder/drag-settings.ts
apps/frontend/lib/context/language-context.tsx
apps/frontend/lib/context/status-cache.tsx
apps/frontend/lib/cv-metadata.ts
apps/frontend/lib/i18n/messages.ts
apps/frontend/lib/rendercv/theme-baselines.json
apps/frontend/lib/types/render-theme.ts
apps/frontend/lib/utils/additional-groups.ts
apps/frontend/lib/utils/download.ts
apps/frontend/lib/utils/rendercv-fields.ts
apps/frontend/lib/utils/section-helpers.ts
apps/frontend/messages/en.json
apps/frontend/messages/es.json
apps/frontend/messages/ja.json
apps/frontend/messages/pt-BR.json
apps/frontend/messages/zh.json
apps/frontend/package-lock.json
apps/frontend/package.json
apps/frontend/tests/additional-groups.test.ts
apps/frontend/tests/additional-questions-panel.test.tsx
apps/frontend/tests/diff-preview-modal.test.tsx
apps/frontend/tests/download-utils.test.ts
apps/frontend/tests/llm-trace-viewer.test.tsx
apps/frontend/tests/raw-yaml-editor.test.tsx
apps/frontend/tests/regenerate-wizard.test.tsx
apps/frontend/tests/render-preview-panel.test.tsx
apps/frontend/tests/render-runtime-settings-controls.test.tsx
apps/frontend/tests/render-theme-controls.test.tsx
apps/frontend/tests/render-theme-state.test.ts
apps/frontend/tests/rendercv-controls-shared.test.tsx
apps/frontend/tests/tailor-page.test.tsx
apps/frontend/vitest.config.ts
docker-compose.yml
docs/agent/README.md
docs/agent/apis/api-flow-maps.md
docs/agent/apis/backend-requirements.md
docs/agent/apis/front-end-apis.md
docs/agent/architecture/backend-architecture.md
docs/agent/architecture/backend-guide.md
docs/agent/architecture/frontend-architecture.md
docs/agent/architecture/frontend-workflow.md
docs/agent/architecture/storage-and-rendering.md
docs/agent/coding-standards.md
docs/agent/features/adding-resume-templates.md
docs/agent/features/additional-groups-and-raw-yaml.md
docs/agent/features/application-packs.md
docs/agent/features/custom-sections.md
docs/agent/features/enrichment.md
docs/agent/features/jd-match.md
docs/agent/features/resume-templates.md
docs/agent/llm-integration.md
docs/agent/llm-observability.md
docs/agent/llm-prompt-inventory.md
docs/agent/quickstart.md
docs/agent/scope-and-principles.md
docs/agent/workflow.md
docs/plans/phase-3.1-llm-pipeline-and-prompts-plan.md
docs/plans/phase-3.10.1-Bring-metadata-to-cv-for-offline-operation.md
docs/plans/phase-3.10.1-implementation-checklist.md
docs/plans/phase-3.11.1-refactor-dashboard-UIUX-design-system.md
docs/plans/phase-3.11.2-refactor-dashboard-UIUX-design-system-codex.md
docs/plans/phase-3.11.3-refactor-dashboard-UIUX-design-system-composer.md
docs/plans/phase-3.2-repair-llm-pipe.md
docs/plans/phase-3.3.1-prompt-optimization.md
docs/plans/phase-3.3.2-dry-run-raw.md
docs/plans/phase-3.3.2-dry-run.md
docs/plans/phase-3.3.2-prompt-optimization-sonnet.md
docs/plans/phase-3.3.2.1-prompt-integration-sonnet.md
docs/plans/phase-3.3.3-diff-only-output.md
docs/plans/phase-3.3.3-prompt-refactor-codex.md
docs/plans/phase-3.3.3-prompt-refactor.md
docs/plans/phase-3.4.1-output-feedback.md
docs/plans/phase-3.4.2-qa-new-features-fix.md
docs/plans/phase-3.4.3-revised-qa-new-features-fix.md
docs/plans/phase-3.4.5-revised-qa-new-features-fix-codex.md
docs/plans/phase-3.5.1-additional-questions-feature-design.md
docs/plans/phase-3.6.1-local-cli-calls-research-codex.md
docs/plans/phase-3.6.2-CLIProxyAPI-technical-flow.md
docs/plans/phase-3.6.3-installation-walkthrough.md
docs/plans/phase-3.6.4-preview-pipeline-timing-postmortem.md
docs/plans/phase-3.6.5-auxiliary-package-hardening.md
docs/plans/phase-3.7.1-Prompt-schema-redesign-5.2-codex.md
docs/plans/phase-3.7.1-Prompt-schema-redesign-Composer-2.md
docs/plans/phase-3.7.1-Prompt-schema-redesign-Opus-4.6.md
docs/plans/phase-3.7.2-prompt-schema-technical-implementation-opus-4.6.md
docs/plans/phase-3.7.3-prompt-schema-redesign-opus-4.6.md
docs/plans/phase-3.7.3.1-prompt-pipeline-refactor-checklist.md
docs/plans/phase-3.7.4-features-plan-opus-4.6.md
docs/plans/phase-3.7.5-technical-plan-claude-opus-4.6.md
docs/plans/phase-3.7.6-easier-prompt-management-composer.md
docs/plans/phase-3.8.1-master-resume-refactor-design-opus-4.6.md
docs/plans/phase-3.8.2-master-resume-refactor-design-claude-opus-4.5.md
docs/plans/phase-3.9.1-TO-DO-Refacore-Is-Active.md
docs/plans/phase-5.md
docs/plans/phase-6-checklist.md
docs/plans/phase-6-global-test-cases.md
docs/plans/phase-6.md
docs/plans/prompt-two-scrolls-architecture.md
docs/plans/resume-plan-phase2.md
docs/plans/resume-plan-phase3.md
docs/plans/resume-plan-phase4.md
docs/plans/resume-plan.md
infra/cliproxyapi/auths/.gitkeep
infra/cliproxyapi/config.template.yaml
infra/cliproxyapi/logs/.gitkeep
orchastration.md
package-lock.json
package.json
playwright.config.ts
scripts/capture-builder-section-screenshots.cjs
scripts/cliproxy-health.sh
scripts/sync-upstream-references.sh
tests/builder-tabs-e2e.spec.ts
tests/dashboard-upload-e2e.spec.ts
tests/playwright-fixtures.ts
tests/prompt-catalog-e2e.spec.ts
tests/prompt-pipeline-and-tailor-e2e.spec.ts
tests/resume-viewer-e2e.spec.ts
tests/settings-flow-e2e.spec.ts
tests/tailor-application-pack-e2e.spec.ts
```

</details>

**Note:** `git diff --name-status upstream/main...HEAD` shows **`D apps/backend/app/prompts/templates.py`** — the monolithic file is intentionally gone; agent docs must describe the split prompt modules, not `templates.py`.

---

*End of Phase 3.12.1 cleanup plan.*
