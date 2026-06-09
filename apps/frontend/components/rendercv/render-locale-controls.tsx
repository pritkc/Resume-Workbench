'use client';

import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_LANGUAGE_OPTIONS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import {
  RenderCvInput,
  RenderCvPanelHeader,
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
      <RenderCvPanelHeader
        label="Locale"
        onReset={() =>
          onChange(
            normalizeRenderThemeSettings({
              ...settings,
              locale: clone(DEFAULT_RENDER_THEME_SETTINGS.locale),
            })
          )
        }
      />

      <RenderCvSection title="Language">
        <RenderCvRow label="Language" density="compact">
          <RenderCvSelect
            value={settings.locale.language}
            options={RENDER_LANGUAGE_OPTIONS}
            onChange={(value) => updateLocale(['language'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Labels">
        <div className="grid md:grid-cols-2">
          <RenderCvRow label="Last Updated" density="compact">
            <RenderCvInput
              value={settings.locale.last_updated}
              onChange={(value) => updateLocale(['last_updated'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Present" density="compact">
            <RenderCvInput
              value={settings.locale.present}
              onChange={(value) => updateLocale(['present'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Month" density="compact">
            <RenderCvInput
              value={settings.locale.month}
              onChange={(value) => updateLocale(['month'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Months" density="compact">
            <RenderCvInput
              value={settings.locale.months}
              onChange={(value) => updateLocale(['months'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Year" density="compact">
            <RenderCvInput
              value={settings.locale.year}
              onChange={(value) => updateLocale(['year'], value)}
            />
          </RenderCvRow>
          <RenderCvRow label="Years" density="compact">
            <RenderCvInput
              value={settings.locale.years}
              onChange={(value) => updateLocale(['years'], value)}
            />
          </RenderCvRow>
        </div>
        <RenderCvRow label="Degree w/ Area" density="compact">
          <RenderCvInput
            value={settings.locale.phrases?.degree_with_area}
            onChange={(value) => updateLocale(['phrases', 'degree_with_area'], value)}
          />
        </RenderCvRow>
      </RenderCvSection>

      <RenderCvSection title="Date Names">
        <div className="grid md:grid-cols-2">
          <RenderCvRow
            label="Abbreviations"
            density="compact"
            description="Comma-separated month abbreviations"
          >
            <RenderCvInput
              value={arrayToText(settings.locale.month_abbreviations)}
              onChange={(value) => updateLocale(['month_abbreviations'], textToArray(value))}
            />
          </RenderCvRow>
          <RenderCvRow
            label="Full Names"
            density="compact"
            description="Comma-separated full month names"
          >
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
