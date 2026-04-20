# Phase 3.11.3 — Dashboard UI/UX Design System (Composer)

**Source:** `screenshots/builder-92XRAZ`  
**North star:** Dense, scannable, low-friction daily editing (Linear + Notion + Raycast), not marketing polish.  
**Companion:** Aligns with `phase-3.11.2-refactor-dashboard-UIUX-design-system-codex.md` but tightens IA, token enforcement, and per-surface layout proposals for implementation.

## 0) Screenshot audit notes

- **All 30 files under the folder were considered** for IA and density; several groups reuse the same bitmap.
- **Byte-identical captures (same UI frame, different filenames):**
  - `01-resume-visual/cv/01-personal-info.png` … `07-cv-full-expanded.png` — identical file size (`369497` bytes each). Recommendations below are **mapped by filename intent** (which section the capture was meant to represent), not pixel differences.
- **`03-cl-and-outreach/*.png`:** Visually the same pattern (stacked cards + empty split preview); treat filename as intent (workspace vs. cover letter vs. outreach).
- **`04-jd-match/01-jd-match-tab-disabled.png` and `05-additional-questions/01-additional-questions-tab-disabled.png`:** Filename says “disabled tab”; the frame may still show another sub-panel in the capture. Plan assumes **true disabled/empty states** for those tabs when job/questions are unavailable.

---

## 1) Current pain points

### 1.1 Puffiness (padding, chrome weight, radii, shadows)

| Area | What reads as “puffy” | Effect |
|------|------------------------|--------|
| Global shell (`00-top-tabs-overview-resume.png`) | Large document title (serif), status line, icon cluster, **two loud primary buttons** (Save blue + Download green), then another full tab row before content | **Vertical tax** before any field is editable; visual competition with the actual task |
| Resume editor cards (`01-resume-visual/cv/*`) | Card-in-card, thick input chrome, labels on their own row above every control, generous internal padding | Few fields visible per viewport; constant scroll through “Personal → Links → …” |
| Design stack (`01-resume-visual/design/01-core.png`, `02-page-layout.png`, `04-typography.png`, `07-templates-advanced.png`) | **Three nav bands** (Resume sub-tabs + design tertiary strip + section headers), large toggles, wide theme row, bordered everything | Feels like configuration software, not a fast editor |
| Page & layout (`…/design/02-page-layout.png`) | **Repeated full unit strip** (CM/MM/IN/PT/EM/EX) per numeric field | Horizontal bloat + pattern repetition; hard to scan diffs between rows |
| Typography (`…/design/04-typography.png`) | Font pickers as **large grid tiles** | Rare action occupies prime vertical space; pushes frequent controls down |
| Locale (`…/locale/01-basics.png`, implied `02-phrases.png`, `03-months.png`) | Duplicate “Locale” titling (“LOCALE COPY” + “LOCALE” + pill “BASICS”), wide rows for short strings | Tab hopping for tiny datasets |
| Metadata (`…/metadata/01-metadata-panel.png`) | Long privacy/helper copy before fields; tall stacks for 3–4 short values | Low ROI per scroll |
| Settings (`…/settings/01-general.png`) | “RUNTIME SETTINGS” + “RUNTIME” + “GENERAL” **triple labeling**; per-row descriptions under labels | Row height explodes; scanning settings becomes slow |
| Raw YAML (`02-resume-raw-yaml/**/01-full.png`) | Toolbar/status wraps to **multiple rows** of bordered buttons; “RAW YAML” duplicated as toggle + panel framing | Code viewport starts too low |
| CL & outreach (`03-cl-and-outreach/*.png`) | Two tall cards, large text areas, **split preview columns** mostly empty placeholders | ~50% of width feels inert during drafting |
| Preview column (multiple shots) | “PREVIEW” header + subtitle + Refresh while global toolbar already has preview-ish affordances | Redundant chrome when preview could be quieter |

### 1.2 Click fatigue and redundant / misplaced controls

- **Navigation depth:** Workspace tab → Resume sub-tab (CV/Design/…) → (Design) tertiary strip → section. That is **up to four horizontal bands** before editing.
- **Duplicate semantics:** “Edit” appears on title and again on sections; **Refresh** appears in more than one place in some flows; **Save** appears globally and again on cards (CL).
- **RAW YAML** is both a mode switch and a mental model split from “CV” without a single compact entry point (e.g. command palette / overflow).
- **Bold keywords** (and similar job-matching inputs) risk existing in **both Settings and Metadata** with different formats — two sources of truth, double maintenance.
- **Reset actions** (theme, locale, settings) are visually loud and repeated instead of one **danger-clustered** advanced surface.
- **High-contrast primaries** (Save + Download) steal attention from inline fieldwork; daily editing wants **muted chrome + one primary** (export as secondary or menu).

### 1.3 Scroll and scan issues

- **CV flow:** Personal + links consumes the fold; Summary/Experience feel “below the fold” mentally even when accordion exists.
- **Design flow:** Unit grids and font grids create **long vertical documents** inside the left pane.
- **Preview-first width:** When preview is empty (“No RenderCV artifacts yet”), the layout still allocates a **large right gutter**, shrinking the editor’s typing width.
- **Raw YAML:** Line count is the product feature; chrome should not consume the first 150+ px vertically.

---

## 2) New design principles

### 2.1 Density and spacing (8px grid, half-steps allowed)

**Intent:** Default surfaces feel like a **tool**, not a landing page.

| Token | Value | Use |
|-------|-------|-----|
| `--ds-space-0_5` | 2px | Icon-text micro-gap, align optical center |
| `--ds-space-1` | 4px | Inline clusters (label + control) |
| `--ds-space-1_5` | 6px | Compact groups |
| `--ds-space-2` | 8px | Default inner padding for rows |
| `--ds-space-3` | 12px | Between subsection groups |
| `--ds-space-4` | 16px | Rare: panel edge insets only |

**Density rules**

- **Control height target:** `28px` (max `32px` for textarea first line / token fields).
- **Tabs:** `28px` hit target, **no** oversized pill chrome for inactive states.
- **No** `rounded-lg`+ on data surfaces; prefer `rounded-sm` (4px) or `rounded-none` for tables/dense forms.
- **No** elevated `shadow-lg` on editor cards; use **hairline border** or **1px divider** + background step (`bg-muted/30`) only.
- **Prefer single-line field rows:** label + control on one row for short values (metadata, locale basics); reserve stacked label for multiline only.

### 2.2 Typography scale (functional, Swiss-adjacent)

| Role | Spec | Rules |
|------|------|--------|
| Document title (shell) | 14–15px / 600, sans | Drop display serif for shell; serif belongs inside PDF preview only |
| Section title | 12px / 600 | Sentence case or small caps **only** if tracked tightly |
| Tab | 11px / 600, `tracking-wide`, uppercase optional | Tighter line box; underline 2px for active |
| Field label | 11px / 500, muted | Inline when possible |
| Body / input | 13px / 450–500 | `leading-snug` (1.25–1.35) |
| Mono / status | 11px mono | One line in shell: mode · id · sync state |
| Helper | 11px muted | **Hidden by default**: `?` tooltip or “Learn more” in Advanced |

### 2.3 Color usage (restraint = speed)

- **One primary accent** per view for the **single** destructive-or-commit action if needed; prefer **auto-save** so blue “Save” is not a billboard.
- **Download/export:** secondary (outline/ghost) or behind **overflow menu** (`…`) unless user is explicitly in export mode.
- **Semantic colors:** reserved for errors, destructive, success sync — not decoration.
- **Borders:** default `border-border`; focus `ring-1 ring-ring` — avoid thick black boxes on every control (raw YAML toolbar).

### 2.4 Interaction + IA rules

1. **Inline first:** edit in place; expand panels only for bulk (bullets, template strings).
2. **Max two navigation layers** in the editor context: **Workspace** (Resume / CL / …) + **one** secondary (sidebar or segmented). Tertiary design tabs become **left nav** or **accordion** inside Design, not a third horizontal row.
3. **One save model:** autosave + explicit “Retry sync” on failure; remove duplicate Save on cards.
4. **Advanced:** theme strings, template placeholders, unit overrides, rare typography → `Advanced` disclosure or command palette.
5. **Command palette / `⌘K`:** mode switch (Visual ↔ YAML), jump to section, theme, export.
6. **Preview:** collapsible, resizable, **remembered ratio**; empty state should not steal half the width by default.

---

## 3) Tailwind / design tokens to enforce

> Adapt file path to where your `@theme` lives (`app/globals.css` or equivalent). Names align with 3.11.2 where useful; 3.11.3 adds **density** and **chrome** tokens.

```css
@theme {
  /* Spacing — compact editor scale */
  --ds-space-0_5: 2px;
  --ds-space-1: 4px;
  --ds-space-1_5: 6px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
  --ds-space-4: 16px;

  /* Sizes */
  --ds-control-h: 28px;
  --ds-control-h-comfort: 32px;
  --ds-tab-h: 28px;
  --ds-sidebar-w: 220px;
  --ds-divider: 1px;

  /* Radii — flat UI */
  --radius-field: 4px;
  --radius-panel: 6px;

  /* Typography */
  --ds-text-title: 15px;
  --ds-text-section: 12px;
  --ds-text-tab: 11px;
  --ds-text-label: 11px;
  --ds-text-body: 13px;
  --ds-text-mono: 11px;

  /* Colors — semantic */
  --ds-bg-canvas: oklch(0.97 0.01 95);
  --ds-bg-surface: oklch(1 0 0);
  --ds-bg-subtle: oklch(0.96 0.005 95);
  --ds-fg-default: oklch(0.2 0 0);
  --ds-fg-muted: oklch(0.45 0 0);
  --ds-border: oklch(0.88 0.01 95);
  --ds-border-strong: oklch(0.35 0 0);
  --ds-accent: oklch(0.45 0.14 264);
  --ds-danger: oklch(0.5 0.2 25);
  --ds-success: oklch(0.45 0.08 180);
}
```

**Tailwind usage rules (enforce in PR review)**

- Prefer `p-2`, `gap-2`, `py-1.5`; **ban** `p-6`, `py-6`, `gap-6` on editor surfaces unless explicitly a marketing block.
- Prefer `text-xs` for tabs/labels, `text-[13px]` or `text-sm` tuned to 13px for inputs.
- Buttons: `h-7 px-2 text-xs` default; `h-8` only for sole primary in a dialog.
- Icons: `size-3.5` default toolbar; `size-4` max.
- Shadows: **`shadow-none`** on forms; optional `shadow-sm` **only** for floating popovers/modals.
- Surfaces: `bg-background`, `border-border`, divide with `divide-y` instead of nested cards.

---

## 4) Component library rules

### 4.1 Buttons

- **Primary:** one per region (ideally none if autosave). Solid, `h-7`, `text-xs`.
- **Secondary:** `variant="outline"` ghost border.
- **Tertiary / icon:** square `h-7 w-7`, tooltip required.
- **Destructive:** never icon-only without tooltip; confirm in modal for reset-all-theme.
- **Placement:** global export/download lives in **overflow** or right header **after** editor actions; avoid twin loud CTAs.

### 4.2 Inputs and fields

- Default **single-line row**: `[label 30% | field 70%]` for short text; switch to grid only when it reduces scroll.
- **Textarea:** min-h by content with **resize-y**; optional “expand” for bullets.
- **Numeric + unit:** one **global unit** control (sticky in Design toolbar) + numeric inputs only — **do not** repeat CM/MM/IN per row.
- **Focus:** ring only; no thick outer border on container.

### 4.3 Cards

- **Avoid nested cards.** Prefer one panel with `divide-y`.
- If a card is required: `rounded-md`, `border`, **no** shadow, `p-2`.

### 4.4 Selectors and tabs

- **Workspace tabs:** text + underline; equal spacing compact.
- **Resume mode:** prefer **vertical nav** (CV, Design, Locale, …) at `~220px` vs. five boxed tabs.
- **Design categories:** vertical list with count badge optional; search at top of long lists (fonts).

### 4.5 Modals and popovers

- Modals: confirm destructive, bulk diff, export options.
- Popovers: color pickers, font preview, unit override — not full-page grids.

### 4.6 Sidebars and split panes

- Resizable split; **default 55/45 editor-heavy** when preview empty; flip when preview pinned.
- Preview header: single row — title + subtle sync indicator; Refresh only if not auto-invalidating.

### 4.7 Lists / sections (CV entries)

- Section header: **title + inline add** + overflow (`…`) for visibility/reorder.
- Reorder: drag handle or `⌘↑↓`; avoid large arrow stacks consuming width.
- **Inline edit:** click row to expand **in place**; no separate “edit sheet” unless mobile.

### 4.8 Empty and disabled states

- Empty preview: **compact** banner inside preview, not full gray void with tiny centered text.
- Disabled JD / Questions tabs: tooltip on hover explaining **why** disabled; no layout jump when enabled.

---

## 5) Step 2 — High-level refactored layout (by screenshot path)

Below: **what we would change** relative to each capture’s intent. Items marked **(same frame)** share one bitmap; intent differs by filename.

### 5.1 `00-top-tabs-overview-resume.png`

- Collapse header: **smaller title**, single-line status (mono), **icon toolbar** only + `…` menu for export/history.
- **Workspace tabs** directly under title row **or** integrated as top segmented control with **no** extra subtitle band.
- **Resume** default: **left nav** (CV, Design, …) instead of second horizontal tab strip.
- Preview: optional; **toggle preview pin** remembers width.

### 5.2 `01-resume-visual/cv/01-personal-info.png` **(same frame as other `cv/` files)**

- Replace card stack with **one divided panel**; reduce label chrome; inline short fields.
- **Links:** one compact table (label | url | actions); `Add` as text button in header row.
- Photo URL: move to **overflow** or “Contact advanced”.

### 5.3 `01-resume-visual/cv/02-summary.png` **(same frame)**

- Summary: default **expanded inline textarea** in daily mode; collapse only on user preference (stored).
- Remove duplicate edit/eye on header if visibility is in overflow.

### 5.4 `01-resume-visual/cv/03-experience.png` **(same frame)**

- Experience as **dense timeline list**: company/title row + inline dates; bullets in expandable block.
- **Add entry** inline at bottom of list; drag to reorder.

### 5.5 `01-resume-visual/cv/04-education.png` **(same frame)**

- Mirror experience density; fewer fields → two-column compact grid without card wrappers.

### 5.6 `01-resume-visual/cv/05-projects.png` **(same frame)**

- Project rows: name + link + tech chips inline; details on expand.

### 5.7 `01-resume-visual/cv/06-skills.png` **(same frame)**

- Skills as **token input** (comma-separated) or grouped tags with typeahead; avoid one giant textarea unless user chooses Advanced.

### 5.8 `01-resume-visual/cv/07-cv-full-expanded.png` **(same frame)**

- Represents “full CV expanded”: implement **scroll container** only in middle pane; sticky mini-outline (sections) on left edge of editor.

### 5.9 `01-resume-visual/design/01-core.png`

- Remove triple “DESIGN” labeling; single **Design** header with theme on same row as reset (reset → `Advanced` dropdown).
- Replace giant toggles with **compact switches** (`h-4 w-7` visual max) + optional description in tooltip.
- Tertiary horizontal tabs → **vertical sub-nav**.

### 5.10 `01-resume-visual/design/02-page-layout.png`

- **Global unit** selector once; margins in **4-row compact table**.
- Alignment dropdowns: same row where possible.

### 5.11 `01-resume-visual/design/03-header-connections.png`

- (Intent: header/links in theme) Group related booleans in **two columns**; connection icons preview next to control where helpful.

### 5.12 `01-resume-visual/design/04-typography.png`

- Replace font grid with **searchable combobox** + small preview line; advanced: “Browse all fonts” popover.

### 5.13 `01-resume-visual/design/05-colors.png`

- Compact color rows: swatch + hex + reset per row; **no** large tiles.

### 5.14 `01-resume-visual/design/06-sections-entries.png`

- Section toggles as **dense checklist** with live preview snippet optional in popover.

### 5.15 `01-resume-visual/design/07-templates-advanced.png`

- Fold template strings + placeholders into **Advanced** accordion; show only **template name** + “Edit strings” when collapsed.
- “Main column” textarea: full width but **tighter** vertical rhythm; monospace.

### 5.16 `01-resume-visual/locale/01-basics.png`

- Merge redundant headers; single **Locale** panel.
- Short keys (`Present`, `Month`): **narrow inputs**; use grid 2–3 columns.

### 5.17 `01-resume-visual/locale/02-phrases.png`

- Table edit: phrase key | value; filter box at top.

### 5.18 `01-resume-visual/locale/03-months.png`

- 12-row dense table; optional “Reset months” in overflow only.

### 5.19 `01-resume-visual/settings/01-general.png`

- Drop duplicate “General”; one **Runtime** nav item.
- Settings rows: **label left, control right, help icon** — no paragraph under every row by default.

### 5.20 `01-resume-visual/metadata/01-metadata-panel.png`

- Collapse instructional copy into tooltip; **Role/Company/Location** on one screen without scroll on laptop.
- **Bold keywords:** single canonical field (link from Settings if needed, read-only mirror).

### 5.21 `02-resume-raw-yaml/cv/01-full.png` (and parallel `design/`, `locale/`, `metadata/`, `settings/` raw shots)

- **YAML mode** is full-bleed editor: **one** thin toolbar row (`Resync`, `Copy`, `Apply`, overflow for rest).
- Line/col in **status bar** fused with sync state; no duplicated “RAW YAML” titling.
- Sub-tabs (CV/Design/…) → **dropdown segment** or sidebar to reclaim lines.

### 5.22 `03-cl-and-outreach/01-workspace-full.png`

- **Single editor column** with **tabs inside** (Cover letter | Outreach) or stacked **without** giant cards; unified sticky toolbar (Generate, Copy, tone).
- Preview: **one** column or hidden until content exists.
- **One save** model; remove second-card Save styling drift.

### 5.23 `03-cl-and-outreach/02-cover-letter-editor.png`

- Full-height editor; metadata (word count) in **status bar**; actions as icons + `…`.

### 5.24 `03-cl-and-outreach/03-outreach-editor.png`

- Same as cover letter; **Copy** as secondary icon next to primary Generate (if applicable), not loud separate pill unless last action.

### 5.25 `04-jd-match/01-jd-match-tab-disabled.png`

- Disabled: show **inline requirement** (“Paste JD to enable”) in tab panel without switching layout; when enabled, **two-column**: JD text | match results, minimal chrome.

### 5.26 `05-additional-questions/01-additional-questions-tab-disabled.png`

- Same pattern: compact empty state, single CTA to add questions / import.

---

## 6) Success metrics (for later implementation QA)

- **Laptop 13″:** CV Personal + at least **one** full section (e.g. Summary body) visible **without** scrolling after refactor.
- **Clicks to edit Experience first bullet:** reduce path length vs. triple-tab + accordion (target ≤ 2 interactions from Resume default).
- **Design:** changing page margins does not require horizontal scroll on 1280px width.
- **YAML:** first code line visible within **≤ 96px** top chrome under header.

---

_End of Phase 3.11.3 design-system document. Awaiting approval before any implementation work._
