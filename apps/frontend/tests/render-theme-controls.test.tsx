import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RenderThemeControls } from '@/components/rendercv/render-theme-controls';
import { DEFAULT_RENDER_THEME_SETTINGS, TEMPLATE_HINTS } from '@/lib/types/render-theme';

describe('RenderThemeControls', () => {
  it('renders grouped quick-nav controls and keeps theme profile retired', () => {
    render(<RenderThemeControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Core' })).toBeInTheDocument();
    expect(screen.queryByText('Theme Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Typography' }));
    expect(screen.getAllByText('XCharter').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Colors' }));
    expect(
      screen.getAllByText('Supports hex, rgb(...), hsl(...), and named colors.').length
    ).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Sections & Entries' }));
    expect(screen.getAllByRole('button', { name: '•' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Templates / Advanced' }));
    expect(screen.getByText(TEMPLATE_HINTS.footer)).toBeInTheDocument();
  }, 15_000);
});
