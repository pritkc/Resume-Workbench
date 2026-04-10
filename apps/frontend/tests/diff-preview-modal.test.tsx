import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
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

describe('DiffPreviewModal', () => {
  it('renders fallback dialog when diff data is missing', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DiffPreviewModal isOpen onClose={onClose} onReject={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText('tailor.missingDiffDialog.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tailor.missingDiffDialog.confirmLabel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows the high-risk warning banner when dangerous changes are present', () => {
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

    expect(screen.getByText('tailor.diffModal.warningTitle', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('tailor.diffModal.warningMessage')).toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: /tailor\.diffModal\.summaryChanges/i }));
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
      />
    );

    expect(screen.getByText('Change Attribution')).toBeInTheDocument();
    expect(screen.getByText('Remote')).toBeInTheDocument();
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
});
