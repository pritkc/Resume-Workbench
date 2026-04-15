import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ResumeViewerPage from '@/app/(default)/resumes/[id]/page';

const push = vi.fn();
const fetchResume = vi.fn();
const downloadResumePdf = vi.fn();
const getResumePdfUrl = vi.fn();
const deleteResume = vi.fn();
const retryProcessing = vi.fn();
const renameResume = vi.fn();
const decrementResumes = vi.fn();
const setHasMasterResume = vi.fn();
const downloadBlobAsFile = vi.fn();
const openUrlInNewTab = vi.fn();
const buildResumePdfFilename = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: 'resume-123' }),
}));

vi.mock('@/lib/api/resume', () => ({
  fetchResume: (...args: unknown[]) => fetchResume(...args),
  downloadResumePdf: (...args: unknown[]) => downloadResumePdf(...args),
  getResumePdfUrl: (...args: unknown[]) => getResumePdfUrl(...args),
  deleteResume: (...args: unknown[]) => deleteResume(...args),
  retryProcessing: (...args: unknown[]) => retryProcessing(...args),
  renameResume: (...args: unknown[]) => renameResume(...args),
}));

vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    decrementResumes,
    setHasMasterResume,
  }),
}));

vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({
    uiLanguage: 'en',
  }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('@/lib/utils/download', () => ({
  downloadBlobAsFile: (...args: unknown[]) => downloadBlobAsFile(...args),
  openUrlInNewTab: (...args: unknown[]) => openUrlInNewTab(...args),
  buildResumePdfFilename: (...args: unknown[]) => buildResumePdfFilename(...args),
}));

vi.mock('@/components/enrichment/enrichment-modal', () => ({
  EnrichmentModal: () => null,
}));

vi.mock('@/components/rendercv/render-preview-panel', () => ({
  RenderPreviewPanel: () => <div>render-preview-panel</div>,
}));

describe('ResumeViewerPage', () => {
  beforeEach(() => {
    push.mockReset();
    fetchResume.mockReset();
    downloadResumePdf.mockReset();
    getResumePdfUrl.mockReset();
    deleteResume.mockReset();
    retryProcessing.mockReset();
    renameResume.mockReset();
    decrementResumes.mockReset();
    setHasMasterResume.mockReset();
    downloadBlobAsFile.mockReset();
    openUrlInNewTab.mockReset();
    buildResumePdfFilename.mockReset();
    buildResumePdfFilename.mockReturnValue('jane_doe_Q7K2MW.pdf');

    fetchResume.mockResolvedValue({
      resume_id: 'resume-123',
      resume_code: 'Q7K2MW',
      raw_resume: {
        id: null,
        content: '{}',
        content_type: 'json',
        created_at: '2026-04-01T00:00:00Z',
        processing_status: 'ready',
      },
      processed_resume: {
        personalInfo: {
          name: 'Jane Doe',
          title: 'Engineer',
          email: 'jane@example.com',
          phone: '555-0100',
          location: 'San Francisco',
        },
        summary: 'Summary',
        workExperience: [],
        education: [],
        personalProjects: [],
        additional: {
          groups: [
            {
              id: 'technicalSkills',
              label: 'Technical Skills',
              items: [],
            },
            {
              id: 'languages',
              label: 'Languages',
              items: [],
            },
            {
              id: 'certificationsTraining',
              label: 'Training & Certifications',
              items: [],
            },
            {
              id: 'awards',
              label: 'Awards',
              items: [],
            },
          ],
        },
      },
      parent_id: 'master-123',
      title: 'Tailored Resume',
      theme_settings: {
        theme_id: 'moderncv',
        page_size: 'LETTER',
        density_profile: 'compact',
        bold_keywords: false,
        accent_color: 'green',
        show_contact_icons: true,
        margins_mm: { top: 12, bottom: 12, left: 11, right: 11 },
      },
    });
    downloadResumePdf.mockResolvedValue(new Blob(['pdf']));
  });

  it('downloads the resume using the stored RenderCV theme settings', async () => {
    render(<ResumeViewerPage />);

    const downloadButton = await screen.findByRole('button', {
      name: 'resumeViewer.downloadResume',
    });
    fireEvent.click(downloadButton);

    await waitFor(() =>
      expect(downloadResumePdf).toHaveBeenCalledWith(
        'resume-123',
        expect.objectContaining({
          theme_id: 'moderncv',
          page_size: 'LETTER',
          density_profile: 'compact',
          bold_keywords: false,
          accent_color: 'green',
          show_contact_icons: true,
          margins_mm: { top: 12, bottom: 12, left: 11, right: 11 },
          design: expect.objectContaining({
            theme: 'moderncv',
          }),
          locale: expect.objectContaining({
            language: 'english',
          }),
          settings: expect.objectContaining({
            current_date: 'today',
          }),
        }),
        'en'
      )
    );
    expect(buildResumePdfFilename).toHaveBeenCalledWith({
      fullName: 'Jane Doe',
      resumeCode: 'Q7K2MW',
      fallbackId: 'resume-123',
    });
    expect(downloadBlobAsFile).toHaveBeenCalledWith(expect.any(Blob), 'jane_doe_Q7K2MW.pdf');
  });
});
