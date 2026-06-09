'use client';

import { useState } from 'react';
import {
  RENDER_THEME_OPTIONS,
  switchActiveRenderTheme,
  type RenderThemeId,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import { RenderCvQuickNav, RenderCvSelect } from './rendercv-controls-shared';
import { RenderThemeAdvancedPanel } from './render-theme-advanced-panel';
import { RenderThemeLayoutPanel } from './render-theme-layout-panel';
import { RenderThemeStylePanel } from './render-theme-style-panel';

interface RenderThemeControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

type DesignBucketId = 'layout' | 'style' | 'advanced';

const DESIGN_BUCKETS: Array<{ id: DesignBucketId; label: string }> = [
  { id: 'layout', label: 'Layout' },
  { id: 'style', label: 'Style' },
  { id: 'advanced', label: 'Advanced' },
];

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  const [activeBucket, setActiveBucket] = useState<DesignBucketId>('layout');

  return (
    <div className="space-y-2">
      <div className="flex h-7 items-center gap-3 border border-border bg-card px-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Theme
        </span>
        <div className="min-w-[140px] flex-1">
          <RenderCvSelect
            value={settings.theme_id}
            options={RENDER_THEME_OPTIONS}
            onChange={(value) =>
              onChange(switchActiveRenderTheme(settings, value as RenderThemeId))
            }
          />
        </div>
      </div>

      <RenderCvQuickNav
        items={DESIGN_BUCKETS}
        activeId={activeBucket}
        onChange={(id) => setActiveBucket(id as DesignBucketId)}
      />

      {activeBucket === 'layout' ? (
        <RenderThemeLayoutPanel settings={settings} onChange={onChange} />
      ) : null}
      {activeBucket === 'style' ? (
        <RenderThemeStylePanel settings={settings} onChange={onChange} />
      ) : null}
      {activeBucket === 'advanced' ? (
        <RenderThemeAdvancedPanel settings={settings} onChange={onChange} />
      ) : null}
    </div>
  );
}
