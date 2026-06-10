import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import type {
  TailoringStageBreakdown,
  ResumeDiffSummary,
  ResumeFieldDiff,
  ResumeChange,
  ResumePreview,
} from '@/components/common/resume_previewer_context';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

const diffSummary: ResumeDiffSummary = {
  total_changes: 2,
  additional_items_added: 1,
  additional_items_removed: 0,
  additional_groups_modified: 0,
  descriptions_modified: 1,
  high_risk_changes: 1,
};

const detailedChanges: ResumeFieldDiff[] = [
  {
    field_path: 'summary',
    field_type: 'summary',
    change_type: 'modified',
    original_value: 'old summary',
    new_value: 'new summary',
    confidence: 'medium',
  },
  {
    field_path: 'additional.groups[technicalSkills].items',
    field_type: 'additional_item',
    change_type: 'added',
    new_value: 'Go',
    confidence: 'high',
  },
];

const changeBreakdown: TailoringStageBreakdown = {
  llm_declared_changes: 2,
  llm_computed_changes: 2,
  llm_applied_changes: 2,
  llm_rejected_changes: 0,
  cleanup_only_changes: 1,
  numeric_claim_changes: 1,
  numeric_claim_rejections: 0,
  skill_changes: 0,
  final_render_changes: 2,
  location_source: 'jd',
  location_value: 'Remote',
};

const changeManifest: ResumeChange[] = [
  {
    path: 'summary',
    action: 'replace',
    value: 'new summary',
    reason: 'Updated summary',
  },
];

const resumePreview: ResumePreview = {
  personalInfo: {
    name: 'Alex Morgan',
    email: 'prit@example.com',
    phone: '555-0100',
    location: 'Nashville, TN',
  },
  summary: 'Resume summary',
  workExperience: [
    {
      id: 1,
      company: 'Humana',
      title: 'Software Engineer',
      location: 'Remote',
      years: '2025-present',
      description: ['Built APIs', 'Built dashboard'],
    },
  ],
  education: [],
  personalProjects: [
    {
      id: 1,
      name: 'ClaimSight',
      description: ['Built dashboard', 'Migrated search'],
    },
  ],
  skills: { groups: [] },
};

describe('DiffPreviewModal', () => {
  it('renders fallback dialog when diff data is missing', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DiffPreviewModal isOpen onClose={onClose} onReject={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText('tailor.missingDiffDialog.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tailor.missingDiffDialog.confirmLabel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('groups skill changes into compact summaries', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    expect(screen.getByRole('button', { name: 'Jump to Skills' })).toBeInTheDocument();
    expect(screen.getByText('Go')).toBeInTheDocument();
  });

  it('toggles section visibility on header click', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    expect(screen.getByText('new summary')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Professional summary' }));
    expect(screen.queryByText('new summary')).not.toBeInTheDocument();
  });

  it('keeps attribution metadata compact and toggleable', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
        changeBreakdown={changeBreakdown}
        changeManifest={changeManifest}
      />
    );

    expect(screen.queryByText('Change Attribution')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Pipeline: 2 AI-applied, 1 cleanup-only, 0 rejected.')
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Breakdown' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Breakdown' }));
    expect(screen.getByRole('heading', { name: 'Summary' })).toBeInTheDocument();
    expect(screen.getByText('Skills verify')).toBeInTheDocument();
    expect(screen.getByText('Model-attributed rows')).toBeInTheDocument();
  });

  it('attributes title changes to AI when manifest has same entry paths', () => {
    const titleOnlyChanges: ResumeFieldDiff[] = [
      {
        field_path: 'workExperience[0].position',
        field_type: 'experience_title',
        change_type: 'modified',
        original_value: 'Software Engineer',
        new_value: 'Senior Software Engineer',
        confidence: 'medium',
      },
    ];

    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={titleOnlyChanges}
        resumePreview={resumePreview}
        changeManifest={[
          {
            path: 'workExperience[0].description[0]',
            action: 'replace',
            original: 'Built APIs',
            value: 'Built scalable APIs',
            reason: 'Tailored bullet',
          },
        ]}
      />
    );

    const context = screen.getByText('Role').closest('div');
    expect(context).not.toBeNull();
    expect(within(context as HTMLElement).getByText(/Attributed to model/i)).toBeInTheDocument();
    expect(screen.getAllByText('Humana')).toHaveLength(1);
    expect(screen.queryByText(/Humana .* role/i)).not.toBeInTheDocument();
  });

  it('renders changed bullets as old stricken text, new text, and why', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        resumePreview={resumePreview}
        detailedChanges={[
          {
            field_path: 'workExperience[0].description[1]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Built dashboard',
            new_value: 'Built analytics dashboard',
            confidence: 'medium',
          },
        ]}
        changeManifest={[
          {
            path: 'workExperience[0].description[1]',
            action: 'replace',
            original: 'Built dashboard',
            value: 'Built analytics dashboard',
            reason: 'Directly maps to analytics ownership.',
          },
        ]}
      />
    );

    const oldBullet = screen.getByText('Built dashboard');
    expect(oldBullet).toHaveClass('line-through');
    expect(screen.getByText('Built analytics dashboard')).toBeInTheDocument();
    expect(screen.getByText(/Directly maps to analytics ownership/i)).toHaveClass('bg-yellow-100');
  });

  it('shows compact bullet indexes and highlighted reasons for changed points', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        resumePreview={resumePreview}
        detailedChanges={[
          {
            field_path: 'summary',
            field_type: 'summary',
            change_type: 'modified',
            original_value: 'old summary',
            new_value: 'new summary',
            confidence: 'medium',
          },
          {
            field_path: 'workExperience[0].description[1]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Built dashboard',
            new_value: 'Built analytics dashboard',
            confidence: 'medium',
          },
        ]}
        changeManifest={[
          {
            path: 'summary',
            action: 'replace',
            original: 'old summary',
            value: 'new summary',
            reason: 'Updated summary',
          },
        ]}
      />
    );

    expect(screen.getByText('#2')).toBeInTheDocument();
    expect(screen.queryByText('Bullet 2')).not.toBeInTheDocument();
    expect(screen.queryByText('Model')).not.toBeInTheDocument();
  });

  it('renders unchanged rows with a bullet and retained rationale', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        resumePreview={resumePreview}
        detailedChanges={[
          {
            field_path: 'workExperience[0].description[0]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Built APIs',
            new_value: 'Built APIs',
            confidence: 'medium',
          },
        ]}
        changeManifest={[
          {
            path: 'workExperience[0].description[0]',
            action: 'replace',
            original: 'Built APIs',
            value: 'Built APIs',
            reason: 'Original story is already targeted.',
          },
        ]}
      />
    );

    expect(screen.getByLabelText('Bullet 1')).toBeInTheDocument();
    expect(screen.getByText('Built APIs')).toBeInTheDocument();
    expect(screen.getByText(/Original story is already targeted/i)).toBeInTheDocument();
  });

  it('shows project diffs when project path uses alias form', () => {
    const projectAliasDiff: ResumeFieldDiff[] = [
      {
        field_path: 'projects[0].description[1]',
        field_type: 'description',
        change_type: 'modified',
        original_value: 'Built dashboard',
        new_value: 'Built analytics dashboard',
        confidence: 'medium',
      },
    ];

    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={projectAliasDiff}
      />
    );

    expect(screen.getByRole('button', { name: /Project 1/i })).toBeInTheDocument();
    expect(screen.getByLabelText('Bullet 2')).toBeInTheDocument();
  });

  it('fires confirm and reject handlers', () => {
    const onConfirm = vi.fn();
    const onReject = vi.fn();

    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={onReject}
        onConfirm={onConfirm}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'tailor.diffModal.confirmButton' }));
    fireEvent.click(screen.getByRole('button', { name: 'tailor.diffModal.rejectButton' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('does not render pipeline timing panel in review modal', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
        pipelineTiming={{
          started_at: '2026-04-14T20:10:00.000Z',
          ended_at: '2026-04-14T20:11:30.000Z',
          total_duration_ms: 90_000,
          entries: [
            {
              host_event: 'frontend',
              sub_event: 'total_flow',
              started_at: '2026-04-14T20:10:00.000Z',
              ended_at: '2026-04-14T20:11:30.000Z',
              duration_ms: 90_000,
              metadata: null,
            },
            {
              host_event: 'llm',
              sub_event: 'resume_generate_full',
              started_at: '2026-04-14T20:10:10.000Z',
              ended_at: '2026-04-14T20:10:40.000Z',
              duration_ms: 30_000,
              metadata: null,
            },
          ],
        }}
      />
    );

    expect(screen.queryByText('Pipeline Timing')).not.toBeInTheDocument();
    expect(screen.queryByText('frontend / total_flow')).not.toBeInTheDocument();
  });

  it('suppresses cleanup comparison when cleanup count is zero', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={[
          {
            field_path: 'summary',
            field_type: 'summary',
            change_type: 'modified',
            original_value: 'old summary',
            new_value: 'new cleaned summary',
            confidence: 'medium',
          },
        ]}
        changeManifest={[
          {
            path: 'summary',
            action: 'replace',
            value: 'new summary',
            reason: 'Updated summary',
          },
        ]}
        changeBreakdown={{ ...changeBreakdown, cleanup_only_changes: 0 }}
      />
    );

    expect(screen.queryByText('Post-tailor tweak')).not.toBeInTheDocument();
  });

  it('shows system cleanup only when a manifest path exactly matches the diff row', () => {
    const ragSnippet = '1.2M member RAG system';
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={[
          {
            field_path: 'workExperience[0].description[0]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Before bullet zero',
            new_value: 'Final bullet zero',
            confidence: 'medium',
          },
          {
            field_path: 'workExperience[0].description[1]',
            field_type: 'description',
            change_type: 'modified',
            original_value: 'Before bullet one',
            new_value: 'Final bullet one',
            confidence: 'medium',
          },
        ]}
        changeManifest={[
          {
            path: 'workExperience[0].description[0]',
            action: 'replace',
            value: `Partnered with engineering ${ragSnippet} tail`,
            reason: 'Tailored',
          },
        ]}
        changeBreakdown={{ ...changeBreakdown, cleanup_only_changes: 1 }}
      />
    );

    expect(screen.queryByText('Post-tailor tweak')).not.toBeInTheDocument();
    expect(
      screen.getByText(new RegExp(ragSnippet.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    ).toBeInTheDocument();
  });
});
