import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RenderPreviewPanel } from '@/components/rendercv/render-preview-panel';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
} from '@/lib/types/render-theme';

const fetchResumeRenderPreview = vi.fn();
const fetchDraftRenderPreview = vi.fn();

vi.mock('@/lib/api/resume', () => ({
  fetchResumeRenderPreview: (...args: unknown[]) => fetchResumeRenderPreview(...args),
  fetchDraftRenderPreview: (...args: unknown[]) => fetchDraftRenderPreview(...args),
}));

const baseSettings: RenderThemeSettings = {
  ...DEFAULT_RENDER_THEME_SETTINGS,
};

describe('RenderPreviewPanel', () => {
  beforeEach(() => {
    fetchResumeRenderPreview.mockReset();
    fetchDraftRenderPreview.mockReset();
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
    fetchDraftRenderPreview.mockResolvedValue({
      resume_id: 'draft',
      theme_settings: baseSettings,
      artifacts: [
        {
          artifact_id: 'artifact-preview',
          kind: 'resume_preview_png',
          mime_type: 'image/png',
          file_name: 'preview.png',
          url: '/api/v1/artifacts/artifact-preview',
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
      ...normalizeRenderThemeSettings({
        theme_id: 'moderncv',
        theme_profiles: {
          moderncv: {
            density_profile: 'compact',
            accent_color: 'green',
          },
        },
      }),
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

  it('renders preview from an unsaved draft payload', async () => {
    const draftRequest = {
      processed_resume: {
        personalInfo: {
          name: 'Draft User',
        },
        summary: 'Draft summary',
      },
      theme_settings: baseSettings,
    };

    render(<RenderPreviewPanel settings={baseSettings} draftRequest={draftRequest} />);

    await waitFor(() => expect(fetchDraftRenderPreview).toHaveBeenCalledWith(draftRequest));
    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();
  });

  it('keeps a single compact preview header when artifacts load', async () => {
    render(<RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />);

    await screen.findByAltText('preview.png');

    expect(screen.getAllByText('Preview')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Refresh preview' })).toBeInTheDocument();
  });

  it('opens large browser preview modal instead of navigating to raw PNG', async () => {
    render(<RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />);

    const openPreviewButton = await screen.findByRole('button', {
      name: 'Open large preview for preview.png',
    });
    fireEvent.click(openPreviewButton);

    expect(await screen.findByText('Large Preview')).toBeInTheDocument();
    expect(screen.getByAltText('preview.png large preview')).toBeInTheDocument();
  });
});
