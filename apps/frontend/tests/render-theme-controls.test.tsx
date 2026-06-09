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

    expect(screen.getByText('Page')).toBeInTheDocument();
    expect(screen.getByText('Margins')).toBeInTheDocument();
  }, 15_000);

  it('updates workbench entry accent colors from style bucket', () => {
    const onChange = vi.fn();
    render(<RenderThemeControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: 'Style' }));
    expect(screen.getByText('Typography')).toBeInTheDocument();
    expect(screen.getByText(/Entry Accents/)).toBeInTheDocument();
    expect(screen.getByText('Role Title')).toBeInTheDocument();

    const entryAccents = screen.getByText(/Entry Accents/).closest('section');
    expect(entryAccents).not.toBeNull();
    const scoped = within(entryAccents!);

    fireEvent.change(scoped.getAllByPlaceholderText('#rrggbb')[0], {
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

    fireEvent.change(scoped.getAllByPlaceholderText('#rrggbb')[1], {
      target: { value: '#654321' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        settings: expect.objectContaining({
          resume_workbench_style: expect.objectContaining({
            colors: expect.objectContaining({ role: '#654321' }),
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

  it('opens advanced template sections by default', () => {
    render(<RenderThemeControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Advanced' }));
    expect(screen.getByRole('button', { name: /Education Entry/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getByRole('button', { name: /Experience Entry/i })).toHaveAttribute(
      'aria-expanded',
      'true'
    );
    expect(screen.getAllByText(TEMPLATE_HINTS.education_entry).length).toBeGreaterThan(0);
    expect(screen.getAllByText(TEMPLATE_HINTS.experience_entry).length).toBeGreaterThan(0);
  });
});
