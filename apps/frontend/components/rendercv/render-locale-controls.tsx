'use client';

import { useState } from 'react';
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
  RenderCvQuickNav,
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

type LocaleGroupId = 'basics' | 'phrases' | 'months';

const LOCALE_GROUPS: Array<{ id: LocaleGroupId; label: string }> = [
  { id: 'basics', label: 'Basics' },
  { id: 'phrases', label: 'Phrases' },
  { id: 'months', label: 'Months' },
];

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function RenderLocaleControls({ settings, onChange }: RenderLocaleControlsProps) {
  const [activeGroup, setActiveGroup] = useState<LocaleGroupId>('basics');

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
      <div className="flex flex-col gap-2 border border-black/15 bg-white px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-900">Locale</p>
          <p className="mt-0.5 text-[13px] text-gray-600">Renderer labels and month names.</p>
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
          size="xs"
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" />
          Reset Locale
        </Button>
      </div>

      <RenderCvQuickNav
        items={LOCALE_GROUPS}
        activeId={activeGroup}
        onChange={(id) => setActiveGroup(id as LocaleGroupId)}
      />

      {activeGroup === 'basics' ? (
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
      ) : null}

      {activeGroup === 'phrases' ? (
        <RenderCvSection title="Phrases">
          <RenderCvRow label="Degree with Area">
            <RenderCvInput
              value={settings.locale.phrases?.degree_with_area}
              onChange={(value) => updateLocale(['phrases', 'degree_with_area'], value)}
            />
          </RenderCvRow>
        </RenderCvSection>
      ) : null}

      {activeGroup === 'months' ? (
        <div className="space-y-3">
          <RenderCvSection title="Month Abbreviations">
            <RenderCvRow label="Abbreviations" description="Comma-separated values.">
              <RenderCvInput
                value={arrayToText(settings.locale.month_abbreviations)}
                onChange={(value) => updateLocale(['month_abbreviations'], textToArray(value))}
              />
            </RenderCvRow>
          </RenderCvSection>
          <RenderCvSection title="Month Names">
            <RenderCvRow label="Names" description="Comma-separated values.">
              <RenderCvInput
                value={arrayToText(settings.locale.month_names)}
                onChange={(value) => updateLocale(['month_names'], textToArray(value))}
              />
            </RenderCvRow>
          </RenderCvSection>
        </div>
      ) : null}
    </div>
  );
}
