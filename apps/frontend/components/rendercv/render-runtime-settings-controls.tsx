'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvInput,
  RenderCvRow,
  RenderCvSection,
  RenderCvToggle,
  arrayToText,
  textToArray,
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

  return (
    <div className="space-y-2">
      <div
        className="flex flex-col gap-1 border border-border bg-card px-2 py-1.5 sm:flex-row sm:items-center sm:justify-between"
        title="PDF title, date format, and defaults for the RenderCV output."
      >
        <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Runtime
        </p>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          onClick={() =>
            onChange(
              normalizeRenderThemeSettings({
                ...settings,
                settings: clone(DEFAULT_RENDER_THEME_SETTINGS.settings),
              })
            )
          }
          className="h-7 gap-1 px-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground underline decoration-black/25 underline-offset-2 hover:bg-transparent hover:text-foreground"
          title="Restore all runtime settings to defaults."
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </Button>
      </div>

      <RenderCvSection title="General">
        <RenderCvRow
          label="Show Summary Heading"
          description="When section is enabled, hide the heading to save space."
          density="compact"
        >
          <RenderCvToggle
            checked={Boolean(settings.settings.show_summary_heading)}
            onChange={(value) => updateRuntimeSetting(['show_summary_heading'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Current Date" description="Use `today` or an ISO date." density="compact">
          <RenderCvInput
            value={settings.settings.current_date}
            onChange={(value) => updateRuntimeSetting(['current_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Bold Keywords" description="Comma-separated list." density="compact">
          <RenderCvInput
            value={arrayToText(settings.settings.bold_keywords)}
            onChange={(value) => updateRuntimeSetting(['bold_keywords'], textToArray(value))}
          />
        </RenderCvRow>
        <RenderCvRow label="PDF Title" description="Supports RenderCV placeholders." density="compact">
          <RenderCvInput
            value={settings.settings.pdf_title}
            onChange={(value) => updateRuntimeSetting(['pdf_title'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>
    </div>
  );
}
