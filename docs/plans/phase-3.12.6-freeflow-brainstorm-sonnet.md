# Phase 3.12.6 — Freeflow Page Mode: Brainstorm & Plan

**Date:** 2026-04-26  
**Goal:** Add a "FREEFLOW" page option that removes hard page boundaries from the resume preview, producing a single continuous scroll for online applications — with PDF download still working (natural browser pagination).

---

## System Map (What We're Working With)

### How page size flows today

```
User picks page size (A4 / LETTER)
  → RenderThemeSettings.page_size: PageSize (Literal["A4", "LETTER"])
  → build_design(settings) in theme_profiles.py
      → design["page"]["size"] = "a4" | "us-letter"
  → rendercv_adapter.py: resume_to_rendercv_payload() puts design into payload
  → rendercv_engine.py: render_resume_bundle() calls RenderCV library with that payload
      → RenderCV / Typst generates PDF (ATS a-2u) + PNG images per page
  → Frontend preview: usePagination() splits content into page-height chunks
      → PAGE_DIMENSIONS["A4"|"LETTER"] gives {width, height} in mm
      → paginated-preview.tsx renders each chunk in a page-sized frame with shadow border
```

### Key files and their roles

| File | Role |
|------|------|
| `apps/backend/app/rendering/theme_profiles.py` | `PageSize = Literal["A4", "LETTER"]`; `_normalize_page_size()`; `build_design()` writes `design["page"]["size"]` |
| `apps/backend/app/schemas/models.py` | `Literal["A4", "LETTER"]` in two Pydantic fields |
| `apps/backend/app/routers/resumes.py` | `pattern="^(A4|LETTER)$"` regex on 3 PDF endpoints; `_coerce_page_size()` |
| `apps/backend/app/pdf.py` | Playwright-based PDF renderer; `_resolve_pdf_format()` maps A4→"A4", LETTER→"Letter" |
| `apps/backend/app/rendering/rendercv_engine.py` | `render_resume_bundle()` calls `generate_typst()`, `generate_pdf()`, `generate_png()` — all Typst-based |
| `apps/frontend/lib/types/template-settings.ts` | `export type PageSize = 'A4' \| 'LETTER'`; `PAGE_SIZE_INFO` record |
| `apps/frontend/lib/constants/page-dimensions.ts` | `PAGE_DIMENSIONS = { A4: {width:210, height:297}, LETTER: {width:215.9, height:279.4} }` |
| `apps/frontend/components/preview/use-pagination.ts` | `usePagination()` computes page breaks from `getContentAreaPx(pageSize, margins)` |
| `apps/frontend/components/preview/paginated-preview.tsx` | Renders hidden measurement div + visible per-page frames |
| `apps/frontend/components/builder/formatting-controls.tsx` | UI control for page size selection |

---

## The Freeflow Concept

Freeflow is a virtual page size that removes the hard page height constraint from both preview and PDF:

- **Preview**: single continuous scrollable column — no page break markers, no page shadow borders
- **PDF download**: Playwright prints the preview HTML to A4, letting the browser naturally paginate content — same as "Print to PDF" in any browser
- **PNG output**: not generated for FREEFLOW (PNG is a per-page format; for online applications it's irrelevant)
- **ATS/renderCV PDF**: skipped for FREEFLOW; Playwright handles PDF instead

The width stays A4 (210mm) so fonts, margins, and column layout match a standard resume. Only the height constraint is lifted.

---

## Implementation Approach

### Why skip renderCV/Typst for PDF?

Typst is a paginated layout engine. Its `design["page"]["size"]` accepts "a4" or "us-letter" — there is no "infinite scroll" mode. We could set a very tall custom paper size (e.g., `{width: "8.5in", height: "1000in"}`) but:
- RenderCV validates the design dict against a schema; custom page sizes likely fail validation
- The resulting PDF would be one giant page, not standard A4 — unusable in ATS uploads
- Playwright already exists in the codebase and produces proper multi-page A4 PDFs from the HTML preview

Playwright's `page.pdf(format="A4")` + the existing frontend print route is the right path for FREEFLOW downloads.

### The minimal change set

Rather than a new rendering pipeline, FREEFLOW is implemented as a flag on the existing system:

1. **Type layer**: add `"FREEFLOW"` to `PageSize` in both backend and frontend
2. **Validation**: relax the `^(A4|LETTER)$` regex to `^(A4|LETTER|FREEFLOW)$`; update `_normalize_page_size()` and `_coerce_page_size()` to pass FREEFLOW through
3. **Design dict**: `build_design()` for FREEFLOW emits `page.size = "a4"` (A4 width, standard margins) — the design dict is only used for renderCV anyway, and renderCV is bypassed for FREEFLOW PDF generation
4. **PDF endpoint**: detect FREEFLOW → use Playwright path, skip renderCV path
5. **Frontend preview**: `usePagination()` early-returns a single full-height page when `pageSize === "FREEFLOW"`; `paginated-preview.tsx` skips page-frame chrome (shadow, margins, page labels) in FREEFLOW mode
6. **`PAGE_DIMENSIONS`**: add `FREEFLOW: { width: 210, height: 9999 }` as a sentinel (height 9999mm means usePagination will never trigger a split since no real content is that tall)

---

## File-by-File Changes

### Backend

**`apps/backend/app/rendering/theme_profiles.py`**
- `PageSize = Literal["A4", "LETTER", "FREEFLOW"]`
- `_normalize_page_size(value)`: return `"FREEFLOW"` when `value == "FREEFLOW"`, else existing logic
- `build_design()` legacy path: when `settings.page_size == "FREEFLOW"`, set `page["size"] = "a4"` (so renderCV YAML is valid if ever generated)
- `_resolve_theme_profile_state()` line ~387: same — map FREEFLOW → "a4" in Typst design dict
- `theme_settings_from_rendercv_sections()` line ~871: FREEFLOW → A4 equivalent when reading back from YAML

**`apps/backend/app/schemas/models.py`**
- Two `Literal["A4", "LETTER"]` → `Literal["A4", "LETTER", "FREEFLOW"]`

**`apps/backend/app/routers/resumes.py`**
- `_coerce_page_size()` (line 299): accept "FREEFLOW" as-is
- Three `pattern="^(A4|LETTER)$"` → `pattern="^(A4|LETTER|FREEFLOW)$"` (lines ~2543, ~2665, ~3063)
- PDF download endpoints: when `pageSize == "FREEFLOW"`, use Playwright path (`render_resume_pdf()`) not renderCV's Typst PDF. Already have both paths in different endpoints; need to route correctly.

**`apps/backend/app/pdf.py`**
- `_resolve_pdf_format()`: add `"FREEFLOW": "A4"` to format map

**`apps/backend/app/rendering/rendercv_engine.py`**
- `render_resume_bundle()`: add a guard — when `page_size == "FREEFLOW"`, skip `generate_pdf()` and `generate_png()` (return empty/None for those); only generate HTML/Markdown if needed

### Frontend

**`apps/frontend/lib/types/template-settings.ts`**
- `export type PageSize = 'A4' | 'LETTER' | 'FREEFLOW'`
- Add `FREEFLOW` to `PAGE_SIZE_INFO`: `{ name: 'Freeflow', dimensions: 'Continuous' }`

**`apps/frontend/lib/constants/page-dimensions.ts`**
- `PAGE_DIMENSIONS.FREEFLOW = { width: 210, height: 9999 }` — A4 width, sentinel height
- All helper functions (`getContentArea`, `getContentAreaPx`, `calculatePreviewScale`, `getPageDimensionsPx`) accept `PageSize` — they'll work as-is since FREEFLOW is now a valid key

**`apps/frontend/components/preview/use-pagination.ts`**
- At the start of `calculatePageBreaks()`, add:
  ```ts
  if (pageSize === 'FREEFLOW') {
    const contentHeight = container.scrollHeight;
    setTotalContentHeight(contentHeight);
    setPages([{ pageNumber: 1, contentOffset: 0, contentEnd: contentHeight }]);
    setIsCalculating(false);
    return;
  }
  ```
- This skips all break-point logic; content becomes one infinite page

**`apps/frontend/components/preview/paginated-preview.tsx`**
- When `settings.pageSize === 'FREEFLOW'`: render a single `<div>` with the full content, no page-border chrome (no shadow, no page label "Page 1 of 1"), with horizontal width set to A4 (210mm scaled)
- The existing auto-zoom logic based on `PAGE_DIMENSIONS[settings.pageSize].width` works fine since FREEFLOW has width=210

**`apps/frontend/components/builder/formatting-controls.tsx`**
- Add FREEFLOW as a page size option in the UI (e.g., "Freeflow — Online Use")

---

## What Does NOT Change

- The renderCV adapter (`rendercv_adapter.py`) — FREEFLOW still produces the same YAML structure
- The Typst themes — no template changes needed
- The resume data schema — FREEFLOW is purely a display/rendering concern
- The tailor/improve endpoints — page size is only used at render/download time
- PNG generation API — just returns nothing/null for FREEFLOW (frontend doesn't display PNGs)

---

## Edge Cases

| Scenario | Handling |
|----------|----------|
| FREEFLOW selected, user requests PDF | Playwright prints frontend `/print/[id]` URL → natural A4 pagination |
| FREEFLOW selected, user requests PNG | Return empty or disable button in UI; PNG is per-page format |
| FREEFLOW selected, renderCV YAML editor shown | Design dict uses `"a4"` size — valid, renders as A4 in editor |
| FREEFLOW content shorter than one A4 page | Works fine — single scroll, single PDF page |
| FREEFLOW content very long (5 "pages") | Scrolls continuously in preview; PDF has 5 A4 pages |
| User switches from FREEFLOW back to A4 | Theme settings update normally; pagination resumes |

---

## Implementation Order

1. Backend types & validation (PageSize, _normalize, _coerce, regex)
2. `build_design()` FREEFLOW → "a4" mapping
3. `render_resume_bundle()` guard (skip PDF/PNG for FREEFLOW)
4. PDF endpoint routing (FREEFLOW → Playwright)
5. Frontend types + PAGE_DIMENSIONS sentinel
6. `usePagination()` early-return
7. `paginated-preview.tsx` freeflow render path
8. `formatting-controls.tsx` UI option
9. Tests: type validation, render routing, preview rendering

---

## Summary

FREEFLOW is a thin new value in the existing `PageSize` type that flips two switches:
1. Backend: route PDF through Playwright (not Typst), skip PNG
2. Frontend: skip pagination, render as single scroll

Total scope: ~8 files, mostly small additions. No new architecture, no new rendering pipeline.
