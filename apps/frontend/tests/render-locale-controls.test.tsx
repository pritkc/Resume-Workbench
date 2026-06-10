import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RenderLocaleControls } from '@/components/rendercv/render-locale-controls';
import { DEFAULT_RENDER_THEME_SETTINGS } from '@/lib/types/render-theme';

describe('RenderLocaleControls', () => {
  it('updates language selection', () => {
    const onChange = vi.fn();
    render(<RenderLocaleControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={onChange} />);

    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'spanish' } });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next?.locale?.language).toBe('spanish');
  });

  it('round-trips month names as comma-separated input', () => {
    const onChange = vi.fn();
    render(<RenderLocaleControls settings={DEFAULT_RENDER_THEME_SETTINGS} onChange={onChange} />);

    const fullNamesInput = screen.getAllByRole('textbox').at(-1);
    expect(fullNamesInput).toBeTruthy();
    fireEvent.change(fullNamesInput!, {
      target: { value: 'Jan, Feb, Mar' },
    });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)?.[0];
    expect(next?.locale?.month_names).toEqual(['Jan', 'Feb', 'Mar']);
  });
});
