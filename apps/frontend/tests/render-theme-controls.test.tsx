import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { RenderThemeControls } from '@/components/rendercv/render-theme-controls';
import { DEFAULT_RENDER_THEME_SETTINGS, TEMPLATE_HINTS } from '@/lib/types/render-theme';

describe('RenderThemeControls', () => {
  it('renders grouped design controls and keeps theme profile retired', () => {
    render(<RenderThemeControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Layout' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Style' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Advanced' })).toBeInTheDocument();
    expect(screen.queryByText('Theme Profile')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    expect(screen.getAllByText('XCharter').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Calibri').length).toBeGreaterThan(0);
    expect(screen.getByText('Field Styling')).toBeInTheDocument();
    expect(
      screen.getAllByTitle('Supports hex, rgb(...), hsl(...), and named colors.').length
    ).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: '•' }).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByText(TEMPLATE_HINTS.footer)).toBeInTheDocument();
  }, 15_000);

  it('updates workbench field styling settings', () => {
    const onChange = vi.fn();
    render(<RenderThemeControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    const fieldStyling = screen.getByText('Field Styling').closest('section');
    expect(fieldStyling).not.toBeNull();
    const scoped = within(fieldStyling!);

    fireEvent.change(scoped.getAllByPlaceholderText('Hex, rgb(...), hsl(...), or named color')[2], {
      target: { value: '#123456' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          resume_workbench_style: expect.objectContaining({
            colors: expect.objectContaining({ company: '#123456' }),
          }),
        }),
      })
    );

    fireEvent.change(scoped.getByRole('combobox'), { target: { value: '|' } });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          resume_workbench_style: expect.objectContaining({
            tech_stack: expect.objectContaining({ separator: '|' }),
          }),
        }),
      })
    );
  });
});
