import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CvMetadataPanel } from '@/components/builder/cv-metadata-panel';
import { DEFAULT_METADATA_YAML } from '@/lib/cv-metadata';
import { DEFAULT_RENDER_THEME_SETTINGS } from '@/lib/types/render-theme';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        'builder.metadata.panelTitle': 'Metadata',
        'builder.metadata.hint': 'Job targeting fields',
        'builder.metadata.role': 'Role',
        'builder.metadata.company': 'Company',
        'builder.metadata.location': 'Location',
      };
      return labels[key] ?? key;
    },
  }),
}));

describe('CvMetadataPanel', () => {
  it('renders role, company, and location only', () => {
    render(
      <CvMetadataPanel
        metadataYaml={DEFAULT_METADATA_YAML}
        themeSettings={DEFAULT_RENDER_THEME_SETTINGS}
        onChange={vi.fn()}
      />
    );

    expect(screen.getByText('Role')).toBeInTheDocument();
    expect(screen.getByText('Company')).toBeInTheDocument();
    expect(screen.getByText('Location')).toBeInTheDocument();
    expect(screen.queryByText(/bold keyword/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/keyword/i)).not.toBeInTheDocument();
  });

  it('updates role field', () => {
    const onChange = vi.fn();
    render(
      <CvMetadataPanel
        metadataYaml={DEFAULT_METADATA_YAML}
        themeSettings={DEFAULT_RENDER_THEME_SETTINGS}
        onChange={onChange}
      />
    );

    const roleInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(roleInput, { target: { value: 'SRE' } });

    expect(onChange).toHaveBeenCalled();
    expect(onChange.mock.calls.at(-1)?.[0].metadataYaml).toContain('role: SRE');
  });
});
