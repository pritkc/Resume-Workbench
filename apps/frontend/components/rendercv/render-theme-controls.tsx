'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  RENDER_ACCENT_OPTIONS,
  RENDER_DENSITY_OPTIONS,
  RENDER_THEME_OPTIONS,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';

interface RenderThemeControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

const marginKeys: Array<keyof RenderThemeSettings['margins_mm']> = [
  'top',
  'bottom',
  'left',
  'right',
];

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const updateSettings = (updates: Partial<RenderThemeSettings>) => {
    onChange({
      ...settings,
      ...updates,
      margins_mm: {
        ...settings.margins_mm,
        ...(updates.margins_mm ?? {}),
      },
    });
  };

  return (
    <div className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)]">
      <button
        onClick={() => setIsExpanded((value) => !value)}
        className="flex w-full items-center justify-between px-4 py-3"
      >
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 bg-blue-700" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            RenderCV Theme
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </button>

      {isExpanded && (
        <div className="space-y-6 border-t border-black p-4">
          <div className="space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
              Theme
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              {RENDER_THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => updateSettings({ theme_id: option.id })}
                  className={`border px-3 py-3 text-left ${
                    settings.theme_id === option.id
                      ? 'border-blue-700 bg-white shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white hover:bg-[#F8F7F1]'
                  }`}
                >
                  <p className="font-mono text-xs font-bold uppercase tracking-wider">
                    {option.label}
                  </p>
                  <p className="mt-1 text-sm text-gray-600">{option.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                Density
              </span>
              <select
                value={settings.density_profile}
                onChange={(event) =>
                  updateSettings({
                    density_profile: event.target.value as RenderThemeSettings['density_profile'],
                  })
                }
                className="w-full border border-black bg-white px-3 py-2 font-mono text-sm"
              >
                {RENDER_DENSITY_OPTIONS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                Page Size
              </span>
              <select
                value={settings.page_size}
                onChange={(event) =>
                  updateSettings({
                    page_size: event.target.value as RenderThemeSettings['page_size'],
                  })
                }
                className="w-full border border-black bg-white px-3 py-2 font-mono text-sm"
              >
                <option value="A4">A4</option>
                <option value="LETTER">US Letter</option>
              </select>
            </label>
          </div>

          <div className="space-y-3">
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
              Accent
            </p>
            <div className="flex flex-wrap gap-2">
              {RENDER_ACCENT_OPTIONS.map((accent) => (
                <button
                  key={accent}
                  onClick={() => updateSettings({ accent_color: accent })}
                  className={`border px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider ${
                    settings.accent_color === accent
                      ? 'border-blue-700 bg-white shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white hover:bg-[#F8F7F1]'
                  }`}
                >
                  {accent}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {marginKeys.map((key) => (
              <label key={key} className="space-y-2">
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                  {key} Margin
                </span>
                <input
                  type="number"
                  min={5}
                  max={25}
                  value={settings.margins_mm[key]}
                  onChange={(event) =>
                    updateSettings({
                      margins_mm: {
                        [key]: Number(event.target.value),
                      } as RenderThemeSettings['margins_mm'],
                    })
                  }
                  className="w-full border border-black bg-white px-3 py-2 font-mono text-sm"
                />
              </label>
            ))}
          </div>

          <div className="space-y-3">
            <label className="flex items-center justify-between border border-black px-3 py-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                Show Contact Icons
              </span>
              <input
                type="checkbox"
                checked={settings.show_contact_icons}
                onChange={(event) =>
                  updateSettings({
                    show_contact_icons: event.target.checked,
                  })
                }
              />
            </label>
            <label className="flex items-center justify-between border border-black px-3 py-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider">
                Bold Keywords
              </span>
              <input
                type="checkbox"
                checked={settings.bold_keywords}
                onChange={(event) =>
                  updateSettings({
                    bold_keywords: event.target.checked,
                  })
                }
              />
            </label>
          </div>

          <Button
            variant="outline"
            onClick={() => onChange(DEFAULT_RENDER_THEME_SETTINGS)}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Theme
          </Button>
        </div>
      )}
    </div>
  );
}
