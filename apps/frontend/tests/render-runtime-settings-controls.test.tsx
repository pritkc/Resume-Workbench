import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { RenderRuntimeSettingsControls } from '@/components/rendercv/render-runtime-settings-controls';
import { DEFAULT_RENDER_THEME_SETTINGS } from '@/lib/types/render-theme';

describe('RenderRuntimeSettingsControls', () => {
  it('toggles summary heading runtime setting', () => {
    const onChange = vi.fn();

    render(
      <RenderRuntimeSettingsControls
        settings={DEFAULT_RENDER_THEME_SETTINGS}
        onChange={onChange}
      />
    );

    const headingToggle = screen.getByRole('checkbox');

    fireEvent.click(headingToggle);

    expect(onChange).toHaveBeenCalled();
    const afterHeadingToggle = onChange.mock.calls.at(-1)?.[0];
    expect(afterHeadingToggle?.settings?.show_summary_heading).toBe(true);
  });
});
