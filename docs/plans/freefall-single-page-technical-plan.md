# Freefall (single long page) — technical plan

**Status:** Draft for implementation  
**Goal:** Add a third page layout option **Freefall** that (1) uses the **same width** as today’s A4 or US Letter choice, (2) grows **vertically** to fit all content on **one PDF page**, and (3) matches that behavior in the **builder preview**.  
**Non-goal:** Replacing RenderCV, Typst, or the existing `resume_to_rendercv_payload` adapter with a second render path.

---

## 1. Reuse existing RenderCV adapters (recommended)

Yes — **keep one pipeline**:

`resume_data` + `RenderThemeSettings` → `resume_to_rendercv_payload` → `build_rendercv_dictionary_and_model` → `generate_typst` → Typst compile → PDF.

**What changes is small and localized:**

1. **Schema / settings** — Extend `page_size` (and legacy `TemplateSettings.pageSize` if still used for GET PDF queries) with a third enum value, e.g. `FREEFLOW` (product name: “Freefall” / “Continuous”).

2. **Typst post-process (new)** — After `generate_typst(model)` writes `*.typ`, and **before** `_generate_pdf_with_ats_profile`, if freefall is active, patch the generated Typst so the global `#set page(...)` uses **fixed width** (from the user’s A4 vs Letter preference) and **`height: auto`**.

   - RenderCV themes today emit roughly:

     ```typst
     #set page(
       margin: (...),
       paper: design-page-size,
       footer: ...
     )
     ```

   - Typst supports **`height: auto`**: the page grows with content until a manual `#pagebreak()`; see [Typst page — width / height](https://typst.app/docs/reference/layout/page/).

   - Implementation detail: **`paper:` and explicit `height: auto` may interact** — the safe pattern is to **stop using `paper`** for this mode and set e.g. `width: 210mm`, `height: auto` (Letter: `215.9mm` or `8.5in`) plus the **same margin dictionary** RenderCV already emitted.

3. **Same hook pattern as today** — This mirrors `_strip_summary_heading_from_typst` in `rendercv_engine.py`: read `.typ`, transform, write back, then compile. No fork of RenderCV’s Python package.

4. **`resume_to_rendercv_payload` / YAML** — Prefer **not** inventing a RenderCV-unsupported `design.page.size` string. Keep emitting valid RenderCV YAML (still `a4` or `us-letter` for width/margins math), and drive freefall only from **`RenderThemeSettings.page_size`** (or a dedicated `layout_mode: freefall` flag if you want YAML to stay pure). The Typst patch is keyed off that setting.

**Cover letter / other PDFs** — If they share the same Typst path, apply the same post-rule; if they use a different generator, list separately in implementation tasks.

---

## 2. PDF: vertical extension without a new renderer

- **Single PDF page, tall bounding box** — Typst with `height: auto` produces **one** page whose MediaBox height equals content + margins (capped only by viewer/practical limits; extremely long resumes should be tested).

- **`_generate_pdf_with_ats_profile`** — Today uses `pdf_standards=["a-2u"]`. Validate that ATS PDF/A pass still succeeds for “tall single page”; if not, **reuse existing fallback** (`generate_pdf` without that profile) for freefall only, with logging.

- **PNG preview** — Still `generate_png(model, typst_path)` off the **same** patched Typst. Expect **one tall image** or stacked slices depending on RenderCV; confirm in QA and adjust preview UI (scroll) if needed.

---

## 3. Frontend preview (builder)

Align preview with “one scrollable sheet”:

| Area | Action |
|------|--------|
| `apps/frontend/lib/types/template-settings.ts` | Extend `PageSize`, `PAGE_SIZE_INFO`. |
| `apps/frontend/lib/constants/page-dimensions.ts` | Width from A4/Letter; height **not** fixed to one sheet — single column, `min-height` from content or bypass multi-page slice. |
| `apps/frontend/components/preview/page-container.tsx` | Branch: freefall → no multi-page `contentOffset` / clipping; one container, width = paper width, height = auto. |
| Callers that compute **page count / splits** | Force `totalPages = 1` when freefall. |
| `apps/frontend/components/builder/formatting-controls.tsx` | Third option + short disclaimer (print / rare ATS quirks). |
| `apps/frontend/components/builder/resume-builder.tsx` | Labels, download params. |
| `apps/frontend/lib/types/render-theme.ts` + theme UI | If `page_size` is duplicated for RenderCV tab, extend consistently. |
| `apps/frontend/messages/en.json` | Copy. |

---

## 4. Backend / API

| Area | Action |
|------|--------|
| `apps/backend/app/schemas/models.py` | Allow new `page_size` literal in stored theme / requests. |
| `apps/backend/app/rendering/theme_profiles.py` | `_normalize_page_size`, `legacy_to_theme_settings`, design `page.size` sync — map freefall to internal enum; avoid writing invalid RenderCV enum into YAML if we patch Typst only. |
| `apps/backend/app/routers/resumes.py` | Query `pageSize` pattern `^(A4|LETTER|FREEFLOW)$` (or chosen name); `_coerce_page_size`. |
| `apps/backend/app/rendering/rendercv_engine.py` | Call new `_apply_freefall_page_to_typst(...)` when enabled (signature: path + `RenderThemeSettings` + base paper width). |
| Tests | `test_rendercv_adapter`, PDF smoke, preview artifact tests. |

---

## 5. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Typst patch breaks on theme upgrade | Prefer **structured** patch (parse first `#set page(` block, replace args) or version-guard; add fixture `.typ` snapshot test. |
| Huge resume → huge PDF / memory | Soft cap or warning in UI; optional future “max height” clamp (would reintroduce pagination — product call). |
| Footer “page 1 of N” | With one page, N=1; verify RenderCV footer template. |
| PDF/A profile fails | Fallback compile without `a-2u` for this mode (already in code path). |
| ATS tools assume letter/A4 height | User accepts; document in UI. |

---

## 6. Implementation order (suggested)

1. Types + backend normalization + API query extension.  
2. Typst post-process + unit test on a frozen sample `.typ`.  
3. PDF download E2E for freefall.  
4. Builder preview layout branch.  
5. i18n + formatting control UX.  
6. Cover letter parity if applicable.

---

## 7. Relation to phase 3.13.5 docs

`phase-3.13.5-technical-flow.md` and related files concern **prompt catalog layout**, not page geometry. This plan is **orthogonal**; no merge into 3.13.5 required except a one-line “see also” link if desired.

---

## 8. Open decisions (product)

- Exact enum string: `FREEFLOW` vs `CONTINUOUS` vs `SINGLE_PAGE`.  
- Whether freefall is allowed for **all** bundled themes or gated until Typst patch validated per theme.  
- Default for new users: unchanged (A4).
