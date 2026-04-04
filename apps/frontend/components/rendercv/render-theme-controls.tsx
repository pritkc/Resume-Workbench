'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  RENDER_ALIGNMENT_OPTIONS,
  RENDER_BULLET_OPTIONS,
  RENDER_DATE_ALIGNMENT_OPTIONS,
  RENDER_FONT_FAMILY_OPTIONS,
  RENDER_PHONE_NUMBER_FORMAT_OPTIONS,
  RENDER_PHOTO_POSITION_OPTIONS,
  RENDER_SECTION_TITLE_TYPE_OPTIONS,
  RENDER_THEME_OPTIONS,
  TEMPLATE_HINTS,
  resetActiveRenderThemeProfile,
  switchActiveRenderTheme,
  updateActiveRenderTheme,
  type RenderCvDesign,
  type RenderThemeId,
  type RenderThemeProfileSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvAutocompleteInput,
  RenderCvBulletPicker,
  RenderCvColorInput,
  RenderCvDimensionInput,
  RenderCvInput,
  RenderCvQuickNav,
  RenderCvRow,
  RenderCvSection,
  RenderCvSelect,
  RenderCvTextarea,
  RenderCvToggle,
  arrayToText,
  textToArray,
} from './rendercv-controls-shared';

interface RenderThemeControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

type DesignGroupId =
  | 'core'
  | 'page-layout'
  | 'header-connections'
  | 'typography'
  | 'colors'
  | 'sections-entries'
  | 'templates';

const DESIGN_GROUPS: Array<{ id: DesignGroupId; label: string }> = [
  { id: 'core', label: 'Core' },
  { id: 'page-layout', label: 'Page & Layout' },
  { id: 'header-connections', label: 'Header & Connections' },
  { id: 'typography', label: 'Typography' },
  { id: 'colors', label: 'Colors' },
  { id: 'sections-entries', label: 'Sections & Entries' },
  { id: 'templates', label: 'Templates / Advanced' },
];

function setNestedValue(root: Record<string, unknown>, path: string[], value: unknown) {
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    const nested = cursor[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

function dimensionToMm(value: string, fallback: number): number {
  const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('mm')) return Math.round(numeric);
  if (normalized.endsWith('cm')) return Math.round(numeric * 10);
  if (normalized.endsWith('pt')) return Math.round((numeric / 72) * 25.4);
  if (normalized.endsWith('in')) return Math.round(numeric * 25.4);
  return fallback;
}

function titleForTheme(themeId: RenderThemeId) {
  return RENDER_THEME_OPTIONS.find((option) => option.id === themeId)?.label ?? 'Theme';
}

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  const [activeGroup, setActiveGroup] = useState<DesignGroupId>('core');

  const updateDesign = (
    path: string[],
    value: unknown,
    mutateProfile?: (profile: RenderThemeProfileSettings, nextDesign: RenderCvDesign) => void
  ) => {
    onChange(
      updateActiveRenderTheme(settings, ({ design, profile }) => {
        setNestedValue(design as Record<string, unknown>, path, value);
        mutateProfile?.(profile, design);
      })
    );
  };

  return (
    <div className="space-y-3">
      <div className="border border-black bg-white px-3 py-2.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Design</p>
            <p className="mt-1 text-[13px] text-gray-600">
              Editing{' '}
              <span className="font-semibold text-black">{titleForTheme(settings.theme_id)}</span>.
            </p>
          </div>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
            <div className="min-w-[200px]">
              <p className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-gray-600">
                Theme
              </p>
              <RenderCvSelect
                value={settings.theme_id}
                options={RENDER_THEME_OPTIONS}
                onChange={(value) =>
                  onChange(switchActiveRenderTheme(settings, value as RenderThemeId))
                }
              />
            </div>
            <Button
              variant="outline"
              onClick={() => onChange(resetActiveRenderThemeProfile(settings))}
              size="xs"
              className="gap-1.5"
            >
              <RotateCcw className="h-4 w-4" />
              Reset Theme Defaults
            </Button>
          </div>
        </div>
      </div>

      <RenderCvQuickNav
        items={DESIGN_GROUPS}
        activeId={activeGroup}
        onChange={(id) => setActiveGroup(id as DesignGroupId)}
      />

      {activeGroup === 'core' ? (
        <RenderCvSection title="Core">
          <RenderCvRow label="Page Size">
            <RenderCvSelect
              value={settings.design.page?.size}
              options={[
                { id: 'a4', label: 'A4' },
                { id: 'us-letter', label: 'US Letter' },
              ]}
              onChange={(value) =>
                updateDesign(['page', 'size'], value, (profile) => {
                  profile.page_size = value === 'us-letter' ? 'LETTER' : 'A4';
                })
              }
            />
          </RenderCvRow>
          <RenderCvRow label="Show Footer">
            <RenderCvToggle
              checked={settings.design.page?.show_footer}
              onChange={(value) => updateDesign(['page', 'show_footer'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Show Top Note">
            <RenderCvToggle
              checked={settings.design.page?.show_top_note}
              onChange={(value) => updateDesign(['page', 'show_top_note'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Underline Links">
            <RenderCvToggle
              checked={settings.design.links?.underline}
              onChange={(value) => updateDesign(['links', 'underline'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="External Link Icon">
            <RenderCvToggle
              checked={settings.design.links?.show_external_link_icon}
              onChange={(value) => updateDesign(['links', 'show_external_link_icon'], value)}
            />
          </RenderCvRow>
        </RenderCvSection>
      ) : null}

      {activeGroup === 'page-layout' ? (
        <div className="space-y-3">
          <RenderCvSection title="Page Margins">
            <RenderCvRow label="Top Margin">
              <RenderCvDimensionInput
                value={settings.design.page?.top_margin}
                onChange={(value) =>
                  updateDesign(['page', 'top_margin'], value, (profile) => {
                    profile.margins_mm = {
                      ...(profile.margins_mm ?? {}),
                      top: dimensionToMm(value, settings.margins_mm.top),
                    };
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Bottom Margin">
              <RenderCvDimensionInput
                value={settings.design.page?.bottom_margin}
                onChange={(value) =>
                  updateDesign(['page', 'bottom_margin'], value, (profile) => {
                    profile.margins_mm = {
                      ...(profile.margins_mm ?? {}),
                      bottom: dimensionToMm(value, settings.margins_mm.bottom),
                    };
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Left Margin">
              <RenderCvDimensionInput
                value={settings.design.page?.left_margin}
                onChange={(value) =>
                  updateDesign(['page', 'left_margin'], value, (profile) => {
                    profile.margins_mm = {
                      ...(profile.margins_mm ?? {}),
                      left: dimensionToMm(value, settings.margins_mm.left),
                    };
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Right Margin">
              <RenderCvDimensionInput
                value={settings.design.page?.right_margin}
                onChange={(value) =>
                  updateDesign(['page', 'right_margin'], value, (profile) => {
                    profile.margins_mm = {
                      ...(profile.margins_mm ?? {}),
                      right: dimensionToMm(value, settings.margins_mm.right),
                    };
                  })
                }
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Layout">
            <RenderCvRow label="Line Spacing">
              <RenderCvDimensionInput
                value={settings.design.typography?.line_spacing}
                onChange={(value) => updateDesign(['typography', 'line_spacing'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Alignment">
              <RenderCvSelect
                value={settings.design.typography?.alignment}
                options={RENDER_ALIGNMENT_OPTIONS}
                onChange={(value) => updateDesign(['typography', 'alignment'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Date/Location Alignment">
              <RenderCvSelect
                value={settings.design.typography?.date_and_location_column_alignment}
                options={RENDER_DATE_ALIGNMENT_OPTIONS}
                onChange={(value) =>
                  updateDesign(['typography', 'date_and_location_column_alignment'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Date/Location Width">
              <RenderCvDimensionInput
                value={settings.design.entries?.date_and_location_width}
                onChange={(value) => updateDesign(['entries', 'date_and_location_width'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Side Space">
              <RenderCvDimensionInput
                value={settings.design.entries?.side_space}
                onChange={(value) => updateDesign(['entries', 'side_space'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Column Spacing">
              <RenderCvDimensionInput
                value={settings.design.entries?.space_between_columns}
                onChange={(value) => updateDesign(['entries', 'space_between_columns'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>
        </div>
      ) : null}

      {activeGroup === 'header-connections' ? (
        <div className="space-y-3">
          <RenderCvSection title="Header">
            <RenderCvRow label="Alignment">
              <RenderCvSelect
                value={settings.design.header?.alignment}
                options={RENDER_DATE_ALIGNMENT_OPTIONS}
                onChange={(value) => updateDesign(['header', 'alignment'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Width">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_width}
                onChange={(value) => updateDesign(['header', 'photo_width'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Position">
              <RenderCvSelect
                value={settings.design.header?.photo_position}
                options={RENDER_PHOTO_POSITION_OPTIONS}
                onChange={(value) => updateDesign(['header', 'photo_position'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Space Left">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_space_left}
                onChange={(value) => updateDesign(['header', 'photo_space_left'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Space Right">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_space_right}
                onChange={(value) => updateDesign(['header', 'photo_space_right'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Below Name">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_name}
                onChange={(value) => updateDesign(['header', 'space_below_name'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Below Headline">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_headline}
                onChange={(value) => updateDesign(['header', 'space_below_headline'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Below Connections">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_connections}
                onChange={(value) => updateDesign(['header', 'space_below_connections'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Header Connections">
            <RenderCvRow label="Phone Number Format">
              <RenderCvSelect
                value={settings.design.header?.connections?.phone_number_format}
                options={RENDER_PHONE_NUMBER_FORMAT_OPTIONS}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'phone_number_format'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Hyperlink">
              <RenderCvToggle
                checked={settings.design.header?.connections?.hyperlink}
                onChange={(value) => updateDesign(['header', 'connections', 'hyperlink'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Show Icons">
              <RenderCvToggle
                checked={settings.design.header?.connections?.show_icons}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'show_icons'], value, (profile) => {
                    profile.show_contact_icons = value;
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Display URLs">
              <RenderCvToggle
                checked={settings.design.header?.connections?.display_urls_instead_of_usernames}
                onChange={(value) =>
                  updateDesign(
                    ['header', 'connections', 'display_urls_instead_of_usernames'],
                    value
                  )
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Separator">
              <RenderCvInput
                value={settings.design.header?.connections?.separator}
                onChange={(value) => updateDesign(['header', 'connections', 'separator'], value)}
                placeholder="Leave empty for no separator"
              />
            </RenderCvRow>
            <RenderCvRow label="Connection Gap">
              <RenderCvDimensionInput
                value={settings.design.header?.connections?.space_between_connections}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'space_between_connections'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>
        </div>
      ) : null}

      {activeGroup === 'typography' ? (
        <div className="space-y-3">
          <RenderCvSection title="Font Family">
            {[
              ['body', 'Body'],
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Connections'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow
                key={key}
                label={label}
                description="Pick a bundled font or type your own."
              >
                <RenderCvAutocompleteInput
                  value={
                    settings.design.typography?.font_family?.[
                      key as keyof NonNullable<
                        NonNullable<typeof settings.design.typography>['font_family']
                      >
                    ]
                  }
                  onChange={(value) => updateDesign(['typography', 'font_family', key], value)}
                  options={RENDER_FONT_FAMILY_OPTIONS}
                  placeholder="Type a font family"
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>

          <RenderCvSection title="Font Size">
            {[
              ['body', 'Body'],
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Connections'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow key={key} label={label}>
                <RenderCvDimensionInput
                  value={
                    settings.design.typography?.font_size?.[
                      key as keyof NonNullable<
                        NonNullable<typeof settings.design.typography>['font_size']
                      >
                    ]
                  }
                  onChange={(value) => updateDesign(['typography', 'font_size', key], value)}
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>

          <RenderCvSection title="Small Caps">
            {[
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Connections'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow key={key} label={label}>
                <RenderCvToggle
                  checked={
                    settings.design.typography?.small_caps?.[
                      key as keyof NonNullable<
                        NonNullable<typeof settings.design.typography>['small_caps']
                      >
                    ]
                  }
                  onChange={(value) => updateDesign(['typography', 'small_caps', key], value)}
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>

          <RenderCvSection title="Bold">
            {[
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Connections'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow key={key} label={label}>
                <RenderCvToggle
                  checked={
                    settings.design.typography?.bold?.[
                      key as keyof NonNullable<
                        NonNullable<typeof settings.design.typography>['bold']
                      >
                    ]
                  }
                  onChange={(value) => updateDesign(['typography', 'bold', key], value)}
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>
        </div>
      ) : null}

      {activeGroup === 'colors' ? (
        <RenderCvSection title="Colors">
          {[
            ['body', 'Body'],
            ['name', 'Name'],
            ['headline', 'Headline'],
            ['connections', 'Connections'],
            ['section_titles', 'Section Titles'],
            ['links', 'Links'],
            ['footer', 'Footer'],
            ['top_note', 'Top Note'],
          ].map(([key, label]) => (
            <RenderCvRow key={key} label={label}>
              <RenderCvColorInput
                value={
                  settings.design.colors?.[key as keyof NonNullable<typeof settings.design.colors>]
                }
                onChange={(value) => updateDesign(['colors', key], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
          ))}
        </RenderCvSection>
      ) : null}

      {activeGroup === 'sections-entries' ? (
        <div className="space-y-3">
          <RenderCvSection title="Section Titles">
            <RenderCvRow label="Style">
              <RenderCvSelect
                value={settings.design.section_titles?.type}
                options={RENDER_SECTION_TITLE_TYPE_OPTIONS}
                onChange={(value) => updateDesign(['section_titles', 'type'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Line Thickness">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.line_thickness}
                onChange={(value) => updateDesign(['section_titles', 'line_thickness'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Above">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.space_above}
                onChange={(value) => updateDesign(['section_titles', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Below">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.space_below}
                onChange={(value) => updateDesign(['section_titles', 'space_below'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Sections">
            <RenderCvRow label="Allow Page Break">
              <RenderCvToggle
                checked={settings.design.sections?.allow_page_break}
                onChange={(value) => updateDesign(['sections', 'allow_page_break'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Regular Entry Gap">
              <RenderCvDimensionInput
                value={settings.design.sections?.space_between_regular_entries}
                onChange={(value) =>
                  updateDesign(['sections', 'space_between_regular_entries'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Text Entry Gap">
              <RenderCvDimensionInput
                value={settings.design.sections?.space_between_text_based_entries}
                onChange={(value) =>
                  updateDesign(['sections', 'space_between_text_based_entries'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Show Time Spans In" description="Comma-separated section names.">
              <RenderCvInput
                value={arrayToText(settings.design.sections?.show_time_spans_in)}
                onChange={(value) =>
                  updateDesign(['sections', 'show_time_spans_in'], textToArray(value))
                }
                placeholder="experience, education"
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Entries">
            <RenderCvRow label="Allow Page Break">
              <RenderCvToggle
                checked={settings.design.entries?.allow_page_break}
                onChange={(value) => updateDesign(['entries', 'allow_page_break'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Short Second Row">
              <RenderCvToggle
                checked={settings.design.entries?.short_second_row}
                onChange={(value) => updateDesign(['entries', 'short_second_row'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Degree Width">
              <RenderCvDimensionInput
                value={settings.design.entries?.degree_width}
                onChange={(value) => updateDesign(['entries', 'degree_width'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Entry Summary">
            <RenderCvRow label="Space Above">
              <RenderCvDimensionInput
                value={settings.design.entries?.summary?.space_above}
                onChange={(value) => updateDesign(['entries', 'summary', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Left">
              <RenderCvDimensionInput
                value={settings.design.entries?.summary?.space_left}
                onChange={(value) => updateDesign(['entries', 'summary', 'space_left'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Entry Highlights">
            <RenderCvRow label="Bullet">
              <RenderCvBulletPicker
                value={settings.design.entries?.highlights?.bullet}
                options={RENDER_BULLET_OPTIONS}
                onChange={(value) => updateDesign(['entries', 'highlights', 'bullet'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Nested Bullet">
              <RenderCvBulletPicker
                value={settings.design.entries?.highlights?.nested_bullet}
                options={RENDER_BULLET_OPTIONS}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'nested_bullet'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Space Left">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_left}
                onChange={(value) => updateDesign(['entries', 'highlights', 'space_left'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Above">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_above}
                onChange={(value) => updateDesign(['entries', 'highlights', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Item Gap">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_between_items}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'space_between_items'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Bullet/Text Gap">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_between_bullet_and_text}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'space_between_bullet_and_text'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>
        </div>
      ) : null}

      {activeGroup === 'templates' ? (
        <div className="space-y-3">
          <RenderCvSection title="Templates">
            <RenderCvRow label="Footer" fieldHint={TEMPLATE_HINTS.footer}>
              <RenderCvInput
                value={settings.design.templates?.footer}
                onChange={(value) => updateDesign(['templates', 'footer'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Top Note" fieldHint={TEMPLATE_HINTS.top_note}>
              <RenderCvInput
                value={settings.design.templates?.top_note}
                onChange={(value) => updateDesign(['templates', 'top_note'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Single Date" fieldHint={TEMPLATE_HINTS.single_date}>
              <RenderCvInput
                value={settings.design.templates?.single_date}
                onChange={(value) => updateDesign(['templates', 'single_date'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Date Range" fieldHint={TEMPLATE_HINTS.date_range}>
              <RenderCvInput
                value={settings.design.templates?.date_range}
                onChange={(value) => updateDesign(['templates', 'date_range'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Time Span" fieldHint={TEMPLATE_HINTS.time_span}>
              <RenderCvInput
                value={settings.design.templates?.time_span}
                onChange={(value) => updateDesign(['templates', 'time_span'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="One-Line Entry Template">
            <RenderCvRow label="Main Column" fieldHint={TEMPLATE_HINTS.one_line_entry}>
              <RenderCvTextarea
                value={settings.design.templates?.one_line_entry?.main_column}
                onChange={(value) =>
                  updateDesign(['templates', 'one_line_entry', 'main_column'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Education Entry Template">
            <RenderCvRow label="Main Column" fieldHint={TEMPLATE_HINTS.education_entry}>
              <RenderCvTextarea
                value={settings.design.templates?.education_entry?.main_column}
                onChange={(value) =>
                  updateDesign(['templates', 'education_entry', 'main_column'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Degree Column" fieldHint={TEMPLATE_HINTS.education_entry}>
              <RenderCvInput
                value={settings.design.templates?.education_entry?.degree_column}
                onChange={(value) =>
                  updateDesign(['templates', 'education_entry', 'degree_column'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Date & Location Column" fieldHint={TEMPLATE_HINTS.education_entry}>
              <RenderCvInput
                value={settings.design.templates?.education_entry?.date_and_location_column}
                onChange={(value) =>
                  updateDesign(['templates', 'education_entry', 'date_and_location_column'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Normal Entry Template">
            <RenderCvRow label="Main Column" fieldHint={TEMPLATE_HINTS.normal_entry}>
              <RenderCvTextarea
                value={settings.design.templates?.normal_entry?.main_column}
                onChange={(value) =>
                  updateDesign(['templates', 'normal_entry', 'main_column'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Date & Location Column" fieldHint={TEMPLATE_HINTS.normal_entry}>
              <RenderCvInput
                value={settings.design.templates?.normal_entry?.date_and_location_column}
                onChange={(value) =>
                  updateDesign(['templates', 'normal_entry', 'date_and_location_column'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Experience Entry Template">
            <RenderCvRow label="Main Column" fieldHint={TEMPLATE_HINTS.experience_entry}>
              <RenderCvTextarea
                value={settings.design.templates?.experience_entry?.main_column}
                onChange={(value) =>
                  updateDesign(['templates', 'experience_entry', 'main_column'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Date & Location Column" fieldHint={TEMPLATE_HINTS.experience_entry}>
              <RenderCvInput
                value={settings.design.templates?.experience_entry?.date_and_location_column}
                onChange={(value) =>
                  updateDesign(['templates', 'experience_entry', 'date_and_location_column'], value)
                }
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Publication Entry Template">
            <RenderCvRow label="Main Column" fieldHint={TEMPLATE_HINTS.publication_entry}>
              <RenderCvTextarea
                value={settings.design.templates?.publication_entry?.main_column}
                onChange={(value) =>
                  updateDesign(['templates', 'publication_entry', 'main_column'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow
              label="Date & Location Column"
              fieldHint={TEMPLATE_HINTS.publication_entry}
            >
              <RenderCvInput
                value={settings.design.templates?.publication_entry?.date_and_location_column}
                onChange={(value) =>
                  updateDesign(
                    ['templates', 'publication_entry', 'date_and_location_column'],
                    value
                  )
                }
              />
            </RenderCvRow>
          </RenderCvSection>
        </div>
      ) : null}
    </div>
  );
}
