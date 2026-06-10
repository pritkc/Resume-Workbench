import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  RenderCvAutocompleteInput,
  RenderCvDimensionInput,
} from '@/components/rendercv/rendercv-controls-shared';

describe('RenderCV shared controls', () => {
  it('keeps dimension values and unit picks in sync', () => {
    const onChange = vi.fn();

    render(<RenderCvDimensionInput value="0.2in" onChange={onChange} />);

    expect(screen.getByDisplayValue('0.2')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cm' } });

    expect(onChange).toHaveBeenCalledWith('0.2cm');
  });

  it('shows suggested options and applies the clicked value', () => {
    const onChange = vi.fn();

    render(
      <RenderCvAutocompleteInput
        value=""
        onChange={onChange}
        options={['XCharter', 'Roboto']}
        placeholder="Choose a font"
      />
    );

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Roboto' } });

    expect(onChange).toHaveBeenCalledWith('Roboto');
  });
});
