'use client';

import type { ReactNode } from 'react';
import {
  RENDER_THEME_OPTIONS,
  switchActiveRenderTheme,
  type RenderThemeId,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';
import { RenderCvSelect } from './rendercv-controls-shared';
import { RenderThemeAdvancedPanel } from './render-theme-advanced-panel';
import { RenderThemeLayoutPanel } from './render-theme-layout-panel';
import { RenderThemeStylePanel } from './render-theme-style-panel';

interface RenderThemeControlsProps {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
}

function DesignGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-b border-border bg-card last:border-b-0">
      <div className="sticky top-[34px] z-10 flex h-6 items-center border-b border-border bg-muted/70 px-2 backdrop-blur-sm">
        <p className="font-sans text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/80">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

export function RenderThemeControls({ settings, onChange }: RenderThemeControlsProps) {
  return (
    <div className="space-y-0">
      {/* Theme selector — compact inline row */}
      <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <span className="shrink-0 font-sans text-[11px] text-muted-foreground">Theme</span>
        <div className="min-w-0 flex-1">
          <RenderCvSelect
            value={settings.theme_id}
            options={RENDER_THEME_OPTIONS}
            onChange={(value) =>
              onChange(switchActiveRenderTheme(settings, value as RenderThemeId))
            }
          />
        </div>
      </div>

      <DesignGroup title="Layout">
        <RenderThemeLayoutPanel settings={settings} onChange={onChange} />
      </DesignGroup>
      <DesignGroup title="Style">
        <RenderThemeStylePanel settings={settings} onChange={onChange} />
      </DesignGroup>
      <DesignGroup title="Advanced">
        <RenderThemeAdvancedPanel settings={settings} onChange={onChange} />
      </DesignGroup>
    </div>
  );
}
