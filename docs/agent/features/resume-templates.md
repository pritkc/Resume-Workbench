# RenderCV Themes And Preview Settings

> Resume rendering is now driven by RenderCV theme settings, not frontend JSX template components.

## Current Theme IDs

Supported theme ids:

- `classic`
- `moderncv`
- `sb2nov`
- `engineeringresumes`
- `engineeringclassic`
- `harvard`
- `opal`
- `ember`
- `ink`

The canonical source for options is shared across frontend and backend.

## Canonical Theme Settings Shape

Primary settings live in `RenderThemeSettings` and include:

- `theme_id`
- `page_size`
- `density_profile`
- `bold_keywords`
- `accent_color`
- `show_contact_icons`
- `margins_mm`
- `design`
- `theme_profiles`
- `locale`
- `settings`

Important detail:

- `theme_profiles` stores sparse per-theme overrides so switching themes does not permanently destroy theme-specific edits

## Where Rendering Comes From

Resume preview and PDF generation use:

- `apps/backend/app/rendering/theme_profiles.py`
- `apps/backend/app/rendering/rendercv_adapter.py`
- `apps/backend/app/rendering/rendercv_engine.py`

The builder and resume detail page edit/view those settings through:

- `apps/frontend/components/rendercv/render-theme-controls.tsx`
- `apps/frontend/components/rendercv/render-preview-panel.tsx`
- `apps/frontend/app/(default)/resumes/[id]/page.tsx`
- `apps/frontend/components/builder/resume-builder.tsx`

Theme baselines live in:

- `apps/frontend/lib/rendercv/theme-baselines.json`

## Available Control Surface

The current UI supports much richer control than the old template docs described, including:

- theme switching
- page size
- page margins
- typography and alignment
- colors
- header/contact presentation
- section and entry spacing
- advanced template/design overrides
- locale text
- runtime settings like PDF title and current date

Raw YAML editing is the escape hatch for settings that do not fit the structured controls.

## Rendering Boundaries

- Resume preview artifacts and resume PDFs come from RenderCV.
- Cover-letter PDFs still use the Playwright/HTML pipeline in `apps/backend/app/pdf.py`.
- Application-pack preview and confirm both persist RenderCV artifacts.

## Testing Expectations

Relevant test areas:

- `apps/backend/tests/unit/test_theme_profiles.py`
- `apps/backend/tests/unit/test_rendercv_adapter.py`
- `apps/backend/tests/unit/test_rendercv_engine.py`
- `apps/frontend/tests/render-theme-controls.test.tsx`

The backend includes ATS-oriented coverage for supported themes. Keep that intact when changing design defaults or generated PDF behavior.

## Agent Notes

- If you add a new theme, update frontend type unions, frontend option lists/baselines, backend theme normalization, and RenderCV tests together.
- Do not revive the old frontend resume template/PDF path unless that is an explicit product decision.
- Some older docs and translation strings still refer to legacy templates; for the live rendering stack, trust the RenderCV files above.
