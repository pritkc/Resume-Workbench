'use client';

import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Image as ImageIcon,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import {
  RENDER_PHONE_NUMBER_FORMAT_OPTIONS,
  updateActiveRenderTheme,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvDimensionInput,
  RenderCvFieldGrid,
  RenderCvMarginGrid,
  RenderCvSection,
  RenderCvSelect,
  RenderCvToggleRow,
  RenderCvIconButtonStrip,
  type FieldGridItem,
  type IconButtonOption,
} from './rendercv-controls-shared';
import { createDesignUpdaters, dimensionToMm, setNestedValue } from './render-theme-controls-utils';

const SEPARATOR_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'None' },
  { id: '|', label: '|' },
  { id: '•', label: '•' },
  { id: '·', label: '·' },
  { id: '/', label: '/' },
  { id: '—', label: '—' },
  { id: ' – ', label: ' – ' },
  { id: ' - ', label: ' - ' },
];

const TEXT_ALIGN: IconButtonOption[] = [
  { id: 'left', label: 'Left', icon: <AlignLeft className="h-3 w-3" />, iconOnly: true },
  { id: 'center', label: 'Center', icon: <AlignCenter className="h-3 w-3" />, iconOnly: true },
  { id: 'right', label: 'Right', icon: <AlignRight className="h-3 w-3" />, iconOnly: true },
  {
    id: 'justified',
    label: 'Justified',
    icon: <AlignJustify className="h-3 w-3" />,
    iconOnly: true,
  },
  {
    id: 'justified-with-no-hyphenation',
    label: 'No hyphens',
    icon: <AlignJustify className="h-3 w-3 opacity-50" />,
    iconOnly: true,
  },
];

const H_ALIGN: IconButtonOption[] = [
  { id: 'left', label: 'Left', icon: <AlignLeft className="h-3 w-3" />, iconOnly: true },
  { id: 'center', label: 'Center', icon: <AlignCenter className="h-3 w-3" />, iconOnly: true },
  { id: 'right', label: 'Right', icon: <AlignRight className="h-3 w-3" />, iconOnly: true },
];

const PHOTO_POS: IconButtonOption[] = [
  { id: 'left', label: 'Photo left', icon: <PanelLeft className="h-3 w-3" />, iconOnly: true },
  { id: 'right', label: 'Photo right', icon: <PanelRight className="h-3 w-3" />, iconOnly: true },
];

const PAGE_SIZE_OPTIONS: IconButtonOption[] = [
  { id: 'a4', label: 'A4' },
  { id: 'us-letter', label: 'Letter' },
];

interface Props {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

export function RenderThemeLayoutPanel({ settings, onChange }: Props) {
  const { updateDesign } = createDesignUpdaters({ settings, onChange });

  const separator = settings.design.header?.connections?.separator ?? '';
  const knownSeps = new Set(SEPARATOR_OPTIONS.map((o) => o.id));
  const separatorOptions =
    separator && !knownSeps.has(separator)
      ? [...SEPARATOR_OPTIONS, { id: separator, label: `(${separator})` }]
      : SEPARATOR_OPTIONS;

  const d = settings.design;

  // ── Page toggles ─────────────────────────────────────────────────────────
  const pageToggles = [
    {
      label: 'Continuous',
      checked: settings.page_size === 'FREEFLOW',
      onChange: (enabled: boolean) =>
        onChange(
          updateActiveRenderTheme(settings, ({ design, profile }) => {
            if (enabled) {
              profile.page_size = 'FREEFLOW';
              const sz = design.page?.size;
              if (sz !== 'a4' && sz !== 'us-letter') {
                setNestedValue(design as Record<string, unknown>, ['page', 'size'], 'a4');
              }
            } else {
              profile.page_size = design.page?.size === 'us-letter' ? 'LETTER' : 'A4';
            }
          })
        ),
    },
    {
      label: 'Footer',
      checked: d.page?.show_footer,
      onChange: (v: boolean) => updateDesign(['page', 'show_footer'], v),
    },
    {
      label: 'Top note',
      checked: d.page?.show_top_note,
      onChange: (v: boolean) => updateDesign(['page', 'show_top_note'], v),
    },
    {
      label: 'Underline links',
      checked: d.links?.underline,
      onChange: (v: boolean) => updateDesign(['links', 'underline'], v),
    },
    {
      label: 'Ext. icon',
      checked: d.links?.show_external_link_icon,
      onChange: (v: boolean) => updateDesign(['links', 'show_external_link_icon'], v),
    },
  ];

  // ── Columns field grid ───────────────────────────────────────────────────
  //  Row 1: text-align (auto width) | date-align (auto) | line-spacing | date-width | side-space | col-gap
  const columnFields: FieldGridItem[] = [
    {
      label: 'Text align',
      node: (
        <RenderCvIconButtonStrip
          value={d.typography?.alignment}
          options={TEXT_ALIGN}
          onChange={(v) => updateDesign(['typography', 'alignment'], v)}
        />
      ),
    },
    {
      label: 'Date align',
      node: (
        <RenderCvIconButtonStrip
          value={d.typography?.date_and_location_column_alignment}
          options={H_ALIGN}
          onChange={(v) => updateDesign(['typography', 'date_and_location_column_alignment'], v)}
        />
      ),
    },
    {
      label: 'Line spacing',
      node: (
        <RenderCvDimensionInput
          value={d.typography?.line_spacing}
          onChange={(v) => updateDesign(['typography', 'line_spacing'], v)}
        />
      ),
    },
    {
      label: 'Date width',
      node: (
        <RenderCvDimensionInput
          value={d.entries?.date_and_location_width}
          onChange={(v) => updateDesign(['entries', 'date_and_location_width'], v)}
        />
      ),
    },
    {
      label: 'Side space',
      node: (
        <RenderCvDimensionInput
          value={d.entries?.side_space}
          onChange={(v) => updateDesign(['entries', 'side_space'], v)}
        />
      ),
    },
    {
      label: 'Col gap',
      node: (
        <RenderCvDimensionInput
          value={d.entries?.space_between_columns}
          onChange={(v) => updateDesign(['entries', 'space_between_columns'], v)}
        />
      ),
    },
  ];

  // ── Header field grid ────────────────────────────────────────────────────
  const headerFields: FieldGridItem[] = [
    {
      label: 'Alignment',
      node: (
        <RenderCvIconButtonStrip
          value={d.header?.alignment}
          options={H_ALIGN}
          onChange={(v) => updateDesign(['header', 'alignment'], v)}
        />
      ),
    },
    {
      label: 'Below name',
      node: (
        <RenderCvDimensionInput
          value={d.header?.space_below_name}
          onChange={(v) => updateDesign(['header', 'space_below_name'], v)}
        />
      ),
    },
    {
      label: 'Below headline',
      node: (
        <RenderCvDimensionInput
          value={d.header?.space_below_headline}
          onChange={(v) => updateDesign(['header', 'space_below_headline'], v)}
        />
      ),
    },
    {
      label: 'Below connections',
      node: (
        <RenderCvDimensionInput
          value={d.header?.space_below_connections}
          onChange={(v) => updateDesign(['header', 'space_below_connections'], v)}
        />
      ),
    },
  ];

  // ── Photo field grid ────────────────────────────────────────────────────
  const photoFields: FieldGridItem[] = [
    {
      label: 'Position',
      node: (
        <RenderCvIconButtonStrip
          value={d.header?.photo_position}
          options={PHOTO_POS}
          onChange={(v) => updateDesign(['header', 'photo_position'], v)}
        />
      ),
    },
    {
      label: 'Width',
      node: (
        <RenderCvDimensionInput
          value={d.header?.photo_width}
          onChange={(v) => updateDesign(['header', 'photo_width'], v)}
        />
      ),
    },
    {
      label: 'Space left',
      node: (
        <RenderCvDimensionInput
          value={d.header?.photo_space_left}
          onChange={(v) => updateDesign(['header', 'photo_space_left'], v)}
        />
      ),
    },
    {
      label: 'Space right',
      node: (
        <RenderCvDimensionInput
          value={d.header?.photo_space_right}
          onChange={(v) => updateDesign(['header', 'photo_space_right'], v)}
        />
      ),
    },
  ];

  // ── Connections ──────────────────────────────────────────────────────────
  const connToggles = [
    {
      label: 'Show icons',
      checked: d.header?.connections?.show_icons,
      onChange: (v: boolean) =>
        updateDesign(['header', 'connections', 'show_icons'], v, (profile) => {
          profile.show_contact_icons = v;
        }),
    },
    {
      label: 'Hyperlink',
      checked: d.header?.connections?.hyperlink,
      onChange: (v: boolean) => updateDesign(['header', 'connections', 'hyperlink'], v),
    },
    {
      label: 'Display URLs',
      checked: d.header?.connections?.display_urls_instead_of_usernames,
      onChange: (v: boolean) =>
        updateDesign(['header', 'connections', 'display_urls_instead_of_usernames'], v),
    },
  ];

  const connFields: FieldGridItem[] = [
    {
      label: 'Phone format',
      node: (
        <RenderCvSelect
          value={d.header?.connections?.phone_number_format}
          options={RENDER_PHONE_NUMBER_FORMAT_OPTIONS}
          onChange={(v) => updateDesign(['header', 'connections', 'phone_number_format'], v)}
        />
      ),
    },
    {
      label: 'Separator',
      node: (
        <RenderCvSelect
          value={separator}
          options={separatorOptions}
          onChange={(v) => updateDesign(['header', 'connections', 'separator'], v)}
        />
      ),
    },
    {
      label: 'Gap',
      node: (
        <RenderCvDimensionInput
          value={d.header?.connections?.space_between_connections}
          onChange={(v) => updateDesign(['header', 'connections', 'space_between_connections'], v)}
        />
      ),
    },
  ];

  return (
    <div className="pb-4">
      {/* PAGE — size strip + toggles in one compact block */}
      <RenderCvSection title="Page">
        {/* Page size and toggles in a single flex row */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-b border-border px-2 py-1">
          <div className="flex flex-col gap-0.5">
            <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
              Size
            </span>
            <RenderCvIconButtonStrip
              value={d.page?.size}
              options={PAGE_SIZE_OPTIONS}
              onChange={(v) =>
                updateDesign(['page', 'size'], v, (profile) => {
                  profile.page_size =
                    settings.page_size === 'FREEFLOW'
                      ? 'FREEFLOW'
                      : v === 'us-letter'
                        ? 'LETTER'
                        : 'A4';
                })
              }
            />
          </div>
          <div className="h-5 w-px bg-border" />
          {pageToggles.map((item) => (
            <label key={item.label} className="inline-flex cursor-pointer items-center gap-1.5">
              <span className="font-sans text-[10px] text-muted-foreground">{item.label}</span>
              <span
                className={`relative inline-flex shrink-0 items-center rounded-full border transition-colors duration-150 h-3.5 w-6 ${item.checked ? 'border-primary bg-primary' : 'border-border bg-muted'}`}
                onClick={() => item.onChange(!item.checked)}
                role="switch"
                aria-checked={Boolean(item.checked)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') item.onChange(!item.checked);
                }}
              >
                <span
                  className={`inline-block rounded-full bg-white shadow transition-transform duration-150 h-2.5 w-2.5 ${item.checked ? 'translate-x-2.5' : 'translate-x-0.5'}`}
                />
              </span>
            </label>
          ))}
        </div>
      </RenderCvSection>

      {/* MARGINS */}
      <RenderCvSection title="Margins">
        <RenderCvMarginGrid
          margins={{
            top: d.page?.top_margin,
            bottom: d.page?.bottom_margin,
            left: d.page?.left_margin,
            right: d.page?.right_margin,
          }}
          onChange={(side, value) =>
            updateDesign(['page', `${side}_margin`], value, (profile) => {
              profile.margins_mm = {
                ...(profile.margins_mm ?? {}),
                [side]: dimensionToMm(value, settings.margins_mm[side]),
              };
            })
          }
        />
      </RenderCvSection>

      {/* COLUMNS — 3-col grid; icon strips auto-size, dim inputs fill */}
      <RenderCvSection title="Columns">
        <RenderCvFieldGrid fields={columnFields} cols={3} />
      </RenderCvSection>

      {/* HEADER */}
      <RenderCvSection title="Header">
        {/* 4 fields: alignment (auto) | below-name | below-headline | below-connections */}
        <RenderCvFieldGrid fields={headerFields} cols={4} />
        {/* Photo sub-group */}
        <div className="border-t border-border">
          <div className="flex h-5 items-center gap-1 bg-muted/30 px-2">
            <ImageIcon className="h-2.5 w-2.5 text-muted-foreground/70" aria-hidden />
            <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
              Photo
            </span>
          </div>
          {/* 4 fields: position (auto) | width | space-left | space-right */}
          <RenderCvFieldGrid fields={photoFields} cols={4} />
        </div>
      </RenderCvSection>

      {/* CONNECTIONS */}
      <RenderCvSection title="Connections">
        <RenderCvToggleRow items={connToggles} />
        {/* 3 fields: phone format (auto) | separator (auto) | gap */}
        <RenderCvFieldGrid fields={connFields} cols={3} />
      </RenderCvSection>
    </div>
  );
}
