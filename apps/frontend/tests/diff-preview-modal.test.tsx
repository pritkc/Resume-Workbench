import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import type {
  TailoringStageBreakdown,
  ResumeDiffSummary,
  ResumeFieldDiff,
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

const changeManifest = [
  {
    path: 'summary',
    action: 'replace',
    value: 'new summary',
    reason: 'Updated summary',
  },
];

describe('DiffPreviewModal', () => {
  it('renders fallback dialog when diff data is missing', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DiffPreviewModal isOpen onClose={onClose} onReject={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText('tailor.missingDiffDialog.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tailor.missingDiffDialog.confirmLabel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows verification guidance when new skill items are introduced', () => {
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

    expect(screen.getByText('Verify 1 newly added skill item.')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /Summary/i }));
    expect(screen.queryByText('new summary')).not.toBeInTheDocument();
  });

  it('renders change attribution when breakdown is provided', () => {
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

    expect(screen.getByText('Change Attribution')).toBeInTheDocument();
    expect(
      screen.getByText('Pipeline: 2 AI-applied, 1 cleanup-only, 0 rejected.')
    ).toBeInTheDocument();
    expect(screen.getAllByText('AI').length).toBeGreaterThan(0);
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

    const context = screen.getByText('Experience 1 title').closest('div');
    expect(context).not.toBeNull();
    expect(within(context as HTMLElement).getByText('AI')).toBeInTheDocument();
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
    expect(screen.getByText('Project 1 bullet 2')).toBeInTheDocument();
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

  it('renders pipeline timing entries when provided', () => {
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

    expect(screen.getByText('Pipeline Timing')).toBeInTheDocument();
    expect(screen.getByText('frontend / total_flow')).toBeInTheDocument();
    expect(screen.getByText('llm / resume_generate_full')).toBeInTheDocument();
    expect(screen.getAllByText('1.50m').length).toBeGreaterThanOrEqual(1);
  });
});
