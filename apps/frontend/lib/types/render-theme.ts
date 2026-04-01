export type RenderThemeId = 'classic' | 'moderncv';
export type RenderPageSize = 'A4' | 'LETTER';
export type RenderDensityProfile = 'compact' | 'balanced' | 'spacious';
export type RenderAccentColor = 'blue' | 'green' | 'orange' | 'red';

export interface RenderThemeSettings {
  theme_id: RenderThemeId;
  page_size: RenderPageSize;
  density_profile: RenderDensityProfile;
  bold_keywords: boolean;
  accent_color: RenderAccentColor;
  show_contact_icons: boolean;
  margins_mm: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface ArtifactSummary {
  artifact_id: string;
  kind: string;
  mime_type: string;
  file_name: string;
  url?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface RenderPreviewResponse {
  resume_id: string;
  theme_settings: RenderThemeSettings;
  artifacts: ArtifactSummary[];
  preview_artifacts: ArtifactSummary[];
  pdf_artifact?: ArtifactSummary | null;
}

export const DEFAULT_RENDER_THEME_SETTINGS: RenderThemeSettings = {
  theme_id: 'classic',
  page_size: 'A4',
  density_profile: 'balanced',
  bold_keywords: false,
  accent_color: 'blue',
  show_contact_icons: false,
  margins_mm: {
    top: 10,
    bottom: 10,
    left: 10,
    right: 10,
  },
};

export const RENDER_THEME_OPTIONS: Array<{
  id: RenderThemeId;
  label: string;
  description: string;
}> = [
  {
    id: 'classic',
    label: 'Classic',
    description: 'ATS-first single-column layout',
  },
  {
    id: 'moderncv',
    label: 'ModernCV',
    description: 'Sharper visual hierarchy with RenderCV styling',
  },
];

export const RENDER_DENSITY_OPTIONS: Array<{
  id: RenderDensityProfile;
  label: string;
}> = [
  { id: 'compact', label: 'Compact' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'spacious', label: 'Spacious' },
];

export const RENDER_ACCENT_OPTIONS: RenderAccentColor[] = ['blue', 'green', 'orange', 'red'];

const densityToLegacyQuery: Record<
  RenderDensityProfile,
  {
    compactMode: boolean;
    sectionSpacing: number;
    itemSpacing: number;
    lineHeight: number;
  }
> = {
  compact: {
    compactMode: true,
    sectionSpacing: 1,
    itemSpacing: 1,
    lineHeight: 1,
  },
  balanced: {
    compactMode: false,
    sectionSpacing: 3,
    itemSpacing: 2,
    lineHeight: 3,
  },
  spacious: {
    compactMode: false,
    sectionSpacing: 4,
    itemSpacing: 4,
    lineHeight: 4,
  },
};

export function normalizeRenderThemeSettings(
  value?: Partial<RenderThemeSettings> | null
): RenderThemeSettings {
  return {
    ...DEFAULT_RENDER_THEME_SETTINGS,
    ...value,
    margins_mm: {
      ...DEFAULT_RENDER_THEME_SETTINGS.margins_mm,
      ...(value?.margins_mm ?? {}),
    },
  };
}

export function renderThemeSettingsToQuery(settings?: RenderThemeSettings): URLSearchParams {
  const resolved = normalizeRenderThemeSettings(settings);
  const density = densityToLegacyQuery[resolved.density_profile];
  const params = new URLSearchParams();
  params.set('template', resolved.theme_id === 'moderncv' ? 'modern' : 'swiss-single');
  params.set('pageSize', resolved.page_size);
  params.set('compactMode', String(density.compactMode));
  params.set('sectionSpacing', String(density.sectionSpacing));
  params.set('itemSpacing', String(density.itemSpacing));
  params.set('lineHeight', String(density.lineHeight));
  params.set('accentColor', resolved.accent_color);
  params.set('showContactIcons', String(resolved.show_contact_icons));
  params.set('marginTop', String(resolved.margins_mm.top));
  params.set('marginBottom', String(resolved.margins_mm.bottom));
  params.set('marginLeft', String(resolved.margins_mm.left));
  params.set('marginRight', String(resolved.margins_mm.right));
  return params;
}
