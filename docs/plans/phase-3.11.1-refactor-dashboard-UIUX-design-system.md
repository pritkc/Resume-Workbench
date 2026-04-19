# Phase 3.11.1 — Builder UI/UX Refactor: Design System & Layout Plan

> Swiss International Style · Linear-density · Keyboard-first · Daily editing use
> Source: screenshots/builder-92XRAZ

---

## 1. Current Pain Points

### 1.1 Global Shell

| Area | Problem |
|------|---------|
| **Top header bar** | ~64px tall. Title font is oversized (bold, large). SAVE (blue) + DOWNLOAD (green) break the monochrome palette. Back arrow `←` is a square button that reads like a nav item, not a utility. |
| **Top-level tab bar** | RESUME / CL & OUTREACH / JD MATCH / ADDITIONAL QUESTIONS — tabs are ~40px tall with oversized padding. Disabled tabs are barely scannable. |
| **Mode status line** | "EDIT MODE · 92XRAZ All changes saved." — good content, but competes with the tab row for vertical space. |
| **Three-level tab nesting** | Top tabs → inner tabs (CV/DESIGN/LOCALE/SETTINGS/METADATA) → sub-tabs (CORE/PAGE & LAYOUT/…/TEMPLATES & ADVANCED) = 3 clicks to reach any leaf control. Fatal for daily editing. |
| **Preview pane** | Half the screen width occupied by an empty "No RenderCV artifacts yet." state for most of the session. REFRESH is isolated top-right with no status hint. |

### 1.2 CV Panel — Personal Info

| Area | Problem |
|------|---------|
| **Field rows** | Each label+input row is ~60–72px tall due to `py-4`-class padding. 10 fields = 600–720px scroll before even seeing Summary. |
| **Profile Links** | Each link is a card with border, padding, an icon, and a delete button. The ADD LINK button is full-width and chunky. One link per card = 3× the height needed. |
| **Section spacing** | Section title "Personal Information" + subtitle text occupies ~50px above the form with no informational value — user already knows where they are. |

### 1.3 CV Panel — Experience / Education / Projects

| Area | Problem |
|------|---------|
| **Entry cards** | Each card has large internal padding, a visible drag handle, a section header row (title + company + dates), and collapsible bullet rows below. Card shadow and border-radius soften the edges. |
| **Bullet rows** | Each bullet is its own full-height row (input + delete button). 5 bullets = 5 rows × ~48px = 240px just for bullets. |
| **ADD ENTRY buttons** | Full-width, chunky `py-3` buttons between sections. Visually weighty for an action used once per session. |
| **Drag handles** | Large, always-visible. Rarely used daily. Occupy ~32px left margin per entry. |

### 1.4 CV Panel — Skills

| Area | Problem |
|------|---------|
| **Tag input** | Currently no visible tag-chip UI — appears as a plain multi-line textarea or comma-separated input. Unclear affordance. |

### 1.5 Design Tab

| Area | Problem |
|------|---------|
| **Sub-tab overflow** | 7 sub-tabs (CORE / PAGE & LAYOUT / HEADER & CONNECTIONS / TYPOGRAPHY / COLORS / SECTIONS & ENTRIES / TEMPLATES & ADVANCED) overflow horizontally. Users must scroll or wrap. |
| **Unit selectors** | Each numeric field has 6 inline unit buttons (CM / MM / IN / PT / EM / EX). This pattern repeats on every row, consuming ~60% of the row width with low-use controls. |
| **Typography font picker** | Selecting a font shows a full grid of 15+ font name chips below the current value input, expanding inline and pushing all subsequent content down. Extremely tall. |
| **Reset buttons** | RESET THEME DEFAULTS / RESET LOCALE / RESET SETTINGS are prominent full-width bordered buttons at top of each tab. Destructive actions given primary placement. |
| **Redundant section headers** | CORE, PAGE MARGINS, LAYOUT, HEADER, HEADER CONNECTIONS — these repeat the sub-tab label in a `<h3>` above each group, wasting ~24px per group. |

### 1.6 Locale Tab

| Area | Problem |
|------|---------|
| **BASICS** | 6 short fields but each row is ~56px. Content ends at ~400px; remaining 400px of panel is dead whitespace. |
| **PHRASES** | Only 1 field (Degree with Area). An entire tab for a single input field. |
| **MONTHS** | Two comma-input fields for abbreviations + names. Could be inline side-by-side. |

### 1.7 Settings Tab

| Area | Problem |
|------|---------|
| **Inline descriptions** | "Show Summary Heading — When section is enabled, hide the heading to save space." — 3-line description for a toggle. Could be a `title` tooltip. |
| **Bold Keywords duplication** | Bold Keywords appears in both SETTINGS → GENERAL and METADATA tab as separate inputs that must be kept in sync manually. |

### 1.8 Metadata Tab

| Area | Problem |
|------|---------|
| **Stacked single-value fields** | ROLE / COMPANY / LOCATION each get their own labeled section with full-width tall inputs. Three large inputs for short values. |
| **Bold Keywords textarea** | One-keyword-per-line textarea when Settings also has a comma-separated version of the same data — duplicate control. |
| **Descriptive text** | Long paragraph "Role, company, location, and bold keywords for the dashboard and PDF. Included with 'Copy for LLM' together with the CV block — nothing else is sent externally." occupies ~48px of prime real estate. |

### 1.9 Raw YAML Mode

| Area | Problem |
|------|---------|
| **Toolbar** | 5 action buttons in two rows (RESYNC / COPY SECTION / COPY FULL YAML — then COPY FOR LLM / APPLY CLIPBOARD). Two rows is wasteful; all five fit in one compact row. |
| **Status line** | "ALL CHANGES SAVED. LN 150 COL 1 / 150 LINES" appears in two lines below toolbar — could be a single inline status. |

### 1.10 CL & Outreach Tab

| Area | Problem |
|------|---------|
| **Panel asymmetry** | Cover Letter has a SAVE (blue-filled) button; Outreach Message has a SAVE (outline) + COPY (outline) — inconsistent button hierarchy. |
| **Empty right half** | Preview shows "No cover letter yet — paste text or use Generate above." for both columns. The right pane is a wide ghost. |
| **Verbose placeholder text** | "Your cover letter will appear here after tailoring your resume with cover letter generation enabled..." — 3 lines of explanation for an empty state. |
| **No link to generate action** | No inline path to trigger generation. User must infer they need to go elsewhere (Tailor flow) to populate this. |

---

## 2. New Design Principles

### 2.1 Spacing Scale

Collapse to a tighter base unit. All padding/margin values must come from this scale:

| Token | Value | Use |
|-------|-------|-----|
| `space-0.5` | 2px | Icon nudges, tight separators |
| `space-1` | 4px | Inline label-to-input gap |
| `space-1.5` | 6px | Within-row element gap |
| `space-2` | 8px | Field internal padding (py, px) |
| `space-3` | 12px | Between-field gap |
| `space-4` | 16px | Between-section gap |
| `space-6` | 24px | Panel section separator |

**Rule:** Form rows use `py-1.5 px-2`. Cards use `p-2`. Section headers use `py-2`. No `py-4`, `py-6`, `p-6` anywhere in editor panels.

### 2.2 Typography Scale

| Role | Class | Size |
|------|-------|------|
| Page title | `font-mono text-xs uppercase tracking-widest` | 11px |
| Section label | `font-mono text-[10px] uppercase tracking-wider text-black/50` | 10px |
| Field label | `font-mono text-[11px] uppercase tracking-wide` | 11px |
| Body / input | `font-sans text-sm` | 14px |
| Helper text | `font-sans text-xs text-black/40` | 12px |
| Tab label | `font-mono text-[11px] uppercase tracking-widest` | 11px |

**Rule:** Remove all `text-base`, `text-lg`, `text-xl` from editor UI. Reserve larger sizes for the resume preview only.

### 2.3 Color Usage

| Token | Value | Permitted Use |
|-------|-------|--------------|
| Canvas | `#F0F0E8` | Page background only |
| Ink | `#000000` | All text, borders, active tabs |
| Ink/60 | `rgba(0,0,0,0.6)` | Secondary labels, helper text |
| Ink/30 | `rgba(0,0,0,0.3)` | Disabled states, placeholders |
| White | `#FFFFFF` | Card/input backgrounds |
| Hyper Blue | `#1D4ED8` | Primary CTA only (one per viewport) |
| Signal Green | `#15803D` | Success states, save confirmation only |
| Alert Red | `#DC2626` | Destructive actions, errors |

**Rule:** No colored buttons except one primary CTA (DOWNLOAD). SAVE becomes a monochrome outline button. No green DOWNLOAD — that is the only color accent in the shell.

### 2.4 Component Density Rules

- **Minimum touch target:** 28px height (not 40px+)
- **Tab height:** 28px
- **Input height:** 28px (`h-7`)
- **Button height:** 26–28px (`py-1 px-2` or `py-1 px-3`)
- **Card padding:** `p-2` maximum
- **Row height target:** 28–32px per field row (label inline or above at 16px)
- **Section separator:** `border-t border-black/10 my-3` — no `my-6` or `my-8`

---

## 3. Tailwind Token Overrides / Design Tokens to Enforce

```css
/* globals.css additions — editor scope only */

/* Tighten all editor panel form rows */
.editor-panel .field-row {
  @apply flex items-center gap-2 py-1.5 min-h-[28px];
}

/* Compact tab bar */
.editor-tabs .tab {
  @apply font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 h-7
         border-b-2 border-transparent cursor-pointer;
}
.editor-tabs .tab[data-active="true"] {
  @apply border-black font-bold;
}

/* Compact input */
.editor-input {
  @apply h-7 px-2 text-sm font-sans border border-black/30
         bg-white focus:border-black focus:outline-none rounded-none;
}

/* Unit selector group — collapsed */
.unit-selector {
  @apply flex items-center gap-px;
}
.unit-selector button {
  @apply font-mono text-[9px] uppercase px-1 py-0.5 h-5
         border border-black/20 hover:border-black hover:bg-black hover:text-white
         rounded-none transition-none;
}
.unit-selector button[data-active="true"] {
  @apply bg-black text-white border-black;
}

/* Section header inside panel */
.panel-section-header {
  @apply font-mono text-[10px] uppercase tracking-widest text-black/50
         border-t border-black/10 pt-2 mt-3 mb-1.5;
}

/* Entry card */
.entry-card {
  @apply border border-black/20 p-2 bg-white;
}
.entry-card:hover {
  @apply border-black;
}
```

---

## 4. Component Library Rules

### 4.1 Button

```
Primary CTA (DOWNLOAD):  border-2 border-black bg-black text-white font-mono text-[11px] uppercase tracking-wider px-3 py-1 h-7 shadow-[2px_2px_0_#000] hover:shadow-none hover:translate-x-px hover:translate-y-px
Secondary (SAVE):         border border-black bg-white text-black font-mono text-[11px] uppercase tracking-wider px-3 py-1 h-7
Ghost/Utility:            border border-black/30 bg-transparent text-black/60 font-mono text-[11px] uppercase px-2 py-1 h-7 hover:border-black hover:text-black
Destructive:              border border-red-600 text-red-600 font-mono text-[11px] uppercase px-2 py-1 h-7 — never primary placement, always inside "⋯" menu
```

**Rule:** No colored backgrounds except primary CTA. All buttons `rounded-none`. No icons inside buttons unless the button is icon-only.

### 4.2 Input

```
text input:   h-7 px-2 text-sm border border-black/30 bg-white focus:border-black rounded-none
textarea:     px-2 py-1.5 text-sm border border-black/30 bg-white focus:border-black rounded-none resize-y min-h-[56px]
select/dropdown: h-7 px-2 text-sm border border-black/30 bg-white focus:border-black rounded-none appearance-none
```

**Rule:** All inputs use `rounded-none`. No `shadow` on inputs. Focus ring = `border-black` only (no blue ring).

### 4.3 Card / Entry Card

```
border border-black/20 bg-white p-2 rounded-none
hover: border-black
active/editing: border-black shadow-[1px_1px_0_#000]
```

No `rounded-*`, no `shadow-md`, no `shadow-lg`. Cards are flat with 1px borders.

### 4.4 Toggle / Checkbox

```
Toggle: w-8 h-4 (not w-11 h-6). Pill shape is acceptable. Active = bg-black, inactive = bg-black/20.
Checkbox: w-3.5 h-3.5 border border-black rounded-none. Checked = bg-black.
```

### 4.5 Tab Bar

All tab bars use the same pattern:

```
Container: flex border-b border-black/20 gap-0
Tab:        font-mono text-[11px] uppercase tracking-widest px-3 h-7 flex items-center
            border-b-2 border-transparent -mb-px cursor-pointer text-black/50 hover:text-black
Active tab: border-b-2 border-black text-black font-bold
Disabled:   text-black/25 cursor-not-allowed
```

No background fills on tabs. Active tab = bottom border only.

### 4.6 Section Header (inside panel)

```
font-mono text-[10px] uppercase tracking-widest text-black/50 border-t border-black/10 pt-2 mt-3 mb-1.5
```

No `<h2>`/`<h3>` with large font sizes in editor panels.

### 4.7 Sidebar / Panel Header

```
Height: h-8 (32px)
Content: flex items-center justify-between px-3
Left: font-mono text-[11px] uppercase tracking-widest text-black/60
Right: utility buttons (h-6, ghost style)
```

Remove the current "THEME DESIGN / Visual editing for quick changes." paragraph — replace with the 32px panel header bar.

### 4.8 Modal / Popover

When used (e.g., confirming RESET THEME DEFAULTS):

```
border-2 border-black bg-[#F0F0E8] p-4 shadow-[4px_4px_0_#000]
Max width: 320px
No backdrop blur — use backdrop-brightness-90
```

### 4.9 Drag Handle

```
Visible only on row hover: opacity-0 group-hover:opacity-100
Size: 12px × 16px icon, text-black/30
Position: absolute left-0, not taking layout space (use negative margin or overlap)
```

### 4.10 Tag / Chip (Skills)

```
inline-flex items-center gap-1 border border-black/30 px-1.5 py-0.5 font-mono text-[11px] h-5
Delete button: ×, 12px, appears on hover
```

---

## 5. Refactored Layout — Main Builder

### 5.1 Shell Structure

```
┌─────────────────────────────────────────────────────────────┐
│  HEADER BAR  h-9 (36px)                                     │
│  [←] Title · mode-badge               [icons] [SAVE] [↓]   │
├─────────────────────────────────────────────────────────────┤
│  TOP TABS  h-7 (28px)                                       │
│  RESUME  │  CL & OUTREACH  │  JD MATCH  │  +QUESTIONS       │
├──────────────────────────────┬──────────────────────────────┤
│  EDITOR PANEL  (left ~42%)   │  PREVIEW PANE  (right ~58%)  │
│                              │                              │
│  [inner tabs h-7]            │  [REFRESH]  [status]         │
│  ───────────────             │                              │
│  [sub-tabs h-7, if needed]   │  <resume preview>            │
│                              │                              │
│  <content area, scrollable>  │                              │
│                              │                              │
└──────────────────────────────┴──────────────────────────────┘
```

**Changes:**
- Header shrinks from ~64px to 36px.
- Top tabs shrink from ~40px to 28px.
- Total chrome above content: 64px (was ~104px). Gain: 40px of editing real-estate.
- Status/mode line merged into the header bar right of the title (small mono text).

### 5.2 Header Bar (h-9 / 36px)

**Before:** Large title (`text-xl font-bold`), separate "EDIT MODE · 92XRAZ All changes saved." line, tall toolbar with icon padding.

**After:**
```
[←]  [title: font-mono text-sm font-bold]  [·]  [mode: font-mono text-[10px] text-black/50]  [status dot]
                                                     [pencil] [layout-toggle] [eye] [gear] [↩] [↪] [↺]  [SAVE]  [DOWNLOAD↓]
```

- Title: `font-mono text-sm font-bold uppercase` — not serif, not oversized
- Mode badge: `font-mono text-[10px] uppercase text-black/50` inline
- Icons: `w-4 h-4` (16px), not 20-24px
- SAVE: secondary button (border, no fill, h-7)
- DOWNLOAD: primary CTA (black fill, h-7)
- All in one 36px bar

### 5.3 Top-Level Tab Bar

**Before:** Tabs ~40px with `px-4 py-2` style padding.

**After:**
- Height: h-7 (28px)
- Disabled tabs: `text-black/25` — no strikethrough, no special treatment
- Active: bottom border 2px black, text-black, font-bold
- Remove padding between tab bar and content — `border-b` on the bar serves as separator

### 5.4 Inner Tab Bar (CV / DESIGN / LOCALE / SETTINGS / METADATA)

**Before:** Tabs ~36px, with "THEME DESIGN / Visual editing for quick changes." heading above them eating ~44px.

**After:**
- Remove the panel heading entirely — tab label is self-explanatory
- RAW YAML toggle moves to a `[YAML]` ghost button at the right end of this tab bar
- Tab bar height: 28px, same component as top-level tabs
- Total saved: ~44px

### 5.5 CV Tab → Sub-sections

#### 5.5.1 Personal Info

**Before:** Stacked full-width label-above-input rows at ~64px each.

**After:** Two-column grid for short fields, single column only for long/textarea fields.

```
┌─ PERSONAL INFORMATION ──────────────────────────────── ⋯ ─┐
│ Full Name  [__________________________]                    │
│ Headline   [__________________________]                    │
│ Location   [__________________________]                    │
│ Email      [________________]  Phone [________________]    │
│ Website    [__________________________]                    │
├─ CONNECTIONS ──────────────────────────────────────────────┤
│ [linkedin-icon] [___url_______________] [×]                │
│ [github-icon  ] [___url_______________] [×]                │
│ [+ ADD LINK]                                               │
└────────────────────────────────────────────────────────────┘
```

- Each row: `h-7` field + `font-mono text-[10px]` inline label to the left (fixed `w-20` label column)
- Email + Phone in a 2-column grid row
- CONNECTIONS: icon + input + delete in a single `h-7` row, no card wrapper
- ADD LINK: ghost text button `[+ ADD LINK]`, not full-width chunky button
- Estimated height reduction: from ~600px to ~220px

#### 5.5.2 Summary

**Before:** Section title + textarea with default sizing.

**After:**
```
┌─ SUMMARY ──────────────────────────────────────────────────┐
│ [textarea, min-h-[80px], auto-grow]                        │
└────────────────────────────────────────────────────────────┘
```

- No section label row — `SUMMARY` appears as `panel-section-header` above textarea
- Auto-growing textarea (no fixed tall height)

#### 5.5.3 Experience

**Before:** Large cards, ~100px+ per entry when collapsed, ~300px+ when expanded.

**After:**

```
┌─ EXPERIENCE ────────────────────────────────── [+ ADD] ────┐
│ ⠿  [Title] @ [Company]  [Location]  [Start–End]  [▾] [×]  │  ← collapsed row h-8
│ ┌─ expanded ──────────────────────────────────────────────┐ │
│ │ Title    [_____________]  Company  [_____________]      │ │
│ │ Location [_____________]  Start    [____] End [____]    │ │
│ │ URL      [_____________]                                │ │
│ │ HIGHLIGHTS                                              │ │
│ │ · [_________________________________] [×]               │ │
│ │ · [_________________________________] [×]               │ │
│ │ [+ ADD BULLET]                                          │ │
│ └─────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

- Collapsed entry: single `h-8` row showing title, company, date range
- Expanded: inline form, not a separate card — just indented block below the row
- Drag handle (`⠿`): 12px, visible only on hover
- [+ ADD] button: small ghost button top-right of section header, not full-width bottom button
- Bullet rows: `h-7` each
- [+ ADD BULLET]: ghost text link, not a button

#### 5.5.4 Education

Same pattern as Experience (collapsed row → expandable inline form).

Fields: Degree, Area, Institution, Location, Start, End, URL, Grade.

Two-column layout for Start/End and Location/Grade pairs.

#### 5.5.5 Projects

Collapsed row shows: Project Name + dates + [▾] [×]

Expanded shows: Name, URL, Start, End, Highlights (bullet rows).

#### 5.5.6 Skills

**Before:** Unclear — appears to be a textarea or flat input.

**After:**
```
┌─ SKILLS ────────────────────────────────────── [+ ADD] ────┐
│ [Category label]   [tag] [tag] [tag] [+ add tag]   [×]     │
│ [Category label]   [tag] [tag]       [+ add tag]   [×]     │
└────────────────────────────────────────────────────────────┘
```

- Each skill group: category name (inline editable) + tag chips
- Tag chips: `h-5` pill, delete on hover
- Inline `+ add tag` text trigger within the chip row

### 5.6 Design Tab

#### Structure change: Collapse 7 sub-tabs into 3

**Before:** CORE / PAGE & LAYOUT / HEADER & CONNECTIONS / TYPOGRAPHY / COLORS / SECTIONS & ENTRIES / TEMPLATES & ADVANCED (7 tabs, overflow)

**After:** GROUP into 3 tabs:

```
LAYOUT  |  STYLE  |  ADVANCED
```

- **LAYOUT** = Core (page size, footer, top note) + Page & Layout (margins, line spacing, alignment) + Header & Connections
- **STYLE** = Typography + Colors + Sections & Entries
- **ADVANCED** = Templates & Advanced (footer/top note templates, one-line entry templates)

This eliminates horizontal overflow entirely.

#### 5.6.1 LAYOUT sub-tab

```
┌─ PAGE ────────────────────────────────────────────────────┐
│ Size      [A4 ▾]    Footer [○]  Top Note [○]             │
│ Underline Links [○]  External Link Icon [○]               │
├─ MARGINS ─────────────────────────────────────────────────┤
│ Top [0.31] Bottom [0.31]  Left [0.39] Right [0.39]  [in▾]│
├─ LAYOUT ──────────────────────────────────────────────────┤
│ Line Spacing [0.6▾em]  Alignment [Justified▾]             │
│ Date/Loc Align [Right▾]  Date/Loc Width [8▾cm]           │
│ Side Space [0.2▾cm]                                       │
├─ HEADER ──────────────────────────────────────────────────┤
│ Align [Center▾]  Photo Width [3.5▾cm]  Position [Left▾]  │
│ Space Below Name [0.5▾cm]  Headline [0.5▾cm]  Conn [0.5]│
├─ CONNECTIONS ─────────────────────────────────────────────┤
│ Phone Format [National▾]                                  │
└───────────────────────────────────────────────────────────┘
```

**Key change for unit selectors:** Replace 6 inline unit buttons with a single compact dropdown `[in▾]` that appears after the number input. Unit group applies to all fields in that section (e.g., all margins share one unit). Per-field unit overrides stay available via the dropdown but don't litter every row.

#### 5.6.2 STYLE sub-tab

```
┌─ TYPOGRAPHY ──────────────────────────────────────────────┐
│ Body Font    [XCharter ▾]                                 │
│ Name Font    [XCharter ▾]                                 │
│ (font dropdowns — standard <select>, not expanded grids)  │
├─ FONT SIZES ──────────────────────────────────────────────┤
│ Body [10] Name [20] Headline [14] Conn [8] Sec Title [14]│
│                                                  (all pt) │
├─ COLORS ──────────────────────────────────────────────────┤
│ Body [●] Name [●] Headline [●] Connections [●]            │
│ Section Titles [●] Links [●] Header Line [●]              │
├─ SECTIONS & ENTRIES ──────────────────────────────────────┤
│ Section Title Style [Centered Split Line▾]                │
│ Line Thickness [0.5pt]  Space Above [0.5cm]  Below [0.2] │
│ Allow Page Break [○]  Entry Gap [1em]  Text Gap [0.3em]  │
│ Show Time Spans In [experience, education]                │
└───────────────────────────────────────────────────────────┘
```

**Key change for font picker:** Replace the expanded chip grid with a standard `<select>` dropdown. The grid was 15+ items taking 200px+ of vertical space. A `<select>` takes 28px.

**Key change for colors:** Replace large circle + full-width text input per color with a compact row: small swatch button (opens native color picker) + `text-xs` value label, 4 colors per row in a 2×N grid.

#### 5.6.3 ADVANCED sub-tab

All template string fields (Footer, Top Note, Single Date, Date Range, Time Span, One-Line Entry Main Column, One-Line Entry Second Column).

Each field: label + small textarea (`min-h-[40px]`). Placeholder hint text moved to `title` attribute tooltip, not rendered below field.

Reset button: `[RESET DEFAULTS]` — ghost danger style, at bottom of this tab only, not at top of every tab.

#### Theme selector

**Before:** "DESIGN / Theme: Harvard" heading + separate `<select>` + RESET THEME DEFAULTS button = ~80px.

**After:** Single compact bar:
```
THEME  [Harvard ▾]  [RESET]
```
Height: 28px. "RESET" is a ghost/danger `text-[11px]` text link, not a button.

### 5.7 Locale Tab

#### Structure change: Eliminate 3 sub-tabs → single scrollable panel

BASICS (6 fields) + PHRASES (1 field) + MONTHS (2 fields) = 9 fields total. No sub-tabs needed.

```
┌─ LOCALE ────────────────────────────────────── [RESET] ───┐
│ Language [English▾]                                        │
├─ LABELS ───────────────────────────────────────────────────┤
│ Last Updated [Last updated in]  Present [present]         │
│ Month [month]  Months [months]  Year [year]  Years [years]│
│ Degree with Area [DEGREE,  AREA]                          │
├─ DATE NAMES ──────────────────────────────────────────────┤
│ Abbreviations [Jan, Feb, Mar, Apr, May, June, July, …]    │
│ Full Names     [January, February, March, …]              │
└───────────────────────────────────────────────────────────┘
```

Total height: ~200px (was ~600px across 3 tabs). RESET becomes a ghost link.

### 5.8 Settings Tab

```
┌─ SETTINGS ──────────────────────────────────── [RESET] ───┐
│ Show Summary Heading  [○]                                  │
│ Current Date          [today          ]                    │
│ Bold Keywords         [SQLData, Python, Docker, …]        │
│ PDF Title             [NAME - CV      ]                    │
└───────────────────────────────────────────────────────────┘
```

- Inline label + control on same row (no multi-line descriptions below toggles — use `title` tooltip)
- Bold Keywords: single comma-separated input (eliminating the per-line textarea from Metadata)
- **Merge with Metadata**: Bold Keywords appears once (here). Remove from Metadata tab.

### 5.9 Metadata Tab

```
┌─ METADATA ────────────────────────────────────────────────┐
│ Role [SRE          ]  Company [Google           ]         │
│ Location [Mountain View, CA                    ]          │
└───────────────────────────────────────────────────────────┘
```

- 3 fields in a compact 2+1 row layout
- Remove BOLD KEYWORDS (moved to Settings, single source of truth)
- Remove the descriptive paragraph — replace with a single `[?]` icon tooltip

### 5.10 Raw YAML Mode

**Before:** Two-row toolbar (5 buttons), two-line status.

**After:** Single-row toolbar:
```
[RESYNC] [COPY SECTION] [COPY FULL YAML] [COPY FOR LLM] [APPLY CLIPBOARD]    LN 150 · 150 LINES
```
- All 5 buttons as `h-6` ghost buttons in one flex row
- Status text right-aligned in same row: `font-mono text-[10px] text-black/40`
- Total toolbar height: 28px (was ~60px)

### 5.11 CL & Outreach Tab

**Before:** Two side-by-side panels each with their own header, save/copy buttons, and large empty preview pane on the right half.

**After:**
```
┌─ COVER LETTER ────────────────────── [SAVE] [COPY] ───────┐
│ [textarea, min-h-[120px], auto-grow]                       │
│                            0 words / 0 chars               │
├─ OUTREACH MESSAGE ─────────────────── [SAVE] [COPY] ──────┤
│ [textarea, min-h-[80px], auto-grow]                        │
│                            0 words / 0 chars               │
└────────────────────────────────────────────────────────────┘
```

- Stacked vertically (not side-by-side) in the left editor panel
- SAVE and COPY are both secondary outline buttons, same style
- Word/char count: `font-mono text-[10px] text-black/40` right-aligned below textarea
- Empty state: single-line `font-mono text-[11px] text-black/30` placeholder in textarea, not verbose multi-line text
- Right preview pane: still shows rendered preview when available; otherwise completely empty (no ghost text)

### 5.12 JD Match Tab (disabled state)

**Before:** Greyed-out tab.

**After:** Tab active but shows inline notice:
```
┌────────────────────────────────────────────────────────────┐
│  JD MATCH is available after running a Tailor session.    │
│  [→ GO TO TAILOR]                                          │
└────────────────────────────────────────────────────────────┘
```

Not a disabled tab — disabled tabs are invisible affordances. Show the tab, show a call-to-action.

### 5.13 Additional Questions Tab (disabled state)

Same pattern as JD Match: show the tab, explain the prerequisite, show a path forward.

---

## 6. Summary of Vertical Space Saved

| Area | Before (approx) | After (approx) | Saved |
|------|----------------|----------------|-------|
| Header bar | 64px | 36px | 28px |
| Top tab bar | 40px | 28px | 12px |
| Panel section heading | 44px | 0px | 44px |
| Form row height (avg) | 64px | 28px | 36px/row |
| Design: 7 sub-tabs → 3 | overflow | fits | — |
| Unit selector rows | ~20px extra/row | 0 | 20px/row |
| Font picker grid | ~200px | 28px | 172px |
| Locale: 3 tabs → 1 panel | ~3× scroll | single view | — |
| CL panels (stacked vs side-by-side) | ~400px each | ~200px each | 200px |
| RAW YAML toolbar (2 rows → 1) | ~60px | 28px | 32px |

**Net result:** At 1440×900 viewport, the full Personal Info section should be visible without scroll. Experience entries (collapsed) should show 4–5 entries in the panel simultaneously. Design/Style panel should fit all frequently-used controls without sub-tab navigation.

---

## 7. Implementation Order

1. **Global shell** (header, tab bars, panel headers) — affects all views, biggest visual impact
2. **CV Personal Info** — most-used, establishes the field-row pattern
3. **CV Experience/Education/Projects** — collapse/expand row pattern
4. **Design tab restructure** (3 tabs, unit selector dropdown, font select, color grid)
5. **Locale + Settings + Metadata** (compact single-panel layouts)
6. **Raw YAML toolbar**
7. **CL & Outreach** (stacked layout, consistent buttons)
8. **JD Match / Additional Questions** (active disabled states)
