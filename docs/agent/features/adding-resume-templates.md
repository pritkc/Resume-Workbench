---
status: archive
---

# Historical Note: Adding Resume Templates

This file described the older frontend JSX/CSS resume template system.

That is no longer the live rendering architecture.

## Current Reality

- Resume previews come from RenderCV.
- Resume PDFs come from RenderCV.
- Theme configuration is handled through `RenderThemeSettings`, theme profiles, and RenderCV YAML/design controls.

If you need to extend the current rendering system, start with:

- `docs/agent/features/resume-templates.md`
- `apps/frontend/lib/types/render-theme.ts`
- `apps/frontend/lib/rendercv/theme-baselines.json`
- `apps/backend/app/rendering/theme_profiles.py`
- `apps/backend/app/rendering/rendercv_adapter.py`
- `apps/backend/app/rendering/rendercv_engine.py`

## When This Old Mental Model Still Matters

Only for historical context while reading older docs or legacy translation strings.

Do not use this document as implementation guidance for new rendering work.
