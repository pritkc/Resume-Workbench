import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TailorPage from '@/app/(default)/tailor/page';

const push = vi.fn();
const back = vi.fn();
const setImprovedData = vi.fn();
const uploadJobDescriptions = vi.fn();
const previewImproveResume = vi.fn();
const confirmImproveResume = vi.fn();
const fetchPromptConfig = vi.fn();
const fetchGenerationDefaults = vi.fn();
const updateGenerationDefaults = vi.fn();
const incrementJobs = vi.fn();
const incrementImprovements = vi.fn();
const incrementResumes = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push,
    back,
  }),
}));

vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({
    improvedData: null,
    setImprovedData,
  }),
}));

vi.mock('@/lib/api/resume', () => ({
  uploadJobDescriptions: (...args: unknown[]) => uploadJobDescriptions(...args),
  previewImproveResume: (...args: unknown[]) => previewImproveResume(...args),
  confirmImproveResume: (...args: unknown[]) => confirmImproveResume(...args),
}));

vi.mock('@/lib/api/config', () => ({
  fetchPromptConfig: (...args: unknown[]) => fetchPromptConfig(...args),
  fetchGenerationDefaults: (...args: unknown[]) => fetchGenerationDefaults(...args),
  updateGenerationDefaults: (...args: unknown[]) => updateGenerationDefaults(...args),
}));

vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementJobs,
    incrementImprovements,
    incrementResumes,
  }),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params?.count ? `${key}:${params.count}` : key,
  }),
}));

const previewResult = {
  data: {
    request_id: 'req-preview',
    resume_id: null,
    application_pack_id: 'pack-123',
    generation_run_id: 'run-123',
    job_id: 'job-123',
    resume_preview: {
      personalInfo: {
        name: 'Jane Doe',
        title: 'Engineer',
        email: 'jane@example.com',
        phone: '555-0100',
        location: 'San Francisco',
      },
      summary: 'Tailored summary',
      workExperience: [],
      education: [],
      personalProjects: [],
      additional: {
        groups: [
          {
            id: 'technicalSkills',
            label: 'Technical Skills',
            items: ['Python', 'FastAPI'],
          },
        ],
      },
    },
    improvements: [{ suggestion: 'Focus on FastAPI', lineNumber: 1 }],
    cover_letter: 'Tailored cover letter',
    outreach_message: 'Tailored outreach message',
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
    theme_settings: {
      theme_id: 'moderncv',
      page_size: 'A4',
      density_profile: 'balanced',
      bold_keywords: false,
      accent_color: 'blue',
      show_contact_icons: false,
      margins_mm: { top: 10, bottom: 10, left: 10, right: 10 },
    },
    diff_summary: {
      total_changes: 1,
      additional_items_added: 1,
      additional_items_removed: 0,
      additional_groups_modified: 0,
      descriptions_modified: 0,
      high_risk_changes: 0,
    },
    detailed_changes: [
      {
        field_path: 'summary',
        field_type: 'summary',
        change_type: 'modified',
        original_value: 'Original summary',
        new_value: 'Tailored summary',
        confidence: 'high',
      },
    ],
  },
};

const confirmedResult = {
  data: {
    ...previewResult.data,
    resume_id: 'tailored-123',
  },
};

describe('TailorPage', () => {
  beforeEach(() => {
    push.mockReset();
    back.mockReset();
    setImprovedData.mockReset();
    uploadJobDescriptions.mockReset();
    previewImproveResume.mockReset();
    confirmImproveResume.mockReset();
    fetchPromptConfig.mockReset();
    fetchGenerationDefaults.mockReset();
    updateGenerationDefaults.mockReset();
    incrementJobs.mockReset();
    incrementImprovements.mockReset();
    incrementResumes.mockReset();
    localStorage.clear();
    localStorage.setItem('master_resume_id', 'master-123');
    uploadJobDescriptions.mockResolvedValue('job-123');
    previewImproveResume.mockResolvedValue(previewResult);
    confirmImproveResume.mockResolvedValue(confirmedResult);
    fetchPromptConfig.mockResolvedValue({
      prompt_options: [{ id: 'keywords' }],
      default_prompt_id: 'keywords',
    });
    fetchGenerationDefaults.mockResolvedValue({
      include_cover_letter: true,
      include_outreach_message: false,
      prompt_id: 'keywords',
    });
    updateGenerationDefaults.mockResolvedValue({
      include_cover_letter: true,
      include_outreach_message: false,
      prompt_id: 'keywords',
    });
  });

  it('loads last-used defaults and confirms the request-scoped tailoring payload', async () => {
    render(<TailorPage />);

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Cover letter' })).toHaveAttribute(
        'aria-checked',
        'true'
      )
    );
    expect(screen.getByRole('switch', { name: 'LinkedIn message' })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    fireEvent.change(screen.getByPlaceholderText('tailor.jobDescriptionPlaceholder'), {
      target: {
        value:
          'Senior backend role focused on FastAPI, architecture, APIs, testing, metrics, and ATS alignment for one-page resume tailoring.',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: 'tailor.generateTailored' }));

    expect(await screen.findByText('tailor.diffModal.title')).toBeInTheDocument();
    expect(screen.getAllByAltText('preview.png').length).toBeGreaterThan(0);
    expect(updateGenerationDefaults).toHaveBeenCalledWith({
      prompt_id: 'keywords',
      include_cover_letter: true,
      include_outreach_message: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'tailor.diffModal.confirmButton' }));

    await waitFor(() => expect(confirmImproveResume).toHaveBeenCalledTimes(1));

    expect(confirmImproveResume).toHaveBeenCalledWith(
      expect.objectContaining({
        resume_id: 'master-123',
        job_id: 'job-123',
        application_pack_id: 'pack-123',
        generation_run_id: 'run-123',
        include_cover_letter: true,
        include_outreach_message: false,
      })
    );
    expect(setImprovedData).toHaveBeenCalledWith(confirmedResult);
    expect(push).toHaveBeenCalledWith('/resumes/tailored-123');
  });
});
