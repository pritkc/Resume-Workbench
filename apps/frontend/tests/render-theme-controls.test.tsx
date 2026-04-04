import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RenderThemeControls } from '@/components/rendercv/render-theme-controls';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  TEMPLATE_HINTS,
} from '@/lib/types/render-theme';

describe('RenderThemeControls', () => {
  it('renders the quick-pick controls and helper hints from the RenderCV reference UI', () => {
    render(
      <RenderThemeControls
        settings={DEFAULT_RENDER_THEME_SETTINGS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getAllByRole('button', { name: 'in' }).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Supports hex, rgb(...), hsl(...), and named colors.').length)
      .toBeGreaterThan(0);
    expect(screen.getAllByText('XCharter').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '•' }).length).toBeGreaterThan(0);
    expect(screen.getByText(TEMPLATE_HINTS.footer)).toBeInTheDocument();
  });
});
