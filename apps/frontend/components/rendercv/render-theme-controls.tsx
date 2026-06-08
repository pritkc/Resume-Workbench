'use client';

import { useState } from 'react';
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
  type RenderCvRuntimeSettings,
  type RenderTechStackSeparator,
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

/** Common `header.connections.separator` values used across bundled RenderCV themes. */
const RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS: Array<{ id: string; label: string }> = [
  { id: '', label: 'None' },
  { id: '|', label: 'Pipe (|)' },
  { id: '•', label: 'Bullet (•)' },
  { id: '·', label: 'Middle dot (·)' },
  { id: '/', label: 'Slash (/)' },
  { id: '—', label: 'Em dash (—)' },
  { id: ' – ', label: 'Spaced en dash' },
  { id: ' - ', label: 'Spaced hyphen' },
];

const RENDER_TECH_STACK_SEPARATOR_OPTIONS: Array<{
  id: RenderTechStackSeparator;
  label: string;
}> = [
  { id: '•', label: 'Bullet (•)' },
  { id: ',', label: 'Comma (,)' },
  { id: '·', label: 'Middle dot (·)' },
  { id: '|', label: 'Pipe (|)' },
  { id: '/', label: 'Slash (/)' },
];

interface RenderThemeControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

/** Collapsed navigation: layout / style / advanced (phase 3.11.1). */
type DesignBucketId = 'layout' | 'style' | 'advanced';

const DESIGN_BUCKETS: Array<{ id: DesignBucketId; label: string }> = [
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'advanced', label: 'Advanced' },
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

function cloneRuntimeStyle(
  settings: RenderThemeSettings
): NonNullable<RenderCvRuntimeSettings['resume_workbench_style']> {
  return structuredClone(settings.settings.resume_workbench_style ?? {});
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

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  const [activeBucket, setActiveBucket] = useState<DesignBucketId>('layout');

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

  const updateWorkbenchStyle = (path: string[], value: unknown) => {
    const nextStyle = cloneRuntimeStyle(settings);
    setNestedValue(nextStyle as Record<string, unknown>, path, value);
    onChange({
      ...settings,
      settings: {
        ...settings.settings,
        resume_workbench_style: nextStyle,
      },
    });
  };

  const workbenchStyle = settings.settings.resume_workbench_style;

  return (
    <div className="space-y-2">
      <div className="flex h-7 items-center gap-3 border border-border bg-card px-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Theme
        </span>
        <div className="min-w-[140px] flex-1">
          <RenderCvSelect
            value={settings.theme_id}
            options={RENDER_THEME_OPTIONS}
            onChange={(value) =>
              onChange(switchActiveRenderTheme(settings, value as RenderThemeId))
            }
          />
        </div>
        <button
          type="button"
          onClick={() => onChange(resetActiveRenderThemeProfile(settings))}
          className="font-mono text-[11px] uppercase tracking-wider text-red-600 hover:underline"
        >
          Reset
        </button>
      </div>

      <RenderCvQuickNav
        items={DESIGN_BUCKETS}
        activeId={activeBucket}
        onChange={(id) => setActiveBucket(id as DesignBucketId)}
      />

      {activeBucket === 'layout' && (
        <>
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
                    if (settings.page_size === 'FREEFLOW') {
                      profile.page_size = 'FREEFLOW';
                    } else {
                      profile.page_size = value === 'us-letter' ? 'LETTER' : 'A4';
                    }
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Continuous page">
              <RenderCvToggle
                checked={settings.page_size === 'FREEFLOW'}
                onChange={(enabled) =>
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
                  )
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
              <RenderCvRow
                label="Separator"
                description="Between contact items in the header (RenderCV `connections.separator`)."
              >
                {(() => {
                  const sep = settings.design.header?.connections?.separator ?? '';
                  const known = new Set(
                    RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS.map((o) => o.id)
                  );
                  const options =
                    sep && !known.has(sep)
                      ? [
                          ...RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS,
                          { id: sep, label: `Current (${sep})` },
                        ]
                      : [...RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS];
                  return (
                    <RenderCvSelect
                      value={sep}
                      options={options}
                      onChange={(value) =>
                        updateDesign(['header', 'connections', 'separator'], value)
                      }
                    />
                  );
                })()}
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
        </>
      )}

      {activeBucket === 'style' && (
        <>
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
                    settings.design.colors?.[
                      key as keyof NonNullable<typeof settings.design.colors>
                    ]
                  }
                  onChange={(value) => updateDesign(['colors', key], value)}
                  placeholder="Hex, rgb(...), hsl(...), or named color"
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>

          <RenderCvSection title="Field Styling">
            <RenderCvRow label="Profile Entries" description="Header contact/profile row color.">
              <RenderCvColorInput
                value={settings.design.colors?.connections}
                onChange={(value) => updateDesign(['colors', 'connections'], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
            <RenderCvRow
              label="Horizontal Lines"
              description="Uses the RenderCV section title/line color."
            >
              <RenderCvColorInput
                value={settings.design.colors?.section_titles}
                onChange={(value) => updateDesign(['colors', 'section_titles'], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
            <RenderCvRow label="Company Name">
              <RenderCvColorInput
                value={workbenchStyle?.colors?.company}
                onChange={(value) => updateWorkbenchStyle(['colors', 'company'], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
            <RenderCvRow label="Stack Line">
              <RenderCvColorInput
                value={workbenchStyle?.colors?.stack}
                onChange={(value) => updateWorkbenchStyle(['colors', 'stack'], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
            <RenderCvRow label="Date / Location">
              <RenderCvColorInput
                value={workbenchStyle?.colors?.date_location}
                onChange={(value) => updateWorkbenchStyle(['colors', 'date_location'], value)}
                placeholder="Hex, rgb(...), hsl(...), or named color"
              />
            </RenderCvRow>
            <RenderCvRow label="Stack Separator">
              <RenderCvSelect
                value={workbenchStyle?.tech_stack?.separator ?? '•'}
                options={RENDER_TECH_STACK_SEPARATOR_OPTIONS}
                onChange={(value) => updateWorkbenchStyle(['tech_stack', 'separator'], value)}
              />
            </RenderCvRow>
          </RenderCvSection>

          <RenderCvSection title="Header Letter Spacing">
            {[
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Profile Entries'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow key={key} label={label}>
                <RenderCvDimensionInput
                  value={
                    workbenchStyle?.typography?.letter_spacing?.[
                      key as keyof NonNullable<
                        NonNullable<typeof workbenchStyle>['typography']
                      >['letter_spacing']
                    ]
                  }
                  onChange={(value) =>
                    updateWorkbenchStyle(['typography', 'letter_spacing', key], value)
                  }
                  placeholder="0pt"
                />
              </RenderCvRow>
            ))}
          </RenderCvSection>

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
                  onChange={(value) =>
                    updateDesign(['entries', 'highlights', 'space_above'], value)
                  }
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
        </>
      )}

      {activeBucket === 'advanced' && (
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

          <RenderCvSection title="Project / Normal Entry Template">
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
      )}
    </div>
  );
}
