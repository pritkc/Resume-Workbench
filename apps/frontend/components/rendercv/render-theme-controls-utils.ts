import {
  updateActiveRenderTheme,
  type RenderCvDesign,
  type RenderCvRuntimeSettings,
  type RenderThemeProfileSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';

export function setNestedValue(root: Record<string, unknown>, path: string[], value: unknown) {
  let cursor = root;
  for (const key of path.slice(0, -1)) {
    const nested = cursor[key];
    if (!nested || typeof nested !== 'object' || Array.isArray(nested)) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  cursor[path[path.length - 1]] = value;
}

export function cloneRuntimeStyle(
  settings: RenderThemeSettings
): NonNullable<RenderCvRuntimeSettings['resume_workbench_style']> {
  return structuredClone(settings.settings.resume_workbench_style ?? {});
}

export function dimensionToMm(value: string, fallback: number): number {
  const numeric = Number.parseFloat(value.replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.endsWith('mm')) return Math.round(numeric);
  if (normalized.endsWith('cm')) return Math.round(numeric * 10);
  if (normalized.endsWith('pt')) return Math.round((numeric / 72) * 25.4);
  if (normalized.endsWith('in')) return Math.round(numeric * 25.4);
  return fallback;
}

export type DesignUpdateContext = {
  settings: RenderThemeSettings;
  onChange: (settings: RenderThemeSettings) => void;
};

export function createDesignUpdaters({ settings, onChange }: DesignUpdateContext) {
  const updateDesign = (
    path: string[],
    value: unknown,
    mutateProfile?: (profile: RenderThemeProfileSettings, nextDesign: RenderCvDesign) => void
  ) => {
    onChange(
      updateActiveRenderTheme(settings, ({ design, profile }) => {
        setNestedValue(design as Record<string, unknown>, path, value);
        mutateProfile?.(profile, design);
      })
    );
  };

  const updateWorkbenchStyle = (path: string[], value: unknown) => {
    const nextStyle = cloneRuntimeStyle(settings);
    setNestedValue(nextStyle as Record<string, unknown>, path, value);
    onChange({
      ...settings,
      settings: {
        ...settings.settings,
        resume_workbench_style: nextStyle,
      },
    });
  };

  return { updateDesign, updateWorkbenchStyle };
}
