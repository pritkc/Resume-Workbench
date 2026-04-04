'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_LANGUAGE_OPTIONS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvInput,
  RenderCvRow,
  RenderCvSection,
  RenderCvSelect,
  arrayToText,
  textToArray,
} from './rendercv-controls-shared';

interface RenderLocaleControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function RenderLocaleControls({ settings, onChange }: RenderLocaleControlsProps) {
  const updateLocale = (path: string[], value: unknown) => {
    const nextLocale = clone(settings.locale);
    let cursor: Record<string, unknown> = nextLocale as Record<string, unknown>;

    for (const key of path.slice(0, -1)) {
      const nested = cursor[key];
      if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
        cursor[key] = {};
      }
      cursor = cursor[key] as Record<string, unknown>;
    }

    cursor[path[path.length - 1]] = value;
    onChange(normalizeRenderThemeSettings({ ...settings, locale: nextLocale }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border border-black bg-white px-4 py-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Locale</p>
          <p className="mt-1 text-sm text-gray-600">
            Controls date labels, month names, and copy used by the renderer.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            onChange(
              normalizeRenderThemeSettings({
                ...settings,
                locale: clone(DEFAULT_RENDER_THEME_SETTINGS.locale),
              })
            )
          }
          className="gap-2"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Locale
        </Button>
      </div>

      <RenderCvSection title="Locale">
        <RenderCvRow label="Language">
          <RenderCvSelect
            value={settings.locale.language}
            options={RENDER_LANGUAGE_OPTIONS}
            onChange={(value) => updateLocale(['language'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Last Updated">
          <RenderCvInput
            value={settings.locale.last_updated}
            onChange={(value) => updateLocale(['last_updated'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Present">
          <RenderCvInput
            value={settings.locale.present}
            onChange={(value) => updateLocale(['present'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Month">
          <RenderCvInput
            value={settings.locale.month}
            onChange={(value) => updateLocale(['month'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Months">
          <RenderCvInput
            value={settings.locale.months}
            onChange={(value) => updateLocale(['months'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Year">
          <RenderCvInput
            value={settings.locale.year}
            onChange={(value) => updateLocale(['year'], value)}
          />
        </RenderCvRow>
        <RenderCvRow label="Years">
          <RenderCvInput
            value={settings.locale.years}
            onChange={(value) => updateLocale(['years'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Phrases">
        <RenderCvRow label="Degree with Area" description="Template used for degree placeholders.">
          <RenderCvInput
            value={settings.locale.phrases?.degree_with_area}
            onChange={(value) => updateLocale(['phrases', 'degree_with_area'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Month Abbreviations">
        <RenderCvRow
          label="Abbreviations"
          description="Comma-separated list for Jan, Feb, Mar, ..."
        >
          <RenderCvInput
            value={arrayToText(settings.locale.month_abbreviations)}
            onChange={(value) => updateLocale(['month_abbreviations'], textToArray(value))}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Month Names">
        <RenderCvRow label="Names" description="Comma-separated list for January, February, ...">
          <RenderCvInput
            value={arrayToText(settings.locale.month_names)}
            onChange={(value) => updateLocale(['month_names'], textToArray(value))}
          />
        </RenderCvRow>
      </RenderCvSection>
    </div>
  );
}
