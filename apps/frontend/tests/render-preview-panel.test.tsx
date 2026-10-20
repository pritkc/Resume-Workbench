import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { RenderPreviewPanel } from '@/components/rendercv/render-preview-panel';
import {
  DEFAULT_RENDER_THEME_SETTINGS,
  normalizeRenderThemeSettings,
  type RenderThemeSettings,
  type ArtifactSummary,
} from '@/lib/types/render-theme';

const fetchResumeRenderPreview = vi.fn();
const fetchDraftRenderPreview = vi.fn();

vi.mock('@/lib/api/resume', () => ({
  fetchResumeRenderPreview: (...args: unknown[]) => fetchResumeRenderPreview(...args),
  fetchDraftRenderPreview: (...args: unknown[]) => fetchDraftRenderPreview(...args),
  isDraftRequestError: (error: unknown) =>
    error instanceof Error && error.name === 'DraftRequestError',
}));

const baseSettings: RenderThemeSettings = {
  ...DEFAULT_RENDER_THEME_SETTINGS,
};

const EMPTY_ARTIFACTS: ArtifactSummary[] = [];

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

    await waitFor(() =>
      expect(fetchDraftRenderPreview).toHaveBeenCalledWith(
        expect.objectContaining({
          ...draftRequest,
          preview_session_id: expect.any(String),
          preview_sequence: expect.any(Number),
        })
      )
    );
    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();
  });

  it('does not let a late response replace the latest preview', async () => {
    let resolveOld!: (value: { artifacts: ArtifactSummary[] }) => void;
    let resolveNew!: (value: { artifacts: ArtifactSummary[] }) => void;
    fetchDraftRenderPreview
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveOld = resolve;
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveNew = resolve;
          })
      );
    const draftA = { processed_resume: { summary: 'Old draft' } };
    const draftB = { processed_resume: { summary: 'New draft' } };
    const oldArtifact: ArtifactSummary = {
      artifact_id: 'artifact-old',
      kind: 'resume_preview_png',
      mime_type: 'image/png',
      file_name: 'old-preview.png',
      url: '/api/v1/artifacts/artifact-old',
    };
    const newArtifact: ArtifactSummary = {
      artifact_id: 'artifact-new',
      kind: 'resume_preview_png',
      mime_type: 'image/png',
      file_name: 'new-preview.png',
      url: '/api/v1/artifacts/artifact-new',
    };
    const { rerender } = render(<RenderPreviewPanel draftRequest={draftA} />);
    await waitFor(() => expect(fetchDraftRenderPreview).toHaveBeenCalledTimes(1));

    rerender(<RenderPreviewPanel draftRequest={draftB} />);
    await waitFor(() => expect(fetchDraftRenderPreview).toHaveBeenCalledTimes(2));
    resolveNew({ artifacts: [newArtifact] });
    expect(await screen.findByAltText('new-preview.png')).toBeInTheDocument();
    resolveOld({ artifacts: [oldArtifact] });
    await waitFor(() => expect(screen.getByAltText('new-preview.png')).toBeInTheDocument());
    expect(screen.queryByAltText('old-preview.png')).not.toBeInTheDocument();
  });

  it('does not render an internal preview header bar', async () => {
    render(<RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />);

    await screen.findByAltText('preview.png');

    expect(screen.queryByText('Preview')).not.toBeInTheDocument();
  });

  it('shows a structured render error as a visible alert', async () => {
    const error = Object.assign(new Error('CV • line 7: Invalid YAML.'), {
      name: 'DraftRequestError',
      status: 422,
      detail: {
        type: 'yaml_validation',
        message: 'Invalid YAML.',
        section: 'cv',
        line: 7,
        requestId: 'request-123',
        hint: 'Correct the reported value, then refresh the preview.',
      },
    });
    fetchDraftRenderPreview.mockRejectedValue(error);

    render(<RenderPreviewPanel draftRequest={{ processed_resume: { summary: 'Draft' } }} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Preview could not be generated');
    expect(alert).toHaveTextContent('CV • line 7: Invalid YAML.');
  });

  it('keeps fetched artifacts after parent re-renders with empty initial artifacts', async () => {
    const onLoadingChange = vi.fn();
    const { rerender } = render(
      <RenderPreviewPanel
        resumeId="resume-123"
        settings={baseSettings}
        initialArtifacts={EMPTY_ARTIFACTS}
        onLoadingChange={onLoadingChange}
      />
    );

    expect(await screen.findByAltText('preview.png')).toBeInTheDocument();

    rerender(
      <RenderPreviewPanel
        resumeId="resume-123"
        settings={baseSettings}
        initialArtifacts={EMPTY_ARTIFACTS}
        onLoadingChange={onLoadingChange}
      />
    );

    expect(screen.getByAltText('preview.png')).toBeInTheDocument();
  });

  it('opens large browser preview modal instead of navigating to raw PNG', async () => {
    render(<RenderPreviewPanel resumeId="resume-123" settings={baseSettings} />);

    const openPreviewButton = await screen.findByRole('button', {
      name: 'Open large preview for preview.png',
    });
    fireEvent.click(openPreviewButton);

    expect(await screen.findByRole('dialog', { name: 'Large Preview' })).toBeInTheDocument();
    expect(screen.getByAltText('preview.png large preview')).toBeInTheDocument();
  });
});
