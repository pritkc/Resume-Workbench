'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  TailoringStageBreakdown,
  ResumeDiffSummary,
  ResumeFieldDiff,
} from '@/components/common/resume_previewer_context';
import type { ArtifactSummary } from '@/lib/types/render-theme';
import { ArtifactGallery } from '@/components/rendercv/artifact-gallery';

interface DiffPreviewModalProps {
  isOpen: boolean;
  isConfirming?: boolean;
  onClose: () => void;
  onReject: () => void;
  onConfirm: () => void;
  diffSummary?: ResumeDiffSummary;
  detailedChanges?: ResumeFieldDiff[];
  changeBreakdown?: TailoringStageBreakdown;
  artifacts?: ArtifactSummary[];
  errorMessage?: string;
}

export function DiffPreviewModal({
  isOpen,
  isConfirming = false,
  onClose,
  onReject,
  onConfirm,
  diffSummary,
  detailedChanges,
  changeBreakdown,
  artifacts,
  errorMessage,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'skills', 'descriptions', 'experience'])
  );

  // Elapsed timer while confirming
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isConfirming) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConfirming]);

  if (!diffSummary || !detailedChanges) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
          <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
            <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 border-2 border-black bg-white p-4 font-mono text-xs text-gray-700">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="flex justify-end items-center gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
            <Button variant="outline" onClick={onClose} disabled={isConfirming} className="gap-2">
              {t('common.cancel')}
            </Button>
            <Button variant="warning" onClick={onConfirm} disabled={isConfirming} className="gap-2">
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('tailor.missingDiffDialog.confirmLabel')
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  // Group changes by type
  const summaryChanges = detailedChanges.filter((c) => c.field_type === 'summary');
  const additionalItemChanges = detailedChanges.filter((c) => c.field_type === 'additional_item');
  const additionalGroupChanges = detailedChanges.filter((c) => c.field_type === 'additional_group');
  const addedSkills = additionalItemChanges
    .filter((c) => c.change_type === 'added' && Boolean(c.new_value))
    .map((c) => c.new_value as string);
  const removedSkills = additionalItemChanges
    .filter((c) => c.change_type === 'removed' && Boolean(c.original_value))
    .map((c) => c.original_value as string);
  const descChanges = detailedChanges.filter((c) => c.field_type === 'description');
  const titleChanges = detailedChanges.filter(
    (c) => c.field_type === 'experience_title' || c.field_type === 'project_title'
  );
  const experienceChanges = detailedChanges.filter((c) => c.field_type === 'experience');
  const educationChanges = detailedChanges.filter((c) => c.field_type === 'education');
  const projectChanges = detailedChanges.filter((c) => c.field_type === 'project');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-6xl w-[92vw] max-h-[95vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        <DialogHeader className="border-b-2 border-black pb-3 bg-white -mx-6 -mt-6 px-6 pt-4">
          <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
            {t('tailor.diffModal.title')}
          </DialogTitle>
          <p className="font-mono text-xs text-gray-600 mt-1">
            {'// '}
            {t('tailor.diffModal.subtitle')}
          </p>
        </DialogHeader>

        {/* Summary cards — compact inline row */}
        <div className="border-2 border-black bg-white px-3 py-2 mt-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <div className="w-2 h-2 bg-[#1D4ED8]"></div>
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                {t('tailor.diffModal.summary')}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 flex-1">
              <InlineStat
                label={t('tailor.diffModal.additionalGroupsModified')}
                value={diffSummary.additional_groups_modified}
                variant="info"
              />
              <InlineStat
                label={t('tailor.diffModal.descriptionsModified')}
                value={diffSummary.descriptions_modified}
                variant="info"
              />
              <InlineStat
                label={t('tailor.diffModal.highRiskChanges')}
                value={diffSummary.high_risk_changes}
                variant={diffSummary.high_risk_changes > 0 ? 'danger' : 'success'}
              />
            </div>
          </div>

          {diffSummary.high_risk_changes > 0 && (
            <div className="mt-2 border border-[#F97316] bg-[#FFF7ED] px-2 py-1.5 flex flex-col gap-1">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-[#F97316] shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-1">
                  <p className="font-mono text-xs font-bold text-[#C2410C]">
                    {t('tailor.diffModal.warningTitle', {
                      count: diffSummary.high_risk_changes,
                    })}
                  </p>
                  <p className="font-mono text-xs text-[#C2410C]">
                    {t('tailor.diffModal.warningMessage')}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {changeBreakdown && (
          <div className="border-2 border-black bg-white px-3 py-2 mt-2">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 shrink-0">
                <div className="w-2 h-2 bg-[#15803D]"></div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                  {t('tailor.diffModal.changeAttribution')}
                </span>
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                <InlineStat
                  label="LLM applied"
                  value={changeBreakdown.llm_applied_changes}
                  variant="success"
                />
                <InlineStat
                  label="Cleanup only"
                  value={changeBreakdown.cleanup_only_changes}
                  variant="warning"
                />
                <InlineStat
                  label="Rejected"
                  value={changeBreakdown.llm_rejected_changes}
                  variant="danger"
                />
                <InlineStat
                  label="Numeric risks"
                  value={changeBreakdown.numeric_claim_changes}
                  variant="warning"
                />
                <InlineStat
                  label="Skill changes"
                  value={changeBreakdown.skill_changes}
                  variant="info"
                />
                <InlineStat
                  label={`Location: ${changeBreakdown.location_source}`}
                  value={changeBreakdown.location_value ?? 'n/a'}
                  variant={changeBreakdown.location_source === 'jd' ? 'success' : 'info'}
                />
              </div>
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mt-4 border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        {/* Detailed changes list */}
        <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
          {artifacts && artifacts.length > 0 && (
            <ArtifactGallery artifacts={artifacts} title="Preview Snapshot" />
          )}

          {/* Summary changes */}
          {summaryChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.summaryChanges')}
              count={summaryChanges.length}
              isExpanded={expandedSections.has('summary')}
              onToggle={() => toggleSection('summary')}
            >
              {summaryChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Title enhancements */}
          {titleChanges.length > 0 && (
            <ChangeSection
              title="Title Enhancements"
              count={titleChanges.length}
              isExpanded={expandedSections.has('titles')}
              onToggle={() => toggleSection('titles')}
            >
              {titleChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Skills section changes */}
          {(additionalGroupChanges.length > 0 || addedSkills.length > 0 || removedSkills.length > 0) && (
            <ChangeSection
              title="Skills Section Changes"
              count={additionalGroupChanges.length + addedSkills.length + removedSkills.length}
              isExpanded={expandedSections.has('skills')}
              onToggle={() => toggleSection('skills')}
            >
              {additionalGroupChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
              {addedSkills.length > 0 && (
                <SkillHighlights
                  title="New skills"
                  values={addedSkills}
                  colorClass="border-[#15803D] bg-[#F0FDF4] text-[#15803D]"
                />
              )}
              {removedSkills.length > 0 && (
                <SkillHighlights
                  title="Removed skills"
                  values={removedSkills}
                  colorClass="border-[#B91C1C] bg-[#FEF2F2] text-[#B91C1C]"
                />
              )}
            </ChangeSection>
          )}

          {/* Experience changes */}
          {experienceChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.experienceChanges')}
              count={experienceChanges.length}
              isExpanded={expandedSections.has('experience')}
              onToggle={() => toggleSection('experience')}
            >
              {experienceChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Description changes */}
          {descChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.descriptionChanges')}
              count={descChanges.length}
              isExpanded={expandedSections.has('descriptions')}
              onToggle={() => toggleSection('descriptions')}
            >
              {descChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Education changes */}
          {educationChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.educationChanges')}
              count={educationChanges.length}
              isExpanded={expandedSections.has('education')}
              onToggle={() => toggleSection('education')}
            >
              {educationChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}

          {/* Project changes */}
          {projectChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.projectChanges')}
              count={projectChanges.length}
              isExpanded={expandedSections.has('project')}
              onToggle={() => toggleSection('project')}
            >
              {projectChanges.map((change, idx) => (
                <ChangeItem key={idx} change={change} />
              ))}
            </ChangeSection>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
          <Button variant="outline" onClick={onReject} disabled={isConfirming} className="gap-2">
            <X className="w-4 h-4" />
            {t('tailor.diffModal.rejectButton')}
          </Button>
          <div className="flex items-center gap-3">
            {isConfirming && elapsed > 0 && (
              <span className="font-mono text-xs text-gray-500">{elapsed}s</span>
            )}
            <Button
              onClick={onConfirm}
              disabled={isConfirming}
              className="gap-2 bg-[#15803D] hover:bg-[#166534]"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  {t('tailor.diffModal.confirmButton')}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SkillHighlights({
  title,
  values,
  colorClass,
}: {
  title: string;
  values: string[];
  colorClass: string;
}) {
  const uniqueValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  if (uniqueValues.length === 0) {
    return null;
  }
  return (
    <div className="border border-black/20 p-3 bg-white">
      <p className="font-mono text-xs font-bold uppercase tracking-wide text-gray-700 mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {uniqueValues.map((value) => (
          <span key={value} className={`border px-2 py-0.5 font-mono text-xs ${colorClass}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

// Helper component: compact inline stat badge
interface StatCardProps {
  label: string;
  value: number | string;
  variant: 'success' | 'warning' | 'danger' | 'info';
}

function InlineStat({ label, value, variant }: StatCardProps) {
  const colors = {
    success: 'border-[#15803D] bg-[#F0FDF4] text-[#15803D]',
    warning: 'border-[#F97316] bg-[#FFF7ED] text-[#F97316]',
    danger: 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]',
    info: 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]',
  };

  return (
    <div className={`border px-2 py-0.5 flex items-center gap-1.5 ${colors[variant]}`}>
      <span className="font-mono text-sm font-bold">{value}</span>
      <span className="font-mono text-xs uppercase tracking-wide opacity-75">{label}</span>
    </div>
  );
}

// Helper component: collapsible change section
interface ChangeSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function ChangeSection({ title, count, isExpanded, onToggle, children }: ChangeSectionProps) {
  return (
    <div className="border-2 border-black bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-mono text-sm font-bold uppercase tracking-wider">
            {title} ({count})
          </span>
        </div>
      </button>

      {isExpanded && <div className="border-t-2 border-black p-4 space-y-3">{children}</div>}
    </div>
  );
}

// Helper component: change item
interface ChangeItemProps {
  change: ResumeFieldDiff;
}

function ChangeItem({ change }: ChangeItemProps) {
  const typeColors = {
    added: 'border-l-4 border-[#15803D] bg-[#F0FDF4]',
    removed: 'border-l-4 border-[#DC2626] bg-[#FEF2F2]',
    modified: 'border-l-4 border-[#1D4ED8] bg-[#EFF6FF]',
  };

  const typeLabels = {
    added: '+',
    removed: '-',
    modified: '~',
  };

  return (
    <div className={`p-3 ${typeColors[change.change_type]}`}>
      <div className="flex items-start gap-2">
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
          {typeLabels[change.change_type]}
        </span>
        <div className="flex-1">
          {change.original_value && (
            <div className="line-through text-[#DC2626] font-mono text-sm mb-1">
              {change.original_value}
            </div>
          )}
          {change.new_value && (
            <div className="text-gray-900 font-mono text-sm">{change.new_value}</div>
          )}
        </div>
        {change.change_type === 'added' && change.confidence === 'high' && (
          <AlertTriangle className="w-4 h-4 text-[#F97316] shrink-0" />
        )}
      </div>
    </div>
  );
}
