'use client';

import {
  TEMPLATE_HINTS,
  resetActiveRenderThemeProfile,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvCollapsibleSection,
  RenderCvInput,
  RenderCvRow,
  RenderCvTextarea,
} from './rendercv-controls-shared';
import { createDesignUpdaters } from './render-theme-controls-utils';

interface RenderThemeAdvancedPanelProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

export function RenderThemeAdvancedPanel({ settings, onChange }: RenderThemeAdvancedPanelProps) {
  const { updateDesign } = createDesignUpdaters({ settings, onChange });

  return (
    <div className="space-y-2 pb-4">
      <RenderCvCollapsibleSection
        title="Date & Time Strings"
        defaultOpen
        hint="Footer, top note, and date formatting templates"
      >
        <RenderCvRow label="Footer" density="compact" fieldHint={TEMPLATE_HINTS.footer}>
          <RenderCvInput
            value={settings.design.templates?.footer}
            onChange={(value) => updateDesign(['templates', 'footer'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Top Note" density="compact" fieldHint={TEMPLATE_HINTS.top_note}>
          <RenderCvInput
            value={settings.design.templates?.top_note}
            onChange={(value) => updateDesign(['templates', 'top_note'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Single Date" density="compact" fieldHint={TEMPLATE_HINTS.single_date}>
          <RenderCvInput
            value={settings.design.templates?.single_date}
            onChange={(value) => updateDesign(['templates', 'single_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Date Range" density="compact" fieldHint={TEMPLATE_HINTS.date_range}>
          <RenderCvInput
            value={settings.design.templates?.date_range}
            onChange={(value) => updateDesign(['templates', 'date_range'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Time Span" density="compact" fieldHint={TEMPLATE_HINTS.time_span}>
          <RenderCvInput
            value={settings.design.templates?.time_span}
            onChange={(value) => updateDesign(['templates', 'time_span'], value)}
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <RenderCvCollapsibleSection
        title="One-Line Entry"
        defaultOpen
        hint={TEMPLATE_HINTS.one_line_entry}
      >
        <RenderCvRow
          label="Main Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.one_line_entry}
        >
          <RenderCvTextarea
            className="min-h-24"
            rows={4}
            value={settings.design.templates?.one_line_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'one_line_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <RenderCvCollapsibleSection
        title="Education Entry"
        defaultOpen
        hint={TEMPLATE_HINTS.education_entry}
      >
        <RenderCvRow
          label="Main Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.education_entry}
        >
          <RenderCvTextarea
            className="min-h-24"
            rows={4}
            value={settings.design.templates?.education_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow
          label="Degree Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.education_entry}
        >
          <RenderCvInput
            value={settings.design.templates?.education_entry?.degree_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'degree_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow
          label="Date Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.education_entry}
        >
          <RenderCvInput
            value={settings.design.templates?.education_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'education_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <RenderCvCollapsibleSection
        title="Project / Normal Entry"
        defaultOpen
        hint={TEMPLATE_HINTS.normal_entry}
      >
        <RenderCvRow label="Main Column" density="compact" fieldHint={TEMPLATE_HINTS.normal_entry}>
          <RenderCvTextarea
            className="min-h-24"
            rows={4}
            value={settings.design.templates?.normal_entry?.main_column}
            onChange={(value) => updateDesign(['templates', 'normal_entry', 'main_column'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Date Column" density="compact" fieldHint={TEMPLATE_HINTS.normal_entry}>
          <RenderCvInput
            value={settings.design.templates?.normal_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'normal_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <RenderCvCollapsibleSection
        title="Experience Entry"
        defaultOpen
        hint={TEMPLATE_HINTS.experience_entry}
      >
        <RenderCvRow
          label="Main Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.experience_entry}
        >
          <RenderCvTextarea
            className="min-h-24"
            rows={4}
            value={settings.design.templates?.experience_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'experience_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow
          label="Date Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.experience_entry}
        >
          <RenderCvInput
            value={settings.design.templates?.experience_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'experience_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <RenderCvCollapsibleSection
        title="Publication Entry"
        defaultOpen
        hint={TEMPLATE_HINTS.publication_entry}
      >
        <RenderCvRow
          label="Main Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.publication_entry}
        >
          <RenderCvTextarea
            className="min-h-24"
            rows={4}
            value={settings.design.templates?.publication_entry?.main_column}
            onChange={(value) =>
              updateDesign(['templates', 'publication_entry', 'main_column'], value)
            }
          />
        </RenderCvRow>
        <RenderCvRow
          label="Date Column"
          density="compact"
          fieldHint={TEMPLATE_HINTS.publication_entry}
        >
          <RenderCvInput
            value={settings.design.templates?.publication_entry?.date_and_location_column}
            onChange={(value) =>
              updateDesign(['templates', 'publication_entry', 'date_and_location_column'], value)
            }
          />
        </RenderCvRow>
      </RenderCvCollapsibleSection>

      <div className="flex justify-end border border-border bg-card px-2 py-1.5">
        <button
          type="button"
          onClick={() => onChange(resetActiveRenderThemeProfile(settings))}
          className="font-sans text-[11px] text-muted-foreground hover:text-red-600 hover:underline"
        >
          Reset theme defaults
        </button>
      </div>
    </div>
  );
}
