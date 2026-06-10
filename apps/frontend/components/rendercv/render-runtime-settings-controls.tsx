'use client';

import {
  DEFAULT_RENDER_THEME_SETTINGS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvBoldKeywordChips,
  RenderCvInput,
  RenderCvPanelHeader,
  RenderCvRow,
  RenderCvSection,
  RenderCvToggle,
} from './rendercv-controls-shared';

interface RenderRuntimeSettingsControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function RenderRuntimeSettingsControls({
  settings,
  onChange,
}: RenderRuntimeSettingsControlsProps) {
  const updateRuntimeSetting = (path: string[], value: unknown) => {
    const nextRuntimeSettings = clone(settings.settings);
    let cursor: Record<string, unknown> = nextRuntimeSettings as Record<string, unknown>;

    for (const key of path.slice(0, -1)) {
      const nested = cursor[key];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }

    cursor[path[path.length - 1]] = value;
    onChange(normalizeRenderThemeSettings({ ...settings, settings: nextRuntimeSettings }));
  };

  const boldKeywords = Array.isArray(settings.settings.bold_keywords)
    ? settings.settings.bold_keywords
    : [];

  return (
    <div className="space-y-2">
      <RenderCvPanelHeader
        label="Runtime"
        onReset={() =>
          onChange(
            normalizeRenderThemeSettings({
              ...settings,
              settings: clone(DEFAULT_RENDER_THEME_SETTINGS.settings),
            })
          )
        }
      />

      <RenderCvSection title="Output">
        <RenderCvRow
          label="Summary Heading"
          density="compact"
          description="When section is enabled, hide the heading to save space"
        >
          <RenderCvToggle
            compact
            checked={Boolean(settings.settings.show_summary_heading)}
            onChange={(value) => updateRuntimeSetting(['show_summary_heading'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Current Date" density="compact" description="Use today or an ISO date">
          <RenderCvInput
            value={settings.settings.current_date}
            onChange={(value) => updateRuntimeSetting(['current_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow
          label="PDF Title"
          density="compact"
          description="Supports RenderCV placeholders"
        >
          <RenderCvInput
            value={settings.settings.pdf_title}
            onChange={(value) => updateRuntimeSetting(['pdf_title'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Bold Keywords">
        <RenderCvBoldKeywordChips
          keywords={boldKeywords}
          onChange={(keywords) => updateRuntimeSetting(['bold_keywords'], keywords)}
          placeholder="Add keyword to bold in PDF"
        />
      </RenderCvSection>
    </div>
  );
}
