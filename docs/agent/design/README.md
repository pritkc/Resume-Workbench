# Design reference

Files in this directory are **visual, layout, and PDF-design specifications** (Swiss style, template specs, print PDF notes). They inform UI and PDF work but are **not** the sole source of truth for:

- **RenderCV theme IDs** and runtime settings — use `apps/frontend/lib/types/render-theme.ts` and `apps/backend/app/rendering/theme_profiles.py`
- **Live CSS** — use `apps/frontend/app/(default)/css/globals.css` and builder components

When design docs disagree with code, **update the docs** after confirming intended product behavior.
