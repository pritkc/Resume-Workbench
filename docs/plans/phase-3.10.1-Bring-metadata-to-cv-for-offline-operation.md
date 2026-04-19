# Phase 3.10.1 — CV metadata bundle & offline-friendly editing

**Purpose:** This document is the **approval-ready plan**: what we verified in code, what we propose, UI shape, affected areas, and how we handle **external / arbitrary RenderCV YAML**. After approval, implementation follows as a separate stage (API contracts, checklists, PR breakdown).

---

## 1. Goal (unchanged)

Enable a **duplicate → edit in one place → paste back** workflow when internal APIs are unavailable or when the user prefers a **web LLM**:

- **CV body** stays RenderCV-compatible (`cv` raw section).
- **Operational metadata** — **only** what an external LLM must see to help: **target role, company, location**, and **bold keyword list** (see §4). No extra keys “for completeness”; nothing that does not change dashboard, listing, or RenderCV bolding.
- **Theme/formatting** usually stay aligned with the parent resume after duplicate (already true today via cloned `theme_settings` and YAML sections).

---

## 2. Codebase verification — facts (confirmed)

| Topic | Verified behavior | Code references |
|--------|-------------------|-----------------|
| Raw YAML sections | Exactly **four** string sections: `cv`, `design`, `locale`, `settings`. | `RawYamlSections` in `apps/backend/app/schemas/models.py` (~1197–1204); `apps/frontend/lib/api/resume.ts` (`RawYamlSections`). |
| Parse / round-trip | `parse_rendercv_yaml_sections()` reads **only** those four keys; builds `ResumeData` + `RenderThemeSettings` via `rendercv_cv_to_resume_data` + `theme_settings_from_rendercv_sections`. | `apps/backend/app/rendering/rendercv_adapter.py` (`parse_rendercv_yaml_sections`, ~1157–1215). |
| Draft flow | `POST /api/v1/resumes/draft/normalize` and `PATCH /api/v1/resumes/{id}/draft` call `_normalize_draft_request` → `parse_rendercv_yaml_sections` or `processed_resume`; response includes `yaml_sections` from `rendercv_payload_to_yaml_sections`. | `apps/backend/app/routers/resumes.py` (`_normalize_draft_request`, `normalize_resume_draft`, `save_resume_draft`). |
| Persisting draft | `_save_resume_payload` updates `content`, `processed_data`, `theme_settings` — **does not** write job/application_pack fields. | `apps/backend/app/routers/resumes.py` (`_save_resume_payload`, ~655–677). |
| Dashboard **target_role / target_company / target_location** | List summaries compute targets via `_merge_target_metadata(application_pack, job, title=resume["title"], …)`, **not** from `processed_data` alone. | `apps/backend/app/routers/resumes.py` (`_resume_to_summary`, `_merge_target_metadata`, ~530–579, ~439–492). |
| Resume row | `Resume` has `title`, `theme_settings`, `processed_data`, `application_pack_id`; **no** `target_role` columns on `resumes` table. | `apps/backend/app/db/models.py` (`Resume`, `Job`, `ApplicationPack`). |
| Duplicate | `duplicate_resume` copies `content`, `processed_data`, `theme_settings`, cover/outreach, sets `title` to `"{base} (copy)"`, `parent_id=None`, **`application_pack_id` not copied** (defaults null). | `apps/backend/app/database.py` (`duplicate_resume`, ~265–301). |
| Frontend builder | `EditorSection = 'cv' \| 'design' \| 'locale' \| 'settings'`; `EMPTY_RAW_YAML` has four keys; localStorage key `resume_builder_raw_yaml`. | `apps/frontend/components/builder/resume-builder.tsx`. |
| Bold keywords | Top-level `bold_keywords` flag + `settings.bold_keywords` list in theme profile; adapter resolves for rendering. | `apps/backend/app/rendering/theme_profiles.py`, `rendercv_adapter.py` (`_resolve_bold_keywords`). |
| Frontend dashboard display | `resolveTargetMetadata` prefers `target_*`, then `role`/`company`/`location`, then title parse. | `apps/frontend/app/(default)/dashboard/page.tsx` (`resolveTargetMetadata`, ~97–117). |

### 2.1 Implications (correcting an earlier assumption)

- **Saving YAML + theme via draft does not automatically refresh dashboard targets** the way users expect from “metadata in CV,” because targets are **derived from application pack + job + resume title**, not from the last saved `processed_data` blob.
- **Forked resumes** (duplicate) typically have **no** `application_pack_id` → targets fall back to **`title` parsing** and keyword-derived inference when a job exists. So “paste metadata and see dashboard update” **requires an explicit new persistence + summary path** (see §5.2).

---

## 3. Proposal summary

1. **Fifth persisted section `metadata` (YAML string)** — same transport as other sections (`ResumeDraftRequest.yaml_sections`), **not** passed to RenderCV. Parsed only by our code to update **bold keyword list in theme** and **dashboard-facing overrides** (role / company / location).
2. **Clipboard bundle** — “Copy for external LLM” / “Apply from clipboard” includes **`cv`** plus a **minimal `metadata` block** (four fields only; §4). Omit design/locale/settings from the default bundle unless we add an explicit “export full theme” later.
3. **CV tab UI** — dedicated **Metadata** segment with **proper form fields** (not YAML-only): text inputs for **role**, **company**, **location**; multi-line or tag/chip input for **bold keywords** (one per line or comma-separated — implementation detail). Values stay in sync with the `metadata` YAML section. **No** separate “enable bold keywords” control: an **empty list** means no bolding (see §5.3).
4. **Dashboard alignment** — **resume-level overrides** consumed by `_resume_to_summary`, so list API reflects the same role / company / location as the Metadata form.

---

## 4. Metadata schema (v1 — need-to-know only)

**Rule:** Anything sent to an external LLM in the bundle should be **only** these four concepts. No `version`, lineage, toggles, or nested buckets unless we add them later for persistence—not for the LLM.

Stored as its **own YAML section** (string payload for `yaml_sections.metadata`), mirroring other sections. **Locked convention:** the section body **must** use a root **`metadata:`** mapping (same pattern as `cv:`, `design:`, …). Do not use a flat mapping without the `metadata` key — avoids ambiguity with clipboard bundles and the draft API.

Example **section string** (what we persist and round-trip):

```yaml
metadata:
  role: "Senior Backend Engineer"
  company: "Acme Corp"
  location: "Remote"
  bold_keywords:
    - FastAPI
    - PostgreSQL
```

- **`role` / `company` / `location`:** strings; drive **dashboard / list** via resume-level overrides (§5.2).
- **`bold_keywords`:** list of strings; drives **runtime bolding** in `theme_settings.settings.bold_keywords`. **Empty list** ⇒ treat as “no bolding” (§5.3). Do **not** expose a separate enable/disable flag in metadata or in the Metadata form.

---

## 5. Technical design — confirmed constraints

### 5.1 Why not stuff metadata into `processed_data` without schema changes?

`ResumeData.model_validate(...)` is used after normalize; **extra keys are not part of `ResumeData`** and would be **dropped** on `model_dump()` unless we add fields or a parallel store. So either:

- **A)** Extend `ResumeData` with an optional nested object (e.g. `appMetadata`) excluded from RenderCV export, or  
- **B)** New **DB column** (e.g. `cv_metadata` JSON or TEXT), or  
- **C)** Only sync **dashboard** by rewriting **`resume.title`** to `"{role} @ {company}"` and accept lossy location (weak; not recommended as sole solution).

**Recommendation for approval:** **(B)** TEXT column storing raw metadata YAML **or** normalized JSON mirror — keeps RenderCV JSON clean and avoids accidental leakage into RenderCV payload. Alternatively **(A)** if product wants a single `processed_data` blob for export.

### 5.2 Dashboard targets — required wiring

**Minimum viable:** When metadata defines `dashboard.*`, persist overrides and change `_resume_to_summary` to merge **resume-level overrides** **after** pack/job (or with explicit precedence policy):

- Suggested precedence: **`resume override` > `application_pack` / `job`** for listing **only** (document clearly), **or** “override wins only when no application_pack” for tailored resumes — product call.

### 5.3 Bold keywords (no enable/disable in product)

- **User model:** Only the **list** matters. Clear it or delete all entries to turn bolding off.
- **Storage:** `theme_settings` still stores whatever the RenderCV stack needs today (including a legacy **boolean** `bold_keywords` if present). **Implementation:** derive boolean from list — e.g. `bold_keywords = len(list) > 0` when applying metadata or saving from the Metadata form, so we do **not** add parallel “enabled” UX or duplicate logic the user must keep in sync.
- **Settings → General:** Existing bold UI can remain for now; it should reflect the **same** list (shared state). Prefer one shared component fed by `themeSettings` so list edits from Metadata and Settings never diverge.

---

## 6. Import from arbitrary RenderCV / external YAML (“different schema”)

Users may paste **a single file** exported from another RenderCV project, another fork of our app, or a **partial** fragment.

### 6.1 Scenarios

| # | Scenario | Detection | Behavior |
|---|----------|-----------|----------|
| S1 | **Our four sections** in one request (current API shape) | Already supported | Normalize as today. |
| S2 | **Single combined YAML** with top-level `cv:`, `design:`, `locale:`, `settings:` | Split root keys into four section strings | Preprocessor in client or server: `yaml.safe_load` → map keys → `RawYamlSections`. |
| S3 | **CV-only** paste (only `cv:` or inner mapping) | Missing other sections | Merge `cv` only; **retain** existing `design`/`locale`/`settings` from base resume (duplicate parent theme preserved). |
| S4 | **Different RenderCV theme / design** | Parsed `design` differs strongly | User choice in modal: **“Keep current theme”** (only merge `cv`) vs **“Import all sections”** (may shift preview). |
| S5 | **Extra unknown top-level keys** (tool-specific) | Keys outside RenderCV | Strip / ignore with **warning**; never fail whole parse if `cv` valid. |
| S6 | **Invalid YAML** | Parser error | Return existing `DraftValidationDetail` style **section + line + column**. |
| S7 | **Valid YAML, unsupported cv shape** | `rendercv_cv_to_resume_data` partial failure | Surface validation errors; optional **“import as much as possible”** later phase. |
| S8 | **Non-RenderCV resume YAML** (other products) | Fails cv mapping | **Out of scope for v1** — message: “Could not map to RenderCV cv schema”; link to manual section-by-section paste. |

### 6.2 Helpers (product)

- **“Split & preview”** step before apply: show which sections will change.
- **“Import CV only”** default on duplicate fork to protect parent **theme**.

---

## 7. UI structure (form-first + YAML)

**Resume tab → Raw mode**

- **Segmented control or tabs:** `CV` | `Design` | `Locale` | `Settings` | **`Metadata`** (new).

**Metadata segment — layout**

| Control | Purpose |
|--------|---------|
| **Role** | Single-line text → `metadata.role` |
| **Company** | Single-line text → `metadata.company` |
| **Location** | Single-line text → `metadata.location` |
| **Bold keywords** | Textarea (one keyword per line) or equivalent → `metadata.bold_keywords` list; empty ⇒ no bolding |

- **YAML sub-panel (optional collapse):** Read-only or synced editor showing the **same** four fields as YAML for power users and paste-back workflows. Editing YAML updates the form on normalize/save; editing the form rewrites YAML.
- **Actions:** `Copy bundle for LLM` ( **`metadata` block as in §4** + **`cv`** only in default flow), `Apply from clipboard`, optional `Download .yaml`.

**Settings → General:** Reuse the same **keyword list** state as Metadata (§5.3); **do not** add a second “enable bold” switch in the Metadata panel.

**Sample clipboard bundle (minimal LLM surface)**

```text
# resume-workk bundle — metadata (app-only)
metadata:
  role: "Senior Backend Engineer"
  company: "Acme Corp"
  location: "Remote"
  bold_keywords:
    - FastAPI

# --- cv (RenderCV)
cv:
  name: Jane Doe
  # ...
```

---

## 8. Areas affected (files / systems)

| Area | Likely touch points |
|------|---------------------|
| **API schemas** | `RawYamlSections`, `ResumeDraftRequest`, `ResumeDraftNormalizedResponse` — add optional `metadata: str`. |
| **RenderCV adapter** | `parse_rendercv_yaml_sections` — **strip/ignore** `metadata` key from input dict before theme/cv parse **or** pass metadata separately (cleaner). |
| **Draft router** | `_normalize_draft_request` — after parse, apply metadata → theme + overrides; `_save_resume_payload` / companion — persist metadata store + resume overrides. |
| **List / summary** | `_resume_to_summary` — merge resume-level dashboard overrides. |
| **DB** | Possible migration: `cv_metadata` or override columns (if not using extended `ResumeData`). |
| **Frontend API types** | `apps/frontend/lib/api/resume.ts` — `RawYamlSections`, `DraftValidationDetail.section` union. |
| **Resume builder** | `resume-builder.tsx` — `EMPTY_RAW_YAML`, `EditorSection`, `buildFullYaml`, history/snapshot, localStorage parse. |
| **Validation UX** | Section errors for `metadata` in addition to `cv`/`design`/… |
| **Tests** | `test_rendercv_adapter.py`, `test_resume_api.py` — round-trip, partial import, summary overrides. |

---

## 9. New structure (mental model)

```
Resume (DB)
├── content / processed_data     → ResumeData (RenderCV-facing JSON)
├── theme_settings               → RenderThemeProfile (keyword list + derived bold flag)
├── cv_metadata (new?)          → YAML or JSON — **only** role, company, location, bold_keywords list
└── title                        → existing; may sync from dashboard for backward compatibility

Draft request (normalize / save)
├── yaml_sections.cv|design|locale|settings  → RenderCV round-trip
└── yaml_sections.metadata                     → app-only → theme + dashboard overrides

Clipboard bundle (export/import)
└── Labeled blocks → maps to yaml_sections + optional combined RenderCV file import
```

---

## 10. Edge cases (condensed)

- **Partial paste:** CV only → keep theme + metadata unchanged; metadata only → update overrides and theme slice, optional CV unchanged.
- **Tailored resume with `application_pack_id`:** Define precedence for dashboard display (override vs job) — **must** be explicit in implementation spec.
- **Duplicate:** No pack; overrides + title are the main levers — **works well** once overrides exist.
- **Security:** `yaml.safe_load` only; size limits; document no executable tags.

---

## 11. Out of scope for first implementation (suggested)

- Full **offline queue** / IndexedDB sync.
- **Automatic** conversion from non-RenderCV resume formats.
- **Diff** parent vs fork beyond a simple “sections changed” summary.

---

## 12. Acceptance criteria (approval-level)

- [ ] **Metadata** contains **only** role, company, location, `bold_keywords` list in the external bundle; **no** bold enable/disable in UI or YAML.
- [ ] **Metadata** segment has **dedicated form fields** for those four concepts; YAML stays in sync.
- [ ] Empty **bold keywords** list ⇒ **no** runtime bolding (derived flag in theme layer).
- [ ] **Save** updates **theme_settings** (list) and **dashboard** overrides per precedence; **Copy / Apply** round-trips **cv + minimal metadata** without breaking RenderCV preview.
- [ ] **Import**: combined RenderCV YAML **or** CV-only paste behaves per §6.1 table.
- [ ] Invalid inputs produce **actionable** errors (section + line when possible).

---

## 13. Next stage (after approval — not in this doc)

- See **`phase-3.10.1-implementation-checklist.md`** for technical tasks, API/DB notes, and ordered checklists.

---

## 14. User journey walkthrough (in-scope areas only)

Quick alignment check — brackets are **placeholders**; same values should line up across steps where noted.

1. **Duplicate** — User duplicates resume **A** → new resume **B**. **B** inherits **A**’s `cv` / `design` / `locale` / `settings` YAML, **`theme_settings`** (incl. bold keywords), and **`metadata`** (once present). Dashboard row for **B** shows **[title e.g. `... (copy)`]** and targets **[from `_resume_to_summary` rules; after build: overrides match metadata when set]**.

2. **Before edit** — In builder → Resume → raw → **`Metadata`**: form shows **[role / company / location / bold keywords lines]**; YAML mirrors **only** those four. Preview uses **[unchanged `cv` + theme]**.

3. **Copy to clipboard** — User clicks **Copy bundle for LLM**. Clipboard contains **`metadata`** **[role, company, location, bold_keywords]** + **`cv`** **[…]** — no design/locale/settings by default. Omit **[letters, JD tab, PDF, tailor APIs]**.

4. **External edit** — User edits off-app: **`metadata`** → **[e.g. role `Staff Engineer`, company `Contoso`, location `Berlin`, bold_keywords `[..., PostgreSQL]`]**; **`cv`** → **[e.g. one bullet updated]**. Clearing all keywords ⇒ **[no bolding when applied]**.

5. **Apply back** — User **Apply from clipboard** (or edits form/YAML and saves). Persist **[`yaml_sections.cv` + `yaml_sections.metadata`]**, **[theme keyword list + derived bold flag]**, **[dashboard overrides]**.

6. **Dashboard** — Row for **B** shows **[`Staff Engineer` / `Contoso` / `Berlin`]** (or whatever was applied + precedence rules). Builder preview shows **[updated CV body + bolding from new keyword list]**. **Out of scope for this walkthrough:** cover letter, outreach, application pack, job record.

---

*See also: `docs/plans/phase-3.10.1-implementation-checklist.md`.*

*Last updated: codebase review against `apps/backend` + `apps/frontend` builder and dashboard paths.*
