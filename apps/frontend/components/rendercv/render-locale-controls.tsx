'use client';

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
    <div className="space-y-2">
      <div className="flex h-7 items-center justify-between gap-2 border border-border bg-card px-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Locale</span>
        <button
          type="button"
          onClick={() =>
            onChange(
              normalizeRenderThemeSettings({
                ...settings,
                locale: clone(DEFAULT_RENDER_THEME_SETTINGS.locale),
              })
            )
          }
          className="font-mono text-[11px] uppercase tracking-wider text-red-600 hover:underline"
        >
          Reset
        </button>
      </div>

      <RenderCvSection title="Basics">
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
        <div className="grid border-b border-border md:grid-cols-2">
          <RenderCvRow label="Month" density="compact">
            <RenderCvInput value={settings.locale.month} onChange={(value) => updateLocale(['month'], value)} />
          </RenderCvRow>
          <RenderCvRow label="Months" density="compact">
            <RenderCvInput
              value={settings.locale.months}
              onChange={(value) => updateLocale(['months'], value)}
            />
          </RenderCvRow>
        </div>
        <div className="grid border-b border-border md:grid-cols-2">
          <RenderCvRow label="Year" density="compact">
            <RenderCvInput value={settings.locale.year} onChange={(value) => updateLocale(['year'], value)} />
          </RenderCvRow>
          <RenderCvRow label="Years" density="compact">
            <RenderCvInput
              value={settings.locale.years}
              onChange={(value) => updateLocale(['years'], value)}
            />
          </RenderCvRow>
        </div>
      </RenderCvSection>

      <RenderCvSection title="Phrases">
        <RenderCvRow label="Degree with Area">
          <RenderCvInput
            value={settings.locale.phrases?.degree_with_area}
            onChange={(value) => updateLocale(['phrases', 'degree_with_area'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Date names">
        <div className="grid border-b border-border md:grid-cols-2">
          <RenderCvRow
            label="Abbreviations"
            description="Comma-separated month abbreviations."
            density="compact"
          >
            <RenderCvInput
              value={arrayToText(settings.locale.month_abbreviations)}
              onChange={(value) => updateLocale(['month_abbreviations'], textToArray(value))}
            />
          </RenderCvRow>
          <RenderCvRow label="Full names" description="Comma-separated full month names." density="compact">
            <RenderCvInput
              value={arrayToText(settings.locale.month_names)}
              onChange={(value) => updateLocale(['month_names'], textToArray(value))}
            />
          </RenderCvRow>
        </div>
      </RenderCvSection>
    </div>
  );
}
