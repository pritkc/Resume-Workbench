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
  RenderCvInput,
  RenderCvRow,
  RenderCvSection,
  RenderCvSectionAnchors,
  RenderCvSelect,
  RenderCvToggle,
  RenderCvTypographyMatrix,
  arrayToText,
  textToArray,
} from './rendercv-controls-shared';
import { createDesignUpdaters } from './render-theme-controls-utils';

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

const STYLE_ANCHORS = [
  { id: 'design-typography', label: 'Typography' },
  { id: 'design-colors', label: 'Colors' },
  { id: 'design-sections', label: 'Sections' },
  { id: 'design-entries', label: 'Entries' },
];

const TYPOGRAPHY_ROLES = [
  { key: 'body', label: 'Body', showBold: false, showSmallCaps: false },
  { key: 'name', label: 'Name' },
  { key: 'headline', label: 'Headline' },
  { key: 'connections', label: 'Connections' },
  { key: 'section_titles', label: 'Section Titles' },
] as const;

interface RenderThemeStylePanelProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

export function RenderThemeStylePanel({ settings, onChange }: RenderThemeStylePanelProps) {
  const { updateDesign, updateWorkbenchStyle } = createDesignUpdaters({ settings, onChange });
  const workbenchStyle = settings.settings.resume_workbench_style;
  const typography = settings.design.typography;

  const matrixRoles = TYPOGRAPHY_ROLES.map((role) => ({
    key: role.key,
    label: role.label,
    font: typography?.font_family?.[
      role.key as keyof NonNullable<typeof typography>['font_family']
    ],
    fontSize:
      typography?.font_size?.[role.key as keyof NonNullable<typeof typography>['font_size']],
    bold: typography?.bold?.[role.key as keyof NonNullable<typeof typography>['bold']],
    smallCaps:
      typography?.small_caps?.[role.key as keyof NonNullable<typeof typography>['small_caps']],
    showBold: role.showBold !== false,
    showSmallCaps: role.showSmallCaps !== false,
  }));

  const designColors = [
    { key: 'body', label: 'Body' },
    { key: 'name', label: 'Name' },
    { key: 'headline', label: 'Headline' },
    { key: 'connections', label: 'Connections' },
    { key: 'section_titles', label: 'Section Titles' },
    { key: 'links', label: 'Links' },
    { key: 'footer', label: 'Footer' },
    { key: 'top_note', label: 'Top Note' },
  ] as const;

  const entryAccentColors = [
    {
      key: 'company',
      label: 'Company',
      value: workbenchStyle?.colors?.company,
      onChange: (value: string) => updateWorkbenchStyle(['colors', 'company'], value),
    },
    {
      key: 'stack',
      label: 'Stack Line',
      value: workbenchStyle?.colors?.stack,
      onChange: (value: string) => updateWorkbenchStyle(['colors', 'stack'], value),
    },
    {
      key: 'date_location',
      label: 'Date / Location',
      value: workbenchStyle?.colors?.date_location,
      onChange: (value: string) => updateWorkbenchStyle(['colors', 'date_location'], value),
    },
  ];

  return (
    <div className="space-y-2">
      <RenderCvSectionAnchors items={STYLE_ANCHORS} />

      <section id="design-typography" className="scroll-mt-16">
        <RenderCvSection title="Typography">
          <RenderCvTypographyMatrix
            roles={matrixRoles}
            fontOptions={RENDER_FONT_FAMILY_OPTIONS}
            onFontChange={(key, value) => updateDesign(['typography', 'font_family', key], value)}
            onFontSizeChange={(key, value) => updateDesign(['typography', 'font_size', key], value)}
            onBoldChange={(key, value) => updateDesign(['typography', 'bold', key], value)}
            onSmallCapsChange={(key, value) =>
              updateDesign(['typography', 'small_caps', key], value)
            }
          />
          <div className="border-t border-border">
            {[
              ['name', 'Name'],
              ['headline', 'Headline'],
              ['connections', 'Connections'],
              ['section_titles', 'Section Titles'],
            ].map(([key, label]) => (
              <RenderCvRow key={key} label={`${label} Spacing`} density="compact">
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
          </div>
        </RenderCvSection>
      </section>

      <section id="design-colors" className="scroll-mt-16">
        <RenderCvSection title="Colors">
          <RenderCvColorGrid
            items={designColors.map(({ key, label }) => ({
              key,
              label,
              value:
                settings.design.colors?.[key as keyof NonNullable<typeof settings.design.colors>],
              onChange: (value) => updateDesign(['colors', key], value),
            }))}
          />
        </RenderCvSection>
        <RenderCvSection title="Entry Accents">
          <RenderCvColorGrid items={entryAccentColors} />
          <RenderCvRow label="Stack Separator" density="compact">
            <RenderCvSelect
              value={workbenchStyle?.tech_stack?.separator ?? '•'}
              options={RENDER_TECH_STACK_SEPARATOR_OPTIONS}
              onChange={(value) => updateWorkbenchStyle(['tech_stack', 'separator'], value)}
            />
          </RenderCvRow>
        </RenderCvSection>
      </section>

      <section id="design-sections" className="scroll-mt-16">
        <RenderCvSection title="Sections">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Title Style" density="compact">
              <RenderCvSelect
                value={settings.design.section_titles?.type}
                options={RENDER_SECTION_TITLE_TYPE_OPTIONS}
                onChange={(value) => updateDesign(['section_titles', 'type'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Line Thickness" density="compact">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.line_thickness}
                onChange={(value) => updateDesign(['section_titles', 'line_thickness'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Above" density="compact">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.space_above}
                onChange={(value) => updateDesign(['section_titles', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Space Below" density="compact">
              <RenderCvDimensionInput
                value={settings.design.section_titles?.space_below}
                onChange={(value) => updateDesign(['section_titles', 'space_below'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Page Break" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.sections?.allow_page_break}
                onChange={(value) => updateDesign(['sections', 'allow_page_break'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Entry Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.sections?.space_between_regular_entries}
                onChange={(value) =>
                  updateDesign(['sections', 'space_between_regular_entries'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Text Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.sections?.space_between_text_based_entries}
                onChange={(value) =>
                  updateDesign(['sections', 'space_between_text_based_entries'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow
              label="Time Spans In"
              density="compact"
              description="Comma-separated section names"
            >
              <RenderCvInput
                value={arrayToText(settings.design.sections?.show_time_spans_in)}
                onChange={(value) =>
                  updateDesign(['sections', 'show_time_spans_in'], textToArray(value))
                }
                placeholder="experience, education"
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>

      <section id="design-entries" className="scroll-mt-16">
        <RenderCvSection title="Entries">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Page Break" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.entries?.allow_page_break}
                onChange={(value) => updateDesign(['entries', 'allow_page_break'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Short 2nd Row" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.entries?.short_second_row}
                onChange={(value) => updateDesign(['entries', 'short_second_row'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Degree Width" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.degree_width}
                onChange={(value) => updateDesign(['entries', 'degree_width'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Summary Above" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.summary?.space_above}
                onChange={(value) => updateDesign(['entries', 'summary', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Summary Left" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.summary?.space_left}
                onChange={(value) => updateDesign(['entries', 'summary', 'space_left'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Bullet" density="compact">
              <RenderCvBulletPicker
                value={settings.design.entries?.highlights?.bullet}
                options={RENDER_BULLET_OPTIONS}
                onChange={(value) => updateDesign(['entries', 'highlights', 'bullet'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Nested Bullet" density="compact">
              <RenderCvBulletPicker
                value={settings.design.entries?.highlights?.nested_bullet}
                options={RENDER_BULLET_OPTIONS}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'nested_bullet'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Highlight Left" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_left}
                onChange={(value) => updateDesign(['entries', 'highlights', 'space_left'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Highlight Above" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_above}
                onChange={(value) => updateDesign(['entries', 'highlights', 'space_above'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Item Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_between_items}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'space_between_items'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Bullet Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.highlights?.space_between_bullet_and_text}
                onChange={(value) =>
                  updateDesign(['entries', 'highlights', 'space_between_bullet_and_text'], value)
                }
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>
    </div>
  );
}
