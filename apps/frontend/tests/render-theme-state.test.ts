import { describe, expect, it } from 'vitest';
import {
  normalizeRenderThemeSettings,
  resetActiveRenderThemeProfile,
  serializeRenderThemeSettings,
  switchActiveRenderTheme,
  updateActiveRenderTheme,
} from '@/lib/types/render-theme';

describe('render theme state helpers', () => {
  it('restores per-theme design edits when switching between themes', () => {
    const initial = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
    });

    const classicEdited = updateActiveRenderTheme(initial, ({ design }) => {
      design.colors = {
        ...design.colors,
        name: '#123456',
      };
    });

    const harvardSelected = switchActiveRenderTheme(classicEdited, 'harvard');
    const harvardEdited = updateActiveRenderTheme(harvardSelected, ({ design }) => {
      design.page = {
        ...design.page,
        top_margin: '0.55in',
      };
    });

    const backToClassic = switchActiveRenderTheme(harvardEdited, 'classic');
    expect(backToClassic.design.colors?.name).toBe('#123456');

    const backToHarvard = switchActiveRenderTheme(backToClassic, 'harvard');
    expect(backToHarvard.design.page?.top_margin).toBe('0.55in');
  });

  it('resets only the active theme profile and keeps other theme profiles intact', () => {
    const initial = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
    });

    const classicEdited = updateActiveRenderTheme(initial, ({ design }) => {
      design.colors = {
        ...design.colors,
        links: '#0f172a',
      };
    });

    const harvardEdited = updateActiveRenderTheme(
      switchActiveRenderTheme(classicEdited, 'harvard'),
      ({ design }) => {
        design.page = {
          ...design.page,
          show_top_note: true,
        };
      }
    );

    const resetHarvard = resetActiveRenderThemeProfile(harvardEdited);
    expect(resetHarvard.theme_id).toBe('harvard');
    expect(resetHarvard.theme_profiles.harvard).toBeUndefined();
    expect(resetHarvard.design.page?.show_top_note).toBe(false);

    const backToClassic = switchActiveRenderTheme(resetHarvard, 'classic');
    expect(backToClassic.design.colors?.links).toBe('#0f172a');
    expect(backToClassic.theme_profiles.classic).toBeDefined();
  });

  it('keeps locale and runtime settings global when switching themes', () => {
    const settings = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
      locale: {
        language: 'spanish',
        present: 'actualmente',
      },
      settings: {
        current_date: '2026-04-03',
        pdf_title: 'Jane Doe - CV',
      },
    });

    const switched = switchActiveRenderTheme(settings, 'moderncv');

    expect(switched.locale.language).toBe('spanish');
    expect(switched.locale.present).toBe('actualmente');
    expect(switched.settings.current_date).toBe('2026-04-03');
    expect(switched.settings.pdf_title).toBe('Jane Doe - CV');
  });

  it('serializes sparse per-theme overrides instead of the resolved active design', () => {
    const settings = updateActiveRenderTheme(
      normalizeRenderThemeSettings({
        theme_id: 'moderncv',
        theme_profiles: {},
      }),
      ({ design, profile }) => {
        design.colors = {
          ...design.colors,
          name: '#abcdef',
        };
        profile.show_contact_icons = false;
      }
    );

    const serialized = serializeRenderThemeSettings(settings);

    expect(serialized).toMatchObject({
      theme_id: 'moderncv',
      theme_profiles: {
        moderncv: {
          show_contact_icons: false,
          design: {
            colors: {
              name: '#abcdef',
            },
          },
        },
      },
    });
    expect(serialized).not.toHaveProperty('design');
    expect(serialized).not.toHaveProperty('page_size');
  });

  it('defaults summary heading to hidden and preserves explicit heading visibility setting', () => {
    const defaults = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
    });
    expect(defaults.settings.show_summary_heading).toBe(false);

    const explicit = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
      settings: {
        show_summary_heading: true,
      },
    });
    const serialized = serializeRenderThemeSettings(explicit);

    expect(explicit.settings.show_summary_heading).toBe(true);
    expect(serialized.settings).toMatchObject({
      show_summary_heading: true,
    });
  });

  it('serializes resume workbench style runtime settings', () => {
    const settings = normalizeRenderThemeSettings({
      theme_id: 'classic',
      theme_profiles: {},
      settings: {
        resume_workbench_style: {
          colors: {
            company: '#123456',
            role: '#654321',
            stack: '#abcdef',
            date_location: 'rgb(10, 20, 30)',
          },
          typography: {
            letter_spacing: {
              name: '0.4pt',
              section_titles: '0.2pt',
            },
          },
          tech_stack: {
            separator: '|',
            label: 'Stack',
            label_bold: true,
          },
        },
      },
    });

    const serialized = serializeRenderThemeSettings(settings);

    expect(serialized.settings).toMatchObject({
      resume_workbench_style: {
        colors: {
          company: '#123456',
          role: '#654321',
          stack: '#abcdef',
          date_location: 'rgb(10, 20, 30)',
        },
        typography: {
          letter_spacing: {
            name: '0.4pt',
            section_titles: '0.2pt',
          },
        },
        tech_stack: {
          separator: '|',
          label: 'Stack',
          label_bold: true,
        },
      },
    });
  });
});
