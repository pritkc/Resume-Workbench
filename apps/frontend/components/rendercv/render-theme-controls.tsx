'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_ALIGNMENT_OPTIONS,
  RENDER_DATE_ALIGNMENT_OPTIONS,
  RENDER_PHONE_NUMBER_FORMAT_OPTIONS,
  RENDER_PHOTO_POSITION_OPTIONS,
  RENDER_SECTION_TITLE_TYPE_OPTIONS,
  RENDER_THEME_OPTIONS,
  normalizeRenderThemeSettings,
  type RenderThemeId,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvInput,
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

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  const updateDesign = (path: string[], value: unknown, extra?: Partial<RenderThemeSettings>) => {
    const nextDesign = clone(settings.design);
    let cursor: Record<string, unknown> = nextDesign as Record<string, unknown>;

    for (const key of path.slice(0, -1)) {
      const nested = cursor[key];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }

    cursor[path[path.length - 1]] = value;
    onChange(normalizeRenderThemeSettings({ ...settings, ...extra, design: nextDesign }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border border-black bg-white px-4 py-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Design</p>
          <p className="mt-1 text-sm text-gray-600">
            Theme, typography, spacing, templates, and layout controls from the hosted editor.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            onChange(
              normalizeRenderThemeSettings({
                ...settings,
                theme_id: DEFAULT_RENDER_THEME_SETTINGS.theme_id,
                page_size: DEFAULT_RENDER_THEME_SETTINGS.page_size,
                show_contact_icons: DEFAULT_RENDER_THEME_SETTINGS.show_contact_icons,
                margins_mm: clone(DEFAULT_RENDER_THEME_SETTINGS.margins_mm),
                design: clone(DEFAULT_RENDER_THEME_SETTINGS.design),
              })
            )
          }
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Design
        </Button>
      </div>

      <RenderCvSection title="Theme">
        <RenderCvRow label="Theme">
          <RenderCvSelect
            value={settings.theme_id}
            options={RENDER_THEME_OPTIONS}
            onChange={(value) =>
              updateDesign(['theme'], value, { theme_id: value as RenderThemeId })
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Page">
        <RenderCvRow label="Page Size">
          <RenderCvSelect
            value={settings.design.page?.size}
            options={[
              { id: 'a4', label: 'A4' },
              { id: 'us-letter', label: 'US Letter' },
            ]}
            onChange={(value) =>
              updateDesign(['page', 'size'], value, {
                page_size: value === 'us-letter' ? 'LETTER' : 'A4',
              })
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Top Margin">
          <RenderCvInput
            value={settings.design.page?.top_margin}
            onChange={(value) => updateDesign(['page', 'top_margin'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Bottom Margin">
          <RenderCvInput
            value={settings.design.page?.bottom_margin}
            onChange={(value) => updateDesign(['page', 'bottom_margin'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Left Margin">
          <RenderCvInput
            value={settings.design.page?.left_margin}
            onChange={(value) => updateDesign(['page', 'left_margin'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Right Margin">
          <RenderCvInput
            value={settings.design.page?.right_margin}
            onChange={(value) => updateDesign(['page', 'right_margin'], value)}
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
      </RenderCvSection>

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
            <RenderCvInput
              value={
                settings.design.colors?.[key as keyof NonNullable<typeof settings.design.colors>]
              }
              onChange={(value) => updateDesign(['colors', key], value)}
            />
          </RenderCvRow>
        ))}
      </RenderCvSection>

      <RenderCvSection title="Typography">
        <RenderCvRow label="Line Spacing">
          <RenderCvInput
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
      </RenderCvSection>

      <RenderCvSection title="Font Family">
        {[
          ['body', 'Body'],
          ['name', 'Name'],
          ['headline', 'Headline'],
          ['connections', 'Connections'],
          ['section_titles', 'Section Titles'],
        ].map(([key, label]) => (
          <RenderCvRow key={key} label={label}>
            <RenderCvInput
              value={
                settings.design.typography?.font_family?.[
                  key as keyof NonNullable<
                    NonNullable<typeof settings.design.typography>['font_family']
                  >
                ]
              }
              onChange={(value) => updateDesign(['typography', 'font_family', key], value)}
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
            <RenderCvInput
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
                  key as keyof NonNullable<NonNullable<typeof settings.design.typography>['bold']>
                ]
              }
              onChange={(value) => updateDesign(['typography', 'bold', key], value)}
            />
          </RenderCvRow>
        ))}
      </RenderCvSection>

      <RenderCvSection title="Links">
        <RenderCvRow label="Underline">
          <RenderCvToggle
            checked={settings.design.links?.underline}
            onChange={(value) => updateDesign(['links', 'underline'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Show External Link Icon">
          <RenderCvToggle
            checked={settings.design.links?.show_external_link_icon}
            onChange={(value) => updateDesign(['links', 'show_external_link_icon'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Header">
        <RenderCvRow label="Alignment">
          <RenderCvSelect
            value={settings.design.header?.alignment}
            options={RENDER_DATE_ALIGNMENT_OPTIONS}
            onChange={(value) => updateDesign(['header', 'alignment'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Photo Width">
          <RenderCvInput
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
          <RenderCvInput
            value={settings.design.header?.photo_space_left}
            onChange={(value) => updateDesign(['header', 'photo_space_left'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Photo Space Right">
          <RenderCvInput
            value={settings.design.header?.photo_space_right}
            onChange={(value) => updateDesign(['header', 'photo_space_right'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Below Name">
          <RenderCvInput
            value={settings.design.header?.space_below_name}
            onChange={(value) => updateDesign(['header', 'space_below_name'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Below Headline">
          <RenderCvInput
            value={settings.design.header?.space_below_headline}
            onChange={(value) => updateDesign(['header', 'space_below_headline'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Below Connections">
          <RenderCvInput
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
              updateDesign(['header', 'connections', 'show_icons'], value, {
                show_contact_icons: value,
              })
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Display URLs Instead of Usernames">
          <RenderCvToggle
            checked={settings.design.header?.connections?.display_urls_instead_of_usernames}
            onChange={(value) =>
              updateDesign(['header', 'connections', 'display_urls_instead_of_usernames'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Separator">
          <RenderCvInput
            value={settings.design.header?.connections?.separator}
            onChange={(value) => updateDesign(['header', 'connections', 'separator'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Between Connections">
          <RenderCvInput
            value={settings.design.header?.connections?.space_between_connections}
            onChange={(value) =>
              updateDesign(['header', 'connections', 'space_between_connections'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Section Titles">
        <RenderCvRow label="Style">
          <RenderCvSelect
            value={settings.design.section_titles?.type}
            options={RENDER_SECTION_TITLE_TYPE_OPTIONS}
            onChange={(value) => updateDesign(['section_titles', 'type'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Line Thickness">
          <RenderCvInput
            value={settings.design.section_titles?.line_thickness}
            onChange={(value) => updateDesign(['section_titles', 'line_thickness'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Above">
          <RenderCvInput
            value={settings.design.section_titles?.space_above}
            onChange={(value) => updateDesign(['section_titles', 'space_above'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Below">
          <RenderCvInput
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
        <RenderCvRow label="Space Between Regular Entries">
          <RenderCvInput
            value={settings.design.sections?.space_between_regular_entries}
            onChange={(value) => updateDesign(['sections', 'space_between_regular_entries'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Between Text Entries">
          <RenderCvInput
            value={settings.design.sections?.space_between_text_based_entries}
            onChange={(value) =>
              updateDesign(['sections', 'space_between_text_based_entries'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow
          label="Show Time Spans In"
          description="Comma-separated section names that should show computed time spans."
        >
          <RenderCvInput
            value={arrayToText(settings.design.sections?.show_time_spans_in)}
            onChange={(value) =>
              updateDesign(['sections', 'show_time_spans_in'], textToArray(value))
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Entries">
        <RenderCvRow label="Date/Location Width">
          <RenderCvInput
            value={settings.design.entries?.date_and_location_width}
            onChange={(value) => updateDesign(['entries', 'date_and_location_width'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Side Space">
          <RenderCvInput
            value={settings.design.entries?.side_space}
            onChange={(value) => updateDesign(['entries', 'side_space'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Column Spacing">
          <RenderCvInput
            value={settings.design.entries?.space_between_columns}
            onChange={(value) => updateDesign(['entries', 'space_between_columns'], value)}
          />
        </RenderCvRow>
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
          <RenderCvInput
            value={settings.design.entries?.degree_width}
            onChange={(value) => updateDesign(['entries', 'degree_width'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Entry Summary">
        <RenderCvRow label="Space Above">
          <RenderCvInput
            value={settings.design.entries?.summary?.space_above}
            onChange={(value) => updateDesign(['entries', 'summary', 'space_above'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Left">
          <RenderCvInput
            value={settings.design.entries?.summary?.space_left}
            onChange={(value) => updateDesign(['entries', 'summary', 'space_left'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Entry Highlights">
        <RenderCvRow label="Bullet">
          <RenderCvInput
            value={settings.design.entries?.highlights?.bullet}
            onChange={(value) => updateDesign(['entries', 'highlights', 'bullet'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Nested Bullet">
          <RenderCvInput
            value={settings.design.entries?.highlights?.nested_bullet}
            onChange={(value) => updateDesign(['entries', 'highlights', 'nested_bullet'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Left">
          <RenderCvInput
            value={settings.design.entries?.highlights?.space_left}
            onChange={(value) => updateDesign(['entries', 'highlights', 'space_left'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Above">
          <RenderCvInput
            value={settings.design.entries?.highlights?.space_above}
            onChange={(value) => updateDesign(['entries', 'highlights', 'space_above'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Space Between Items">
          <RenderCvInput
            value={settings.design.entries?.highlights?.space_between_items}
            onChange={(value) =>
              updateDesign(['entries', 'highlights', 'space_between_items'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Space Between Bullet & Text">
          <RenderCvInput
            value={settings.design.entries?.highlights?.space_between_bullet_and_text}
            onChange={(value) =>
              updateDesign(['entries', 'highlights', 'space_between_bullet_and_text'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Templates">
        <RenderCvRow label="Footer">
          <RenderCvInput
            value={settings.design.templates?.footer}
            onChange={(value) => updateDesign(['templates', 'footer'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Top Note">
          <RenderCvInput
            value={settings.design.templates?.top_note}
            onChange={(value) => updateDesign(['templates', 'top_note'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Single Date">
          <RenderCvInput
            value={settings.design.templates?.single_date}
            onChange={(value) => updateDesign(['templates', 'single_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Date Range">
          <RenderCvInput
            value={settings.design.templates?.date_range}
            onChange={(value) => updateDesign(['templates', 'date_range'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Time Span">
          <RenderCvInput
            value={settings.design.templates?.time_span}
            onChange={(value) => updateDesign(['templates', 'time_span'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="One-Line Entry Template">
        <RenderCvRow label="Main Column">
          <RenderCvTextarea
            value={settings.design.templates?.one_line_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'one_line_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Education Entry Template">
        <RenderCvRow label="Main Column">
          <RenderCvTextarea
            value={settings.design.templates?.education_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Degree Column">
          <RenderCvInput
            value={settings.design.templates?.education_entry?.degree_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'degree_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Date & Location Column">
          <RenderCvInput
            value={settings.design.templates?.education_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Normal Entry Template">
        <RenderCvRow label="Main Column">
          <RenderCvTextarea
            value={settings.design.templates?.normal_entry?.main_column}
            onChange={(value) => updateDesign(['templates', 'normal_entry', 'main_column'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Date & Location Column">
          <RenderCvInput
            value={settings.design.templates?.normal_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'normal_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Experience Entry Template">
        <RenderCvRow label="Main Column">
          <RenderCvTextarea
            value={settings.design.templates?.experience_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'experience_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Date & Location Column">
          <RenderCvInput
            value={settings.design.templates?.experience_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'experience_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Publication Entry Template">
        <RenderCvRow label="Main Column">
          <RenderCvTextarea
            value={settings.design.templates?.publication_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'publication_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow label="Date & Location Column">
          <RenderCvInput
            value={settings.design.templates?.publication_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'publication_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvSection>
    </div>
  );
}
