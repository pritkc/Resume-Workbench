'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvInput,
  RenderCvQuickNav,
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
  const [activeGroup, setActiveGroup] = useState<'general'>('general');

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
    <div className="space-y-3">
      <div className="flex items-center justify-between border border-black bg-white px-3 py-2.5">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Settings</p>
          <p className="mt-1 text-[13px] text-gray-600">
            Keep runtime defaults compact and close to the preview.
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
          size="xs"
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Settings
        </Button>
      </div>

      <RenderCvQuickNav
        items={[{ id: 'general', label: 'General' }]}
        activeId={activeGroup}
        onChange={() => setActiveGroup('general')}
      />

      <RenderCvSection title="General">
        <RenderCvRow
          label="Show Summary Heading"
          description="When section is enabled, hide the heading to save space."
        >
          <RenderCvToggle
            checked={Boolean(settings.settings.show_summary_heading)}
            onChange={(value) => updateRuntimeSetting(['show_summary_heading'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Current Date" description="Use `today` or an ISO date.">
          <RenderCvInput
            value={settings.settings.current_date}
            onChange={(value) => updateRuntimeSetting(['current_date'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Bold Keywords" description="Comma-separated list.">
          <RenderCvInput
            value={arrayToText(settings.settings.bold_keywords)}
            onChange={(value) => updateRuntimeSetting(['bold_keywords'], textToArray(value))}
          />
        </RenderCvRow>
        <RenderCvRow label="PDF Title" description="Supports RenderCV placeholders.">
          <RenderCvInput
            value={settings.settings.pdf_title}
            onChange={(value) => updateRuntimeSetting(['pdf_title'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>
    </div>
  );
}
