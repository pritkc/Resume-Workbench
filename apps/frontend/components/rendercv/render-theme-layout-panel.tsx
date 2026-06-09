'use client';

import {
  RENDER_ALIGNMENT_OPTIONS,
  RENDER_DATE_ALIGNMENT_OPTIONS,
  RENDER_PHONE_NUMBER_FORMAT_OPTIONS,
  RENDER_PHOTO_POSITION_OPTIONS,
  updateActiveRenderTheme,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvDimensionInput,
  RenderCvMarginGrid,
  RenderCvRow,
  RenderCvSection,
  RenderCvSectionAnchors,
  RenderCvSelect,
  RenderCvToggle,
} from './rendercv-controls-shared';
import { createDesignUpdaters, dimensionToMm, setNestedValue } from './render-theme-controls-utils';

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

const LAYOUT_ANCHORS = [
  { id: 'design-page', label: 'Page' },
  { id: 'design-margins', label: 'Margins' },
  { id: 'design-columns', label: 'Columns' },
  { id: 'design-header', label: 'Header' },
  { id: 'design-connections', label: 'Connections' },
];

interface RenderThemeLayoutPanelProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

export function RenderThemeLayoutPanel({ settings, onChange }: RenderThemeLayoutPanelProps) {
  const { updateDesign } = createDesignUpdaters({ settings, onChange });

  const separator = settings.design.header?.connections?.separator ?? '';
  const knownSeparators = new Set(RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS.map((o) => o.id));
  const separatorOptions =
    separator && !knownSeparators.has(separator)
      ? [
          ...RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS,
          { id: separator, label: `Current (${separator})` },
        ]
      : [...RENDER_HEADER_CONNECTION_SEPARATOR_OPTIONS];

  return (
    <div className="space-y-2">
      <RenderCvSectionAnchors items={LAYOUT_ANCHORS} />

      <section id="design-page" className="scroll-mt-16">
        <RenderCvSection title="Page">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Page Size" density="compact">
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
            <RenderCvRow label="Continuous" density="compact" description="Single scrolling page">
              <RenderCvToggle
                compact
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
            <RenderCvRow label="Footer" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.page?.show_footer}
                onChange={(value) => updateDesign(['page', 'show_footer'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Top Note" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.page?.show_top_note}
                onChange={(value) => updateDesign(['page', 'show_top_note'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Underline Links" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.links?.underline}
                onChange={(value) => updateDesign(['links', 'underline'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="External Icon" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.links?.show_external_link_icon}
                onChange={(value) => updateDesign(['links', 'show_external_link_icon'], value)}
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>

      <section id="design-margins" className="scroll-mt-16">
        <RenderCvSection title="Margins">
          <RenderCvMarginGrid
            margins={{
              top: settings.design.page?.top_margin,
              bottom: settings.design.page?.bottom_margin,
              left: settings.design.page?.left_margin,
              right: settings.design.page?.right_margin,
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
      </section>

      <section id="design-columns" className="scroll-mt-16">
        <RenderCvSection title="Columns">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Line Spacing" density="compact">
              <RenderCvDimensionInput
                value={settings.design.typography?.line_spacing}
                onChange={(value) => updateDesign(['typography', 'line_spacing'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Alignment" density="compact">
              <RenderCvSelect
                value={settings.design.typography?.alignment}
                options={RENDER_ALIGNMENT_OPTIONS}
                onChange={(value) => updateDesign(['typography', 'alignment'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Date Align" density="compact">
              <RenderCvSelect
                value={settings.design.typography?.date_and_location_column_alignment}
                options={RENDER_DATE_ALIGNMENT_OPTIONS}
                onChange={(value) =>
                  updateDesign(['typography', 'date_and_location_column_alignment'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Date Width" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.date_and_location_width}
                onChange={(value) => updateDesign(['entries', 'date_and_location_width'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Side Space" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.side_space}
                onChange={(value) => updateDesign(['entries', 'side_space'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Column Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.entries?.space_between_columns}
                onChange={(value) => updateDesign(['entries', 'space_between_columns'], value)}
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>

      <section id="design-header" className="scroll-mt-16">
        <RenderCvSection title="Header">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Alignment" density="compact">
              <RenderCvSelect
                value={settings.design.header?.alignment}
                options={RENDER_DATE_ALIGNMENT_OPTIONS}
                onChange={(value) => updateDesign(['header', 'alignment'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Width" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_width}
                onChange={(value) => updateDesign(['header', 'photo_width'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Position" density="compact">
              <RenderCvSelect
                value={settings.design.header?.photo_position}
                options={RENDER_PHOTO_POSITION_OPTIONS}
                onChange={(value) => updateDesign(['header', 'photo_position'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Left" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_space_left}
                onChange={(value) => updateDesign(['header', 'photo_space_left'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Photo Right" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.photo_space_right}
                onChange={(value) => updateDesign(['header', 'photo_space_right'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Below Name" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_name}
                onChange={(value) => updateDesign(['header', 'space_below_name'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Below Headline" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_headline}
                onChange={(value) => updateDesign(['header', 'space_below_headline'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Below Connections" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.space_below_connections}
                onChange={(value) => updateDesign(['header', 'space_below_connections'], value)}
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>

      <section id="design-connections" className="scroll-mt-16">
        <RenderCvSection title="Connections">
          <div className="grid md:grid-cols-2">
            <RenderCvRow label="Phone Format" density="compact">
              <RenderCvSelect
                value={settings.design.header?.connections?.phone_number_format}
                options={RENDER_PHONE_NUMBER_FORMAT_OPTIONS}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'phone_number_format'], value)
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Separator" density="compact" description="Between contact items">
              <RenderCvSelect
                value={separator}
                options={separatorOptions}
                onChange={(value) => updateDesign(['header', 'connections', 'separator'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Hyperlink" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.header?.connections?.hyperlink}
                onChange={(value) => updateDesign(['header', 'connections', 'hyperlink'], value)}
              />
            </RenderCvRow>
            <RenderCvRow label="Show Icons" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.header?.connections?.show_icons}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'show_icons'], value, (profile) => {
                    profile.show_contact_icons = value;
                  })
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Display URLs" density="compact">
              <RenderCvToggle
                compact
                checked={settings.design.header?.connections?.display_urls_instead_of_usernames}
                onChange={(value) =>
                  updateDesign(
                    ['header', 'connections', 'display_urls_instead_of_usernames'],
                    value
                  )
                }
              />
            </RenderCvRow>
            <RenderCvRow label="Connection Gap" density="compact">
              <RenderCvDimensionInput
                value={settings.design.header?.connections?.space_between_connections}
                onChange={(value) =>
                  updateDesign(['header', 'connections', 'space_between_connections'], value)
                }
              />
            </RenderCvRow>
          </div>
        </RenderCvSection>
      </section>
    </div>
  );
}
