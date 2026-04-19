# Phase 3.11.2 - Dashboard UI/UX Refactor Design System (Codex)

Source screenshots: `screenshots/builder-92XRAZ`  
Goal: dense, keyboard-first, minimal-click daily editing UI (Linear + Notion + Raycast style) with Swiss International visual discipline.

## 0) Screenshot Audit Notes

- Reviewed all 30 screenshot files.
- Capture caveat: all files in `01-resume-visual/cv/` are byte-identical, so section-level recommendations for CV are mapped by filename intent.
- Capture caveat: all files in `03-cl-and-outreach/` are byte-identical, so Cover Letter and Outreach recommendations are mapped by filename intent.
- Capture caveat: `04-jd-match/01-jd-match-tab-disabled.png` and `05-additional-questions/01-additional-questions-tab-disabled.png` appear as metadata layouts; recommendations still define intended disabled/empty states for those tabs.

## 1) Current Pain Points

### 1.1 Puffiness Examples (High Vertical Burn)

| Location | Puffiness Issue | Impact |
|---|---|---|
| `00-top-tabs-overview-resume.png` | Header + status + tabs consume too much vertical space before any editable content. | Immediate scroll and low information density. |
| `01-resume-visual/cv/01-personal-info.png` | Large row height, label blocks, thick section wrappers, full-width action buttons. | Only a small fraction of CV fields visible at once. |
| `01-resume-visual/design/02-page-layout.png` | Every numeric row repeats unit buttons (`CM/MM/IN/PT/EM/EX`). | Horizontal crowding and visual repetition. |
| `01-resume-visual/design/04-typography.png` | Font chip grid expands inline and pushes content down. | Excess scrolling for a rare action. |
| `01-resume-visual/locale/01-basics.png` | Small number of fields in a large padded container with dead space. | Poor scan efficiency. |
| `01-resume-visual/metadata/01-metadata-panel.png` | Short metadata fields stacked as full-height blocks plus long explanatory copy. | Wasted space for low-complexity content. |
| `02-resume-raw-yaml/*/01-full.png` | Toolbar wraps to two lines + separate status line. | Coding surface starts too low; unnecessary clicks. |
| `03-cl-and-outreach/01-workspace-full.png` | Two small edit cards + huge empty right side with verbose placeholders. | Low utility per viewport. |

### 1.2 Click Fatigue + Redundant Controls

- Three navigation layers in Resume view (top tabs, section tabs, sub-tabs) increase path length.
- Reset actions are overly prominent and duplicated per tab instead of being grouped.
- Save semantics are fragmented (global save + local save variants with inconsistent styles).
- Bold keywords appear in both Settings and Metadata in different formats (comma list vs multiline).
- Design controls are split by many tabs where many are low-frequency and should be collapsed under one `Advanced` path.

### 1.3 Scroll and Focus Problems

- Personal info + links + summary starts a long scroll chain before reaching Experience.
- Design view creates long scroll caused by repeated unit controls and expanded picker patterns.
- Locale split across `Basics`, `Phrases`, `Months` creates tab hopping for very small data.
- Raw YAML editors lose visible code rows due to tall toolbars/chrome.
- Right preview pane dominates width even when empty; editor loses usable typing width.

## 2) New Design Principles

### 2.1 Density and Spacing Scale

Use an 8px-root compact scale with 2px/4px half-steps for editor chrome:

| Token | Value | Allowed Usage |
|---|---|---|
| `--ds-space-0_5` | 2px | icon alignment, micro-gaps |
| `--ds-space-1` | 4px | inline label gaps, chip spacing |
| `--ds-space-1_5` | 6px | dense grouped controls |
| `--ds-space-2` | 8px | default control padding |
| `--ds-space-3` | 12px | row-to-row spacing |
| `--ds-space-4` | 16px | section spacing |
| `--ds-space-5` | 20px | major section split only |

Density rules:

- Default control height: `28px`.
- Default tab height: `28px`.
- Default editor row min height: `30px`.
- No `p-5`, `p-6`, `py-4+`, `rounded-lg+`, or elevated shadows in data-entry surfaces.

### 2.2 Typography Scale (Swiss, Functional)

| Role | Token | Size / Weight |
|---|---|---|
| App title | `--ds-text-title` | 16px / 600 |
| Tab label | `--ds-text-tab` | 11px / 600 uppercase |
| Field label | `--ds-text-label` | 11px / 500 uppercase |
| Body/input | `--ds-text-body` | 13px / 450 |
| Helper/status | `--ds-text-help` | 11px / 400 |
| Code/editor meta | `--ds-text-mono` | 11px mono |

Typography rules:

- Prefer neutral sans for UI (`ui-sans-serif`) and mono for metadata/chrome labels only.
- Keep long helper copy hidden by default; expose via tooltip/help icon.
- Use line height for compact scanning (`1.25` to `1.35`).

### 2.3 Color and Contrast Rules

| Token | Value | Usage |
|---|---|---|
| `--ds-bg-canvas` | `#F3F3EE` | app background |
| `--ds-bg-surface` | `#FFFFFF` | inputs/cards/panels |
| `--ds-fg-primary` | `#111111` | main text |
| `--ds-fg-muted` | `#5E5E5E` | helper text |
| `--ds-border` | `#CFCFC7` | default borders |
| `--ds-border-strong` | `#1F1F1F` | active/focus borders |
| `--ds-accent` | `#1D4ED8` | single primary action and focus cues |
| `--ds-success` | `#0F766E` | saved/synced states only |
| `--ds-danger` | `#B91C1C` | destructive actions |

Color rules:

- One primary accent action per surface.
- No decorative gradients, glows, or multi-color status badges.
- Disabled state must remain legible (`>= 4.5:1` where text remains actionable/important).

### 2.4 Interaction and IA Rules

- Inline edit by default; modal only for destructive confirmations and complex preview diff.
- One obvious path for frequent actions (`Cmd/Ctrl+S`, section add, quick search).
- Collapse low-frequency controls into a single `Advanced` disclosure per major area.
- Merge duplicate controls into one source of truth.
- Reduce nav depth to max two levels in editor context.

## 3) Tailwind 4 Tokens and Overrides to Enforce

```css
/* app.css (Tailwind v4) */
@theme {
  --ds-space-0_5: 2px;
  --ds-space-1: 4px;
  --ds-space-1_5: 6px;
  --ds-space-2: 8px;
  --ds-space-3: 12px;
  --ds-space-4: 16px;
  --ds-space-5: 20px;

  --ds-radius-0: 0px;

  --ds-text-title: 16px;
  --ds-text-tab: 11px;
  --ds-text-label: 11px;
  --ds-text-body: 13px;
  --ds-text-help: 11px;

  --ds-bg-canvas: #F3F3EE;
  --ds-bg-surface: #FFFFFF;
  --ds-fg-primary: #111111;
  --ds-fg-muted: #5E5E5E;
  --ds-border: #CFCFC7;
  --ds-border-strong: #1F1F1F;
  --ds-accent: #1D4ED8;
  --ds-success: #0F766E;
  --ds-danger: #B91C1C;
}

/* Hard constraints */
.ui-shell { @apply bg-[var(--ds-bg-canvas)] text-[var(--ds-fg-primary)]; }
.ui-card { @apply bg-[var(--ds-bg-surface)] border border-[var(--ds-border)] rounded-none shadow-none; }
.ui-row { @apply min-h-[30px] py-[var(--ds-space-1)] px-[var(--ds-space-2)] gap-[var(--ds-space-2)]; }
.ui-input { @apply h-7 px-2 text-[13px] border border-[var(--ds-border)] rounded-none bg-white; }
.ui-input:focus { @apply outline-none border-[var(--ds-border-strong)] ring-0; }
.ui-tab { @apply h-7 px-2 text-[11px] uppercase tracking-[0.08em] border-b-2 border-transparent; }
.ui-tab[data-active="true"] { @apply border-[var(--ds-border-strong)] font-semibold; }
.ui-btn { @apply h-7 px-2 text-[11px] uppercase tracking-[0.06em] rounded-none border shadow-none; }
.ui-btn-primary { @apply bg-[var(--ds-accent)] text-white border-[var(--ds-accent)]; }
.ui-btn-secondary { @apply bg-white text-[var(--ds-fg-primary)] border-[var(--ds-border-strong)]; }
.ui-btn-ghost { @apply bg-transparent text-[var(--ds-fg-primary)] border-[var(--ds-border)]; }
.ui-kbd { @apply text-[11px] font-mono px-1 py-0 border border-[var(--ds-border)] rounded-none; }
```

Enforcement notes:

- `rounded-none` required for all editor primitives.
- `shadow-*` forbidden on cards/inputs/buttons in editor panes.
- `h-8+` disallowed for standard controls except top app header.
- Repeated unit chips replaced with section-level unit selector.

## 4) Component Library Rules (Dense Variant)

### 4.1 Button

- Sizes: `h-7` default, `h-6` utility, `h-8` top-header only.
- Variants: `primary`, `secondary`, `ghost`, `danger-ghost`.
- Icon size: `14px`.
- Text: uppercase mono/sans at `11px`.
- Rule: only one `primary` button visible per panel group.

### 4.2 Input + Textarea

- Input: `h-7`, no rounded corners, no inner shadow.
- Textarea: `min-h-[72px]`, compact padding, auto-grow.
- Inline validation: right-aligned status dot/text; no large validation blocks.

### 4.3 Card / Section Container

- Border only (`1px`), no drop shadow.
- Padding max `12px`.
- Section header height target `24px`.
- Use separators, not boxed nesting, for inner grouping.

### 4.4 Selector / Tabs / Segmented Controls

- Tabs: `28px` height, border-bottom active indicator only.
- Segmented toggles: `24px` height in dense rows.
- Unit selector: one per section (or shared row), never six repeated mini-buttons per field row.

### 4.5 Modal

- Width: `360px` default for confirm dialogs.
- Use only for: destructive reset, irreversible apply, conflict resolution.
- No wizard-style modals for routine edits.

### 4.6 Sidebar / Editor Pane

- Left pane defaults to `46%` width, resizable `40-58%`.
- Pane header max `32px`.
- Keep toolbar single-row.
- Sticky local actions row under pane header.

### 4.7 Preview Pane

- Right pane defaults to `54%`.
- Empty state collapses helper copy to one line.
- When no render artifact exists, optionally auto-shrink to `40%` and prioritize editor width.

### 4.8 Inline Entry Row (Experience/Education/Projects)

- Collapsed row shows key fields + quick actions in one line.
- Expand inline below row, not full detached card.
- Drag handle hidden until hover/focus.
- `Add bullet` as inline text action, not full-width button.

## 5) High-Level Refactored Layout (Main Resume Editor)

```text
+---------------------------------------------------------------------------------------+
| Header 36px: [Back] Title / status                               [Search] [Save] [DL]|
+---------------------------------------------------------------------------------------+
| Top Tabs 28px: Resume | CL & Outreach | JD Match | Additional Questions               |
+-----------------------------------------------+---------------------------------------+
| Left Editor (46%, resizable)                  | Right Preview (54%, resizable)        |
| - Resume sub-tabs 28px                        | - Preview header 28px                  |
| - Section jump rail (compact)                 | - Refresh + render status              |
| - Inline dense form rows                      | - Render canvas / minimal empty state  |
| - Sticky add actions and shortcuts            |                                       |
+-----------------------------------------------+---------------------------------------+
```

Layout rules:

- Merge status into header line; remove separate mode/status bar.
- Keep max two nav levels visible at a time.
- Promote section jump + keyboard nav over scroll-heavy card stacks.
- Collapse rare controls into one `Advanced` disclosure per major section.

## 6) Refactor Plan by Screenshot Category and Subsection

### 6.1 `00-top-tabs-overview-resume.png`

- Compress top chrome from three visually heavy rows to two compact rows.
- Normalize icon sizes to `14px`.
- Keep only one primary action (`Download`), make `Save` secondary.
- Add command palette trigger (`Cmd/Ctrl+K`) in header instead of extra utility buttons.

### 6.2 `01-resume-visual/cv/`

#### `01-personal-info.png`

- Convert stacked fields to two-column dense grid where appropriate.
- Merge `Profile Links` cards into inline rows: label/icon + URL + delete.
- Replace full-width `Add Link` button with inline ghost action.

#### `02-summary.png`

- Keep summary as compact auto-grow textarea with single-row label.
- Add quick markdown hint via tooltip, not persistent paragraph text.

#### `03-experience.png`

- Replace large entry cards with collapsible one-line summary rows.
- Inline edit fields appear directly under expanded row.
- Move infrequent controls to row overflow menu (`...`).

#### `04-education.png`

- Apply same row/expand pattern as Experience for consistency.
- Pair short fields in two-column rows (start/end, location/grade).

#### `05-projects.png`

- Use compact row summary: name, URL indicator, date span.
- Keep highlights editing inline with one-click bullet add.

#### `06-skills.png`

- Replace plain text block editing with chip-based inline skill tags per category.
- Keep category name inline-editable with keyboard enter-to-create.

#### `07-cv-full-expanded.png`

- Introduce section jump rail inside left pane for rapid movement (`1-7` shortcuts).
- Persist only one expanded section by default to reduce scroll.
- Sticky quick-add row: `+ Experience`, `+ Education`, `+ Project`, `+ Skill`.

### 6.3 `01-resume-visual/design/`

#### `01-core.png`

- Keep high-frequency toggles in compact matrix (`2-column toggle rows`).
- Move reset to `Advanced` footer area.

#### `02-page-layout.png`

- Replace per-field unit chip clusters with shared unit dropdown per section.
- Keep numeric fields fixed width and keyboard steppers.

#### `03-header-connections.png`

- Align related spacing controls in one row (name/headline/connections spacing).
- Group header and connection rules under one compact subsection.

#### `04-typography.png`

- Replace expanded font chip gallery with searchable combobox dropdown.
- Keep preview sample inline to avoid opening extra panels.

#### `05-colors.png`

- Replace large one-color-per-row blocks with dense swatch grid + value popover.
- Keep hex/rgb edit in popover to reduce constant visual noise.

#### `06-sections-entries.png`

- Keep only high-frequency section spacing and gap controls visible.
- Move low-frequency toggles (page-break edge cases, uncommon spans) to `Advanced`.

#### `07-templates-advanced.png`

- Host all template string fields inside one collapsible `Advanced` group.
- Use monospaced compact textareas and keyboard shortcut for placeholder insertion.

### 6.4 `01-resume-visual/locale/`

#### `01-basics.png`

- Merge basics into one dense form with two-column rows.

#### `02-phrases.png`

- Remove standalone tab; fold into locale form under `Phrases`.

#### `03-months.png`

- Keep month names and abbreviations side-by-side in dense paired inputs.

### 6.5 `01-resume-visual/settings/01-general.png`

- Remove long inline helper paragraphs; replace with tooltip info icons.
- Keep settings in single compact card.
- Keep `Bold Keywords` here as the single source of truth.

### 6.6 `01-resume-visual/metadata/01-metadata-panel.png`

- Keep only `Role`, `Company`, `Location` in metadata.
- Remove duplicate bold keywords field (now owned by Settings).
- Collapse explanatory paragraph into one line with help icon.

### 6.7 `02-resume-raw-yaml/`

#### `cv/01-full.png`

- One-line toolbar: `Resync`, `Copy`, `Apply`, status.
- Add shortcut strip (`Cmd+S`, `Cmd+Enter`, `Alt+R`) with compact kbd badges.

#### `design/01-full.png`

- Keep consistent toolbar; persist line/column in right-aligned mono text.
- Add quick-jump anchors to YAML sections.

#### `locale/01-full.png`

- Keep same density pattern; remove repeated explanatory text.

#### `settings/01-full.png`

- Maximize editor viewport by reducing top metadata area to single line.

#### `metadata/01-full.png`

- Keep parser/apply diagnostics inline in status row; no extra blocks unless error.

### 6.8 `03-cl-and-outreach/`

#### `01-workspace-full.png`

- Replace dual half-height cards with tabbed editor (`Cover Letter | Outreach`) in one dense pane.
- Keep preview pane synced to selected tab.

#### `02-cover-letter-editor.png`

- Unify action order: `Save`, `Copy`, `Regenerate` (if enabled) with consistent hierarchy.
- One-line empty-state hint plus direct CTA.

#### `03-outreach-editor.png`

- Same component contract as cover letter for consistency and muscle memory.
- Keep character/word counters compact and right-aligned.

### 6.9 `04-jd-match/01-jd-match-tab-disabled.png`

- Do not hard-disable tab in nav.
- Open tab with compact prerequisite card and one explicit CTA (`Run Tailor`).

### 6.10 `05-additional-questions/01-additional-questions-tab-disabled.png`

- Same pattern as JD Match: accessible tab with prerequisite state.
- Add compact checklist of required prior steps instead of a dead disabled tab.

## 7) Redundancy and Merge Rules (Mandatory)

- One save model per surface: global autosave + explicit manual save shortcut, not multiple competing save buttons.
- One location for `Bold Keywords` (Settings only).
- One reset entry point per major area, always inside `Advanced` or overflow menu.
- One unit selector strategy (shared selector), never repeated inline per field.
- One tab component style across app layers.

## 8) Keyboard-First Flows

- `Cmd/Ctrl+K`: command palette (jump section, add entry, open tab).
- `Cmd/Ctrl+S`: save current context.
- `g` then `c/d/l/s/m`: quick jump to CV/Design/Locale/Settings/Metadata.
- `j/k`: move between visible rows/entries.
- `Enter`: edit focused row.
- `Shift+Enter`: add new bullet/line item.
- `Esc`: collapse current entry / close inline popovers.

## 9) Definition of Done for This Refactor

- 30-40% more editable fields visible in first viewport on Resume/CV.
- Frequent edits (headline, dates, bullets, links) possible with <= 2 clicks or keyboard-only.
- No repeated top-level destructive/reset controls.
- All editor components conform to dense token set (height, spacing, radius, shadow rules).
- Rare options are discoverable under `Advanced` without cluttering primary editing flows.
