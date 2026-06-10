'use client';

import {
  RENDER_BULLET_OPTIONS,
  RENDER_FONT_FAMILY_OPTIONS,
  RENDER_SECTION_TITLE_TYPE_OPTIONS,
  type RenderTechStackSeparator,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvBulletPicker,
  RenderCvColorGrid,
  RenderCvDimensionInput,
  RenderCvFieldGrid,
  RenderCvInput,
  RenderCvRow,
  RenderCvSection,
  RenderCvSelect,
  RenderCvToggleRow,
  RenderCvTypographyMatrix,
  arrayToText,
  textToArray,
  type FieldGridItem,
} from './rendercv-controls-shared';
import { createDesignUpdaters } from './render-theme-controls-utils';

const TECH_STACK_SEP_OPTIONS: Array<{ id: RenderTechStackSeparator; label: string }> = [
  { id: '•', label: '•' },
  { id: ',', label: ',' },
  { id: '·', label: '·' },
  { id: '|', label: '|' },
  { id: '/', label: '/' },
];

type TypographyRoleKey = 'body' | 'name' | 'headline' | 'connections' | 'section_titles';
type TypographyRole = {
  key: TypographyRoleKey;
  label: string;
  showBold?: boolean;
  showSmallCaps?: boolean;
};

const TYPOGRAPHY_ROLES: readonly TypographyRole[] = [
  { key: 'body', label: 'Body', showBold: false, showSmallCaps: false },
  { key: 'name', label: 'Name' },
  { key: 'headline', label: 'Headline' },
  { key: 'connections', label: 'Connections' },
  { key: 'section_titles', label: 'Section Titles' },
];

interface Props {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

export function RenderThemeStylePanel({ settings, onChange }: Props) {
  const { updateDesign, updateWorkbenchStyle } = createDesignUpdaters({ settings, onChange });
  const ws = settings.settings.resume_workbench_style;
  const typo = settings.design.typography;

  const matrixRoles = TYPOGRAPHY_ROLES.map((role) => ({
    key: role.key,
    label: role.label,
    font: typo?.font_family?.[role.key as keyof NonNullable<typeof typo>['font_family']],
    fontSize: typo?.font_size?.[role.key as keyof NonNullable<typeof typo>['font_size']],
    bold: typo?.bold?.[role.key as keyof NonNullable<typeof typo>['bold']],
    smallCaps: typo?.small_caps?.[role.key as keyof NonNullable<typeof typo>['small_caps']],
    showBold: role.showBold !== false,
    showSmallCaps: role.showSmallCaps !== false,
  }));

  // ── Letter spacing fields ─────────────────────────────────────────────────
  const spacingFields: FieldGridItem[] = [
    ['name', 'Name'],
    ['headline', 'Headline'],
    ['connections', 'Connections'],
    ['section_titles', 'Section Titles'],
  ].map(([key, label]) => ({
    label,
    node: (
      <RenderCvDimensionInput
        value={
          ws?.typography?.letter_spacing?.[
            key as keyof NonNullable<NonNullable<typeof ws>['typography']>['letter_spacing']
          ]
        }
        onChange={(v) => updateWorkbenchStyle(['typography', 'letter_spacing', key], v)}
        placeholder="0pt"
      />
    ),
  }));

  // ── Color groups ──────────────────────────────────────────────────────────
  const textColorItems = [
    { key: 'body', label: 'Body' },
    { key: 'name', label: 'Name' },
    { key: 'headline', label: 'Headline' },
    { key: 'connections', label: 'Connections' },
    { key: 'section_titles', label: 'Sec. Titles' },
    { key: 'links', label: 'Links' },
  ] as const;

  const structColorItems = [
    { key: 'footer', label: 'Footer' },
    { key: 'top_note', label: 'Top Note' },
  ] as const;

  const accentColorItems = [
    {
      key: 'company',
      label: 'Company',
      value: ws?.colors?.company,
      onChange: (v: string) => updateWorkbenchStyle(['colors', 'company'], v),
    },
    {
      key: 'role',
      label: 'Role Title',
      value: ws?.colors?.role,
      onChange: (v: string) => updateWorkbenchStyle(['colors', 'role'], v),
    },
    {
      key: 'stack',
      label: 'Stack',
      value: ws?.colors?.stack,
      onChange: (v: string) => updateWorkbenchStyle(['colors', 'stack'], v),
    },
    {
      key: 'date_location',
      label: 'Date/Loc',
      value: ws?.colors?.date_location,
      onChange: (v: string) => updateWorkbenchStyle(['colors', 'date_location'], v),
    },
  ];

  // ── Section fields ────────────────────────────────────────────────────────
  const sectionFields: FieldGridItem[] = [
    {
      label: 'Title style',
      span: 2,
      node: (
        <RenderCvSelect
          value={settings.design.section_titles?.type}
          options={RENDER_SECTION_TITLE_TYPE_OPTIONS}
          onChange={(v) => updateDesign(['section_titles', 'type'], v)}
        />
      ),
    },
    {
      label: 'Line thickness',
      node: (
        <RenderCvDimensionInput
          value={settings.design.section_titles?.line_thickness}
          onChange={(v) => updateDesign(['section_titles', 'line_thickness'], v)}
        />
      ),
    },
    {
      label: 'Space above',
      node: (
        <RenderCvDimensionInput
          value={settings.design.section_titles?.space_above}
          onChange={(v) => updateDesign(['section_titles', 'space_above'], v)}
        />
      ),
    },
    {
      label: 'Space below',
      node: (
        <RenderCvDimensionInput
          value={settings.design.section_titles?.space_below}
          onChange={(v) => updateDesign(['section_titles', 'space_below'], v)}
        />
      ),
    },
    {
      label: 'Entry gap',
      node: (
        <RenderCvDimensionInput
          value={settings.design.sections?.space_between_regular_entries}
          onChange={(v) => updateDesign(['sections', 'space_between_regular_entries'], v)}
        />
      ),
    },
    {
      label: 'Text gap',
      node: (
        <RenderCvDimensionInput
          value={settings.design.sections?.space_between_text_based_entries}
          onChange={(v) => updateDesign(['sections', 'space_between_text_based_entries'], v)}
        />
      ),
    },
    {
      label: 'Time spans in',
      span: 3,
      node: (
        <RenderCvInput
          value={arrayToText(settings.design.sections?.show_time_spans_in)}
          onChange={(v) => updateDesign(['sections', 'show_time_spans_in'], textToArray(v))}
          placeholder="experience, education"
        />
      ),
    },
  ];

  const sectionToggles = [
    {
      label: 'Page break',
      checked: settings.design.sections?.allow_page_break,
      onChange: (v: boolean) => updateDesign(['sections', 'allow_page_break'], v),
    },
  ];

  // ── Entry fields ──────────────────────────────────────────────────────────
  const entryFields: FieldGridItem[] = [
    {
      label: 'Degree width',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.degree_width}
          onChange={(v) => updateDesign(['entries', 'degree_width'], v)}
        />
      ),
    },
    {
      label: 'Summary above',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.summary?.space_above}
          onChange={(v) => updateDesign(['entries', 'summary', 'space_above'], v)}
        />
      ),
    },
    {
      label: 'Summary left',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.summary?.space_left}
          onChange={(v) => updateDesign(['entries', 'summary', 'space_left'], v)}
        />
      ),
    },
  ];

  const entryToggles = [
    {
      label: 'Page break',
      checked: settings.design.entries?.allow_page_break,
      onChange: (v: boolean) => updateDesign(['entries', 'allow_page_break'], v),
    },
    {
      label: 'Short 2nd row',
      checked: settings.design.entries?.short_second_row,
      onChange: (v: boolean) => updateDesign(['entries', 'short_second_row'], v),
    },
  ];

  // ── Highlight fields ──────────────────────────────────────────────────────
  const hlFields: FieldGridItem[] = [
    {
      label: 'Indent left',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.highlights?.space_left}
          onChange={(v) => updateDesign(['entries', 'highlights', 'space_left'], v)}
        />
      ),
    },
    {
      label: 'Space above',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.highlights?.space_above}
          onChange={(v) => updateDesign(['entries', 'highlights', 'space_above'], v)}
        />
      ),
    },
    {
      label: 'Item gap',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.highlights?.space_between_items}
          onChange={(v) => updateDesign(['entries', 'highlights', 'space_between_items'], v)}
        />
      ),
    },
    {
      label: 'Bullet gap',
      node: (
        <RenderCvDimensionInput
          value={settings.design.entries?.highlights?.space_between_bullet_and_text}
          onChange={(v) =>
            updateDesign(['entries', 'highlights', 'space_between_bullet_and_text'], v)
          }
        />
      ),
    },
  ];

  return (
    <div className="pb-4">
      {/* TYPOGRAPHY */}
      <RenderCvSection title="Typography">
        <RenderCvTypographyMatrix
          roles={matrixRoles}
          fontOptions={RENDER_FONT_FAMILY_OPTIONS}
          onFontChange={(key, value) => updateDesign(['typography', 'font_family', key], value)}
          onFontSizeChange={(key, value) => updateDesign(['typography', 'font_size', key], value)}
          onBoldChange={(key, value) => updateDesign(['typography', 'bold', key], value)}
          onSmallCapsChange={(key, value) => updateDesign(['typography', 'small_caps', key], value)}
        />
        <div className="border-t border-border">
          <div className="flex h-5 items-center bg-muted/30 px-2">
            <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
              Letter Spacing
            </span>
          </div>
          <RenderCvFieldGrid fields={spacingFields} cols={4} />
        </div>
      </RenderCvSection>

      {/* COLORS — TEXT */}
      <RenderCvSection title="Colors — Text">
        <RenderCvColorGrid
          items={textColorItems.map(({ key, label }) => ({
            key,
            label,
            value:
              settings.design.colors?.[key as keyof NonNullable<typeof settings.design.colors>],
            onChange: (v) => updateDesign(['colors', key], v),
          }))}
        />
      </RenderCvSection>

      {/* COLORS — STRUCTURE */}
      <RenderCvSection title="Colors — Structure">
        <RenderCvColorGrid
          columns={1}
          items={structColorItems.map(({ key, label }) => ({
            key,
            label,
            value:
              settings.design.colors?.[key as keyof NonNullable<typeof settings.design.colors>],
            onChange: (v) => updateDesign(['colors', key], v),
          }))}
        />
      </RenderCvSection>

      {/* COLORS — ENTRY ACCENTS */}
      <RenderCvSection title="Colors — Entry Accents">
        <RenderCvColorGrid items={accentColorItems} />
        <RenderCvRow label="Stack sep." density="compact">
          <RenderCvSelect
            value={ws?.tech_stack?.separator ?? '•'}
            options={TECH_STACK_SEP_OPTIONS}
            onChange={(v) => updateWorkbenchStyle(['tech_stack', 'separator'], v)}
          />
        </RenderCvRow>
      </RenderCvSection>

      {/* SECTIONS */}
      <RenderCvSection title="Sections">
        <RenderCvToggleRow items={sectionToggles} />
        <RenderCvFieldGrid fields={sectionFields} cols={3} />
      </RenderCvSection>

      {/* ENTRIES */}
      <RenderCvSection title="Entries">
        <RenderCvToggleRow items={entryToggles} />
        <RenderCvFieldGrid fields={entryFields} cols={3} />
        {/* Highlights */}
        <div className="border-t border-border">
          <div className="flex h-5 items-center bg-muted/30 px-2">
            <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
              Highlights / Bullets
            </span>
          </div>
          <div className="px-2 py-1">
            <div className="mb-1">
              <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
                Bullet
              </span>
              <div className="mt-0.5">
                <RenderCvBulletPicker
                  value={settings.design.entries?.highlights?.bullet}
                  options={RENDER_BULLET_OPTIONS}
                  onChange={(v) => updateDesign(['entries', 'highlights', 'bullet'], v)}
                />
              </div>
            </div>
            <div className="mb-1.5">
              <span className="font-sans text-[9px] uppercase tracking-wider text-muted-foreground/70">
                Nested
              </span>
              <div className="mt-0.5">
                <RenderCvBulletPicker
                  value={settings.design.entries?.highlights?.nested_bullet}
                  options={RENDER_BULLET_OPTIONS}
                  onChange={(v) => updateDesign(['entries', 'highlights', 'nested_bullet'], v)}
                />
              </div>
            </div>
          </div>
          <RenderCvFieldGrid fields={hlFields} cols={4} />
        </div>
      </RenderCvSection>
    </div>
  );
}
