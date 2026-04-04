import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { RenderPreviewPanel } from '@/components/rendercv/render-preview-panel';
import type { RenderThemeSettings } from '@/lib/types/render-theme';

const fetchResumeRenderPreview = vi.fn();

vi.mock('@/lib/api/resume', () => ({
  fetchResumeRenderPreview: (...args: unknown[]) => fetchResumeRenderPreview(...args),
}));

const baseSettings: RenderThemeSettings = {
  theme_id: 'classic',
  page_size: 'A4',
  density_profile: 'balanced',
  bold_keywords: false,
  accent_color: 'blue',
  show_contact_icons: false,
  margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
};

describe('RenderPreviewPanel', () => {
  beforeEach(() => {
    fetchResumeRenderPreview.mockReset();
    fetchResumeRenderPreview.mockResolvedValue({
      resume_id: 'resume-123',
      theme_settings: baseSettings,
      artifacts: [
        {
          artifact_id: 'artifact-preview',
          kind: 'resume_preview_png',
          mime_type: 'image/png',
          file_name: 'preview.png',
          url: '/api/v1/artifacts/artifact-preview',
        },
        {
          artifact_id: 'artifact-pdf',
          kind: 'resume_pdf',
          mime_type: 'application/pdf',
          file_name: 'resume.pdf',
          url: '/api/v1/artifacts/artifact-pdf',
        },
      ],
      preview_artifacts: [],
      pdf_artifact: null,
    });
  });

  it('loads preview artifacts and refreshes when theme settings change', async () => {
    const { rerender } = render(
      <RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />
    );

    await waitFor(() =>
      expect(fetchResumeRenderPreview).toHaveBeenCalledWith('resume-123', baseSettings)
    );
    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();

    const updatedSettings: RenderThemeSettings = {
      ...baseSettings,
      theme_id: 'moderncv',
      density_profile: 'compact',
      accent_color: 'green',
    };

    rerender(<RenderPreviewPanel resumeId="resume-123" settings={updatedSettings} />);

    await waitFor(() =>
      expect(fetchResumeRenderPreview).toHaveBeenLastCalledWith('resume-123', updatedSettings)
    );
  });

  it('keeps fetched artifacts visible when no initial artifacts are provided', async () => {
    const { rerender } = render(
      <RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />
    );

    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();

    rerender(<RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />);

    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();
  });
});
