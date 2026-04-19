# Phase 3.10.1 — Technical implementation checklist

Companion to **`phase-3.10.1-Bring-metadata-to-cv-for-offline-operation.md`**. Execute after product approval.

---

## 0. Scope lock-in

| In scope | Out of scope (this phase) |
|----------|---------------------------|
| Fifth YAML section **`metadata`** (string), **four fields only:** `role`, `company`, `location`, `bold_keywords` (list) | Extra metadata keys, versioning in LLM bundle, lineage IDs |
| **Form-first** Metadata UI + synced YAML | Export full `design`/`locale`/`settings` in default clipboard (optional later) |
| **No** bold enable/disable in Metadata; **empty list ⇒ no bolding** | Second boolean the user must maintain |
| Resume-level **dashboard overrides** + **theme keyword list** apply on normalize/save | Offline queue / IndexedDB |

---

## 1. Data model & persistence

- [ ] **DB:** Add storage for app-only metadata (choose one approach and document in migration):
  - **Preferred:** `cv_metadata` **TEXT** (YAML) or **JSON** column on `resumes`, **or**
  - Normalized JSON with keys `role`, `company`, `location`, `bold_keywords` only.
- [ ] **Duplicate:** `duplicate_resume` copies `cv_metadata` (or equivalent) with cloned `theme_settings` so fork inherits parent values.
- [ ] **Defaults:** New / migrated rows: empty `bold_keywords` list; optional null strings for role/company/location until user sets them.

---

## 2. API & schemas

- [ ] **`RawYamlSections`** (`apps/backend/app/schemas/models.py` + frontend `resume.ts`): add `metadata: str` (default empty block under root `metadata:` per parent doc §4).
- [ ] **`ResumeDraftRequest` / `ResumeDraftNormalizedResponse`:** include `metadata` in `yaml_sections` round-trip.
- [ ] **`DraftValidationDetail.section`:** extend union with `metadata` (frontend + backend error mapping).
- [ ] **Normalize / PATCH draft:** Accept partial `yaml_sections`; preserve base `metadata` when only `cv` is sent (per merge policy in parent doc §10).

---

## 3. Backend — parse & apply

- [ ] **Strip early:** `parse_rendercv_yaml_sections` must **not** receive `metadata` mixed into RenderCV four-way parse — pass `metadata` separately or remove from dict before `parse_rendercv_yaml_sections`.
- [ ] **`parse_app_metadata_yaml` (new):** Safe load; validate types (strings + list of strings for `bold_keywords`); reject unknown top-level keys with **warning** or **422** (team choice — recommend warn + strip for LLM paste tolerance).
- [ ] **Apply to theme:** Map `bold_keywords` list → `theme_settings.settings.bold_keywords` (or project convention). Set **legacy/top-level** `bold_keywords` boolean to **`len(list) > 0`** whenever applying metadata or Metadata form save (single derivation rule).
- [ ] **Apply to dashboard overrides:** Persist `role` / `company` / `location` to resume-level override fields used by `_resume_to_summary` (see §4).
- [ ] **`_save_resume_payload` / draft save path:** Persist `processed_data`, `theme_settings`, and **cv_metadata** (or overrides) in one transaction where applicable.
- [ ] **Size limits:** Max length on metadata YAML string (e.g. 32–64 KiB) to match other sections.

---

## 4. Backend — list / summary (`_resume_to_summary`)

- [ ] **Resume-level overrides:** Read stored overrides for role/company/location.
- [ ] **Merge order:** Implement precedence agreed in parent doc (e.g. override wins for listing, or override only when no `application_pack_id` — **lock rule in PR**).
- [ ] **Tests:** List endpoint returns expected `target_*` when only overrides are set (duplicated resume, no pack).

---

## 5. Frontend — builder

- [ ] **`RawYamlSections` / `EMPTY_RAW_YAML`:** Add `metadata` with empty default (e.g. minimal valid YAML matching §4 of parent doc).
- [ ] **`EditorSection`:** Add `'metadata'`.
- [ ] **`buildFullYaml` / history / `YAML_STORAGE_KEY`:** Include `metadata` in snapshots and localStorage JSON.
- [ ] **Metadata panel UI:**
  - [ ] Text inputs: Role, Company, Location.
  - [ ] Bold keywords: textarea (one per line) or chips; parse ↔ list; **empty ⇒ no bolding**.
  - [ ] Optional collapsible **YAML** editor synced bidirectionally with form (debounced normalize on blur or explicit “Sync”).
- [ ] **Wire to state:** On change, update `rawYamlSections.metadata` and `themeSettings` (keyword list) in sync with §5.3 of parent doc.
- [ ] **Copy bundle:** Serialize **only** `metadata` (four fields) + `cv` block for default action.
- [ ] **Apply from clipboard:** Parse labeled sections; merge into `cv` + `metadata`; show toast on partial apply.
- [ ] **Error UX:** Jump to **Metadata** section when `section === 'metadata'` in validation detail.

---

## 6. Frontend — Settings parity

- [ ] Extract or share **keyword list** editor between **Settings → General** and **Metadata** so one list updates `themeSettings` (no duplicate enable switch in Metadata).
- [ ] If Settings still exposes a **bold toggle:** Either remove it in favor of list-only, or bind toggle to “list non-empty” so UX stays consistent (prefer list-only per parent doc).

---

## 7. Import paths (combined YAML / CV-only)

- [ ] **Combined file:** Optional preprocessor splits top-level `cv`/`design`/`locale`/`settings`/`metadata` into `RawYamlSections` (metadata only if four keys).
- [ ] **CV-only paste:** Keep existing sections + metadata unchanged unless user confirms overwrite.

---

## 8. Tests

- [ ] **Unit:** `parse_app_metadata_yaml` — valid, unknown keys, wrong types, empty bold list.
- [ ] **Integration:** `PATCH .../draft` with `yaml_sections` including `metadata` persists DB + returns coherent `yaml_sections`.
- [ ] **Integration:** List resumes after save shows **target_* from overrides**.
- [ ] **Round-trip:** `normalize` → response `yaml_sections.metadata` matches applied four fields.
- [ ] **Frontend:** Smoke test Metadata form updates preview bolding when keywords change (if E2E exists).

---

## 9. i18n & copy

- [ ] Keys for Metadata segment labels (Role, Company, Location, Bold keywords).
- [ ] Copy bundle / Apply / validation toasts.

---

## 10. Documentation

- [ ] Update **`docs/agent/architecture/storage-and-rendering.md`** — fifth section `metadata`, non-RenderCV.
- [ ] Short **in-app** hint: “Only role, company, location, and keywords are included for external LLMs.”

---

## 11. PR / rollout suggestion

1. DB migration + backend parse/apply + tests (no UI).
2. API + list summary overrides + tests.
3. Frontend Metadata segment + clipboard + localStorage.
4. Settings sync cleanup + i18n.
5. Combined YAML import helper (if not deferred).

---

*Derived from `phase-3.10.1-Bring-metadata-to-cv-for-offline-operation.md`.*
