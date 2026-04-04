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
    <div className="space-y-4">
      <div className="flex items-center justify-between border border-black bg-white px-4 py-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Settings</p>
          <p className="mt-1 text-sm text-gray-600">
            Runtime options like current date, keyword bolding, and PDF metadata.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            onChange(
              normalizeRenderThemeSettings({
                ...settings,
                settings: clone(DEFAULT_RENDER_THEME_SETTINGS.settings),
              })
            )
          }
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Settings
        </Button>
      </div>

      <RenderCvSection title="General">
        <RenderCvRow label="Current Date" description="Use `today` or an ISO date like 2026-04-03.">
          <RenderCvInput
            value={settings.settings.current_date}
            onChange={(value) => updateRuntimeSetting(['current_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow
          label="Bold Keywords"
          description="Comma-separated list of keywords RenderCV should bold automatically."
        >
          <RenderCvInput
            value={arrayToText(settings.settings.bold_keywords)}
            onChange={(value) => updateRuntimeSetting(['bold_keywords'], textToArray(value))}
          />
        </RenderCvRow>
        <RenderCvRow
          label="PDF Title"
          description="Supports placeholders like NAME, CURRENT_DATE, MONTH_NAME, and YEAR."
        >
          <RenderCvInput
            value={settings.settings.pdf_title}
            onChange={(value) => updateRuntimeSetting(['pdf_title'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>
    </div>
  );
}
