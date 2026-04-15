'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  PipelineTimingSummary,
  ResumeChange,
  ResumeDiffSummary,
  ResumeFieldDiff,
  TailoringStageBreakdown,
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
  changeManifest?: ResumeChange[];
  pipelineTiming?: PipelineTimingSummary | null;
  artifacts?: ArtifactSummary[];
  errorMessage?: string;
}

type ChangeSource = 'ai' | 'system';
type ResumeSectionKey = 'summary' | 'experience' | 'education' | 'project' | 'skills' | 'other';

interface ParsedChangePath {
  section: ResumeSectionKey;
  entryIndex?: number;
  bulletIndex?: number;
}

interface CleanupNote {
  oldFragment: string;
  newFragment: string;
}

interface DisplayChange {
  change: ResumeFieldDiff;
  source: ChangeSource;
  contextLabel: string;
  needsVerification: boolean;
  parsed: ParsedChangePath;
  cleanupNote?: CleanupNote;
}

interface OrderedSection {
  key: string;
  title: string;
  items: DisplayChange[];
}

interface ManifestCandidate {
  raw: ResumeChange;
  canonicalPath: string;
}

const WORK_INDEX_PATTERNS = [/workExperience\[(\d+)\]/, /experience\[(\d+)\]/];
const PROJECT_INDEX_PATTERNS = [/personalProjects\[(\d+)\]/, /projects\[(\d+)\]/];

function canonicalizePath(path: string): string {
  return path
    .trim()
    .replace(/\[[^\]]+\]/g, '[]')
    .replace(/\.values$/, '')
    .replace(/(?:\[\])+$/, '');
}

/** Normalize known path aliases so diff rows and manifest paths compare equal. */
function normalizeComparablePath(path: string): string {
  let p = path.trim();
  if (p.startsWith('experience[')) {
    p = `workExperience${p.slice('experience'.length)}`;
  }
  if (p.startsWith('projects[')) {
    p = `personalProjects${p.slice('projects'.length)}`;
  }
  return p;
}

function pathsMatchForManifest(diffPath: string, manifestPath: string): boolean {
  return normalizeComparablePath(diffPath) === normalizeComparablePath(manifestPath);
}

function normalizeTextForCompare(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function extractFirstIndex(path: string, patterns: RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = path.match(pattern);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }
  return undefined;
}

function extractBulletIndex(path: string): number | undefined {
  const match = path.match(/description\[(\d+)\]/);
  if (!match?.[1]) {
    return undefined;
  }
  return Number(match[1]);
}

function parseChangePath(change: ResumeFieldDiff): ParsedChangePath {
  const path = change.field_path;
  const workIndex = extractFirstIndex(path, WORK_INDEX_PATTERNS);
  const projectIndex = extractFirstIndex(path, PROJECT_INDEX_PATTERNS);
  const educationIndex = extractFirstIndex(path, [/education\[(\d+)\]/]);
  const bulletIndex = extractBulletIndex(path);

  switch (change.field_type) {
    case 'summary':
      return { section: 'summary' };
    case 'experience_title':
    case 'experience':
      return { section: 'experience', entryIndex: workIndex, bulletIndex };
    case 'project_title':
    case 'project':
      return { section: 'project', entryIndex: projectIndex, bulletIndex };
    case 'education':
      return { section: 'education', entryIndex: educationIndex, bulletIndex };
    case 'description':
      if (workIndex !== undefined) {
        return { section: 'experience', entryIndex: workIndex, bulletIndex };
      }
      if (projectIndex !== undefined) {
        return { section: 'project', entryIndex: projectIndex, bulletIndex };
      }
      return { section: 'other', bulletIndex };
    case 'additional_item':
    case 'additional_group':
      return { section: 'skills' };
    default:
      return { section: 'other' };
  }
}

function buildContextLabel(change: ResumeFieldDiff, parsed: ParsedChangePath): string {
  const groupId = change.field_path.match(/skills\.groups\[([^\]]+)\]/)?.[1];
  const bulletLabel =
    parsed.bulletIndex !== undefined ? `bullet ${parsed.bulletIndex + 1}` : 'section content';

  switch (parsed.section) {
    case 'summary':
      return 'Resume summary';
    case 'experience':
      if (change.field_path.includes('.summary')) {
        return `Experience ${((parsed.entryIndex ?? 0) + 1).toString()} summary`;
      }
      if (change.field_type === 'experience_title') {
        return `Experience ${((parsed.entryIndex ?? 0) + 1).toString()} title`;
      }
      if (change.field_type === 'description') {
        return `Experience ${((parsed.entryIndex ?? 0) + 1).toString()} ${bulletLabel}`;
      }
      return `Experience ${((parsed.entryIndex ?? 0) + 1).toString()} entry`;
    case 'project':
      if (change.field_path.includes('.summary')) {
        return `Project ${((parsed.entryIndex ?? 0) + 1).toString()} summary`;
      }
      if (change.field_type === 'project_title') {
        return `Project ${((parsed.entryIndex ?? 0) + 1).toString()} title`;
      }
      if (change.field_type === 'description') {
        return `Project ${((parsed.entryIndex ?? 0) + 1).toString()} ${bulletLabel}`;
      }
      return `Project ${((parsed.entryIndex ?? 0) + 1).toString()} entry`;
    case 'education':
      return `Education ${((parsed.entryIndex ?? 0) + 1).toString()} entry`;
    case 'skills':
      return groupId ? `Skills group: ${groupId}` : 'Skills';
    default:
      return change.field_path;
  }
}

function isVerificationChange(change: ResumeFieldDiff): boolean {
  return change.field_type === 'additional_item' && change.change_type === 'added';
}

function matchScore(diffPath: string, manifestPath: string): number {
  if (!diffPath || !manifestPath) {
    return 0;
  }
  if (diffPath === manifestPath) {
    return 4;
  }
  if (diffPath.startsWith(manifestPath) || manifestPath.startsWith(diffPath)) {
    return 3;
  }
  if (diffPath.startsWith('skills.groups') && manifestPath.startsWith('skills.groups')) {
    return 2;
  }

  const diffTrimmed = diffPath.replace(/\[\]$/, '');
  const manifestTrimmed = manifestPath.replace(/\[\]$/, '');
  if (diffTrimmed.startsWith(manifestTrimmed) || manifestTrimmed.startsWith(diffTrimmed)) {
    return 2;
  }

  return 0;
}

function hasSiblingManifestMatch(change: ResumeFieldDiff, manifestPaths: string[]): boolean {
  const workIndex = extractFirstIndex(change.field_path, WORK_INDEX_PATTERNS);
  const projectIndex = extractFirstIndex(change.field_path, PROJECT_INDEX_PATTERNS);

  if (change.field_type === 'experience_title' && workIndex !== undefined) {
    return manifestPaths.some(
      (path) =>
        path.includes(`workExperience[${workIndex}]`) || path.includes(`experience[${workIndex}]`)
    );
  }

  if (change.field_type === 'project_title' && projectIndex !== undefined) {
    return manifestPaths.some(
      (path) =>
        path.includes(`personalProjects[${projectIndex}]`) ||
        path.includes(`projects[${projectIndex}]`)
    );
  }

  return false;
}

function extractManifestValue(candidate: ResumeChange, fieldPath: string): string | undefined {
  const value = candidate.value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (Array.isArray(value)) {
    const stringValues = value.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0
    );
    if (stringValues.length === 0) {
      return undefined;
    }

    const bulletIndex = extractBulletIndex(fieldPath);
    if (bulletIndex !== undefined && bulletIndex >= 0 && bulletIndex < stringValues.length) {
      return stringValues[bulletIndex];
    }

    if (stringValues.length === 1) {
      return stringValues[0];
    }

    return stringValues.join(' | ');
  }

  return undefined;
}

function buildDisplayChanges(
  detailedChanges: ResumeFieldDiff[],
  changeManifest: ResumeChange[] | undefined,
  includeSystemCleanupNotes: boolean
): DisplayChange[] {
  const manifestCandidates: ManifestCandidate[] = (changeManifest ?? []).map((change) => ({
    raw: change,
    canonicalPath: canonicalizePath(change.path),
  }));

  const manifestPaths = manifestCandidates.map((candidate) => candidate.raw.path);
  const hasManifest = manifestCandidates.length > 0;

  return detailedChanges.map((change) => {
    const parsed = parseChangePath(change);
    const canonicalDiffPath = canonicalizePath(change.field_path);

    let exactCandidate: ManifestCandidate | undefined;
    for (const candidate of manifestCandidates) {
      if (pathsMatchForManifest(change.field_path, candidate.raw.path)) {
        exactCandidate = candidate;
        break;
      }
    }

    let bestCandidate: ManifestCandidate | undefined = exactCandidate;
    let bestScore = exactCandidate ? 4 : 0;

    if (!exactCandidate) {
      for (const candidate of manifestCandidates) {
        const score = matchScore(canonicalDiffPath, candidate.canonicalPath);
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
    }

    const siblingMatch = hasSiblingManifestMatch(change, manifestPaths);
    const source: ChangeSource = hasManifest
      ? bestScore > 0 || siblingMatch
        ? 'ai'
        : 'system'
      : 'ai';

    // "System cleanup" compares the manifest row for *this* path to the final text.
    // Fuzzy path matching used to collapse every bullet to the same canonical path,
    // reusing one manifest entry (wrong "old" text on every row).
    let cleanupNote: CleanupNote | undefined;
    if (includeSystemCleanupNotes && exactCandidate && change.new_value) {
      const aiValue = extractManifestValue(exactCandidate.raw, change.field_path);
      const finalText = change.new_value;
      if (
        aiValue &&
        normalizeTextForCompare(aiValue) !== normalizeTextForCompare(finalText)
      ) {
        const focusedDiff = extractFocusedWordChange(aiValue, finalText);
        if (
          focusedDiff &&
          (focusedDiff.oldFragment.length > 0 || focusedDiff.newFragment.length > 0)
        ) {
          cleanupNote = {
            oldFragment: focusedDiff.oldFragment,
            newFragment: focusedDiff.newFragment,
          };
        }
      }
    }

    return {
      change,
      source,
      contextLabel: buildContextLabel(change, parsed),
      needsVerification: isVerificationChange(change),
      parsed,
      cleanupNote,
    };
  });
}

function compareWithinEntry(a: DisplayChange, b: DisplayChange): number {
  const fieldPriority = (item: DisplayChange): number => {
    switch (item.change.field_type) {
      case 'experience_title':
      case 'project_title':
        return 0;
      case 'description':
        return 1;
      case 'experience':
      case 'education':
      case 'project':
        return 2;
      default:
        return 3;
    }
  };

  const priorityDelta = fieldPriority(a) - fieldPriority(b);
  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const bulletA = a.parsed.bulletIndex ?? 9999;
  const bulletB = b.parsed.bulletIndex ?? 9999;
  if (bulletA !== bulletB) {
    return bulletA - bulletB;
  }

  return a.change.field_path.localeCompare(b.change.field_path);
}

function buildOrderedSections(displayChanges: DisplayChange[]): OrderedSection[] {
  const sections: OrderedSection[] = [];

  const summaryItems = displayChanges.filter((item) => item.parsed.section === 'summary');
  if (summaryItems.length > 0) {
    sections.push({ key: 'summary', title: 'Summary', items: summaryItems });
  }

  const experienceIndices = Array.from(
    new Set(
      displayChanges
        .filter(
          (item) => item.parsed.section === 'experience' && item.parsed.entryIndex !== undefined
        )
        .map((item) => item.parsed.entryIndex as number)
    )
  ).sort((a, b) => a - b);

  for (const index of experienceIndices) {
    const items = displayChanges
      .filter((item) => item.parsed.section === 'experience' && item.parsed.entryIndex === index)
      .sort(compareWithinEntry);
    sections.push({ key: `experience-${index}`, title: `Experience ${index + 1}`, items });
  }

  const educationIndices = Array.from(
    new Set(
      displayChanges
        .filter(
          (item) => item.parsed.section === 'education' && item.parsed.entryIndex !== undefined
        )
        .map((item) => item.parsed.entryIndex as number)
    )
  ).sort((a, b) => a - b);

  for (const index of educationIndices) {
    const items = displayChanges
      .filter((item) => item.parsed.section === 'education' && item.parsed.entryIndex === index)
      .sort(compareWithinEntry);
    sections.push({ key: `education-${index}`, title: `Education ${index + 1}`, items });
  }

  const projectIndices = Array.from(
    new Set(
      displayChanges
        .filter((item) => item.parsed.section === 'project' && item.parsed.entryIndex !== undefined)
        .map((item) => item.parsed.entryIndex as number)
    )
  ).sort((a, b) => a - b);

  for (const index of projectIndices) {
    const items = displayChanges
      .filter((item) => item.parsed.section === 'project' && item.parsed.entryIndex === index)
      .sort(compareWithinEntry);
    sections.push({ key: `project-${index}`, title: `Project ${index + 1}`, items });
  }

  const skillsItems = displayChanges
    .filter((item) => item.parsed.section === 'skills')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (skillsItems.length > 0) {
    sections.push({ key: 'skills', title: 'Skills', items: skillsItems });
  }

  const otherItems = displayChanges
    .filter((item) => item.parsed.section === 'other')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (otherItems.length > 0) {
    sections.push({ key: 'other', title: 'Other', items: otherItems });
  }

  return sections;
}

/** Trim a shared prefix/suffix inside two strings (character-level). */
function refineCharacterFocus(before: string, after: string): { oldFragment: string; newFragment: string } {
  let i = 0;
  const minLen = Math.min(before.length, after.length);
  while (i < minLen && before[i] === after[i]) {
    i += 1;
  }
  let j = 0;
  while (
    j < before.length - i &&
    j < after.length - i &&
    before[before.length - 1 - j] === after[after.length - 1 - j]
  ) {
    j += 1;
  }
  return {
    oldFragment: before.slice(i, before.length - j).trim(),
    newFragment: after.slice(i, after.length - j).trim(),
  };
}

function extractFocusedWordChange(
  beforeValue: string,
  afterValue: string
): { oldFragment: string; newFragment: string } | null {
  const beforeTokens = beforeValue.trim().split(/\s+/).filter(Boolean);
  const afterTokens = afterValue.trim().split(/\s+/).filter(Boolean);

  if (beforeTokens.length === 0 && afterTokens.length === 0) {
    return null;
  }

  let prefix = 0;
  while (
    prefix < beforeTokens.length &&
    prefix < afterTokens.length &&
    beforeTokens[prefix] === afterTokens[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeTokens.length - prefix &&
    suffix < afterTokens.length - prefix &&
    beforeTokens[beforeTokens.length - 1 - suffix] === afterTokens[afterTokens.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  let beforeFragment = beforeTokens
    .slice(prefix, Math.max(prefix, beforeTokens.length - suffix))
    .join(' ');
  let afterFragment = afterTokens
    .slice(prefix, Math.max(prefix, afterTokens.length - suffix))
    .join(' ');

  if (
    beforeFragment.length > 48 &&
    afterFragment.length > 48 &&
    (beforeFragment !== beforeValue.trim() || afterFragment !== afterValue.trim())
  ) {
    const refined = refineCharacterFocus(beforeFragment, afterFragment);
    if (refined.oldFragment || refined.newFragment) {
      beforeFragment = refined.oldFragment || '(removed)';
      afterFragment = refined.newFragment || '(added)';
    }
  }

  return {
    oldFragment: beforeFragment || '(removed)',
    newFragment: afterFragment || '(added)',
  };
}

function displayValuesForModifiedField(original: string | null | undefined, next: string | null | undefined) {
  const o = original ?? '';
  const n = next ?? '';
  const focused = extractFocusedWordChange(o, n);
  if (!focused) {
    return { before: o || '(empty)', after: n || '(empty)' };
  }
  return { before: focused.oldFragment, after: focused.newFragment };
}

export function DiffPreviewModal({
  isOpen,
  isConfirming = false,
  onClose,
  onReject,
  onConfirm,
  detailedChanges,
  changeBreakdown,
  changeManifest,
  artifacts,
  errorMessage,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showMetaDetails, setShowMetaDetails] = useState(false);

  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isConfirming) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((seconds) => seconds + 1), 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      setElapsed(0);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isConfirming]);

  const displayChanges = useMemo(
    () =>
      detailedChanges
        ? buildDisplayChanges(
            detailedChanges,
            changeManifest,
            (changeBreakdown?.cleanup_only_changes ?? 0) > 0
          )
        : [],
    [changeBreakdown?.cleanup_only_changes, detailedChanges, changeManifest]
  );

  const orderedSections = useMemo(() => buildOrderedSections(displayChanges), [displayChanges]);

  useEffect(() => {
    if (orderedSections.length === 0) {
      return;
    }
    setExpandedSections(new Set(orderedSections.map((section) => section.key)));
  }, [orderedSections]);

  if (!detailedChanges) {
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

  const stats = {
    total: displayChanges.length,
    summaryChanged: displayChanges.filter((item) => item.parsed.section === 'summary').length,
    experienceChanged: displayChanges.filter((item) => item.parsed.section === 'experience').length,
    educationChanged: displayChanges.filter((item) => item.parsed.section === 'education').length,
    projectChanged: displayChanges.filter((item) => item.parsed.section === 'project').length,
    skillsAdded: displayChanges.filter(
      (item) => item.change.field_type === 'additional_item' && item.change.change_type === 'added'
    ).length,
    skillsRemoved: displayChanges.filter(
      (item) =>
        item.change.field_type === 'additional_item' && item.change.change_type === 'removed'
    ).length,
    verify: displayChanges.filter((item) => item.needsVerification).length,
    ai: displayChanges.filter((item) => item.source === 'ai').length,
    system: displayChanges.filter((item) => item.source === 'system').length,
  };

  const toggleSection = (sectionKey: string) => {
    const next = new Set(expandedSections);
    if (next.has(sectionKey)) {
      next.delete(sectionKey);
    } else {
      next.add(sectionKey);
    }
    setExpandedSections(next);
  };

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
          <p className="font-mono text-xs text-gray-600 mt-1">{'// '}Review in resume order.</p>
        </DialogHeader>

        <div className="mt-3 border-2 border-black bg-white px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <InlineStat label="Total" value={stats.total} variant="info" />
              <InlineStat label="AI" value={stats.ai} variant="success" />
              <InlineStat label="System" value={stats.system} variant="warning" />
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={() => setShowMetaDetails((value) => !value)}
            >
              {showMetaDetails ? 'Hide details' : 'Show details'}
            </Button>
          </div>
          {showMetaDetails && (
            <div className="mt-2 flex flex-wrap gap-2">
              <InlineStat label="Summary" value={stats.summaryChanged} variant="info" />
              <InlineStat label="Experience" value={stats.experienceChanged} variant="info" />
              <InlineStat label="Projects" value={stats.projectChanged} variant="info" />
              <InlineStat label="Education" value={stats.educationChanged} variant="info" />
              <InlineStat label="Skills +" value={stats.skillsAdded} variant="success" />
              <InlineStat label="Skills -" value={stats.skillsRemoved} variant="danger" />
              <InlineStat label="Needs verification" value={stats.verify} variant="warning" />
            </div>
          )}
        </div>

        {errorMessage && (
          <div className="mt-4 border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-700">
            {errorMessage}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
          {artifacts && artifacts.length > 0 && (
            <ArtifactGallery artifacts={artifacts} title="Preview Snapshot" />
          )}

          {orderedSections.map((section) => (
            <ChangeSection
              key={section.key}
              title={section.title}
              count={section.items.length}
              isExpanded={expandedSections.has(section.key)}
              onToggle={() => toggleSection(section.key)}
            >
              {section.key === 'skills' ? (
                <SkillsGroupedView items={section.items} />
              ) : (
                section.items.map((item, index) => (
                  <ChangeItem key={`${section.key}-${index}`} item={item} />
                ))
              )}
            </ChangeSection>
          ))}
        </div>

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

function ChangeItem({ item }: { item: DisplayChange }) {
  const { change } = item;

  const typeBadgeClass = {
    added: 'border-[#15803D] bg-[#F0FDF4] text-[#15803D]',
    removed: 'border-[#B91C1C] bg-[#FEF2F2] text-[#B91C1C]',
    modified: 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]',
  }[change.change_type];

  return (
    <div className="border border-black/20 p-3 bg-white space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`border px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${typeBadgeClass}`}
        >
          {change.change_type}
        </span>
        <span
          className={`border px-2 py-0.5 font-mono text-xs uppercase tracking-wide ${
            item.source === 'ai'
              ? 'border-[#15803D] bg-[#F0FDF4] text-[#15803D]'
              : 'border-[#92400E] bg-[#FFFBEB] text-[#92400E]'
          }`}
        >
          {item.source === 'ai' ? 'AI' : 'System'}
        </span>
        {item.needsVerification && (
          <span className="border border-[#F97316] bg-[#FFF7ED] text-[#C2410C] px-2 py-0.5 font-mono text-xs uppercase tracking-wide inline-flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Verify
          </span>
        )}
        <span className="font-mono text-[11px] text-gray-500">{item.contextLabel}</span>
      </div>

      {change.change_type === 'added' && change.new_value && (
        <DiffValueBox label="After" value={change.new_value} tone="added" />
      )}

      {change.change_type === 'removed' && change.original_value && (
        <DiffValueBox label="Before" value={change.original_value} tone="removed" />
      )}

      {change.change_type === 'modified' && (() => {
        const { before, after } = displayValuesForModifiedField(
          change.original_value,
          change.new_value
        );
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <DiffValueBox label="Before" value={before} tone="removed" />
            <DiffValueBox label="After" value={after} tone="added" />
          </div>
        );
      })()}

      {item.cleanupNote && (
        <div className="border border-[#92400E] bg-[#FFFBEB] p-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#92400E] mb-1">
            System cleanup on the same item
          </p>
          <p className="font-mono text-xs text-[#78350F] whitespace-pre-wrap break-words">
            <span className="font-bold">old</span>: {item.cleanupNote.oldFragment}
            {' -> '}
            <span className="font-bold">new</span>: {item.cleanupNote.newFragment}
          </p>
        </div>
      )}
    </div>
  );
}

function SkillsGroupedView({ items }: { items: DisplayChange[] }) {
  const grouped = useMemo(() => {
    const buckets = new Map<
      string,
      {
        added: Set<string>;
        removed: Set<string>;
        modified: Set<string>;
      }
    >();

    for (const item of items) {
      const groupLabel = item.contextLabel.replace(/^Skills group:\s*/, '') || 'Skills';
      if (!buckets.has(groupLabel)) {
        buckets.set(groupLabel, { added: new Set(), removed: new Set(), modified: new Set() });
      }
      const bucket = buckets.get(groupLabel);
      if (!bucket) continue;

      if (item.change.change_type === 'added' && item.change.new_value) {
        bucket.added.add(item.change.new_value);
      } else if (item.change.change_type === 'removed' && item.change.original_value) {
        bucket.removed.add(item.change.original_value);
      } else if (item.change.change_type === 'modified') {
        const { before, after } = displayValuesForModifiedField(
          item.change.original_value,
          item.change.new_value
        );
        bucket.modified.add(`${before} -> ${after}`);
      }
    }

    return Array.from(buckets.entries()).map(([group, value]) => ({
      group,
      added: Array.from(value.added),
      removed: Array.from(value.removed),
      modified: Array.from(value.modified),
    }));
  }, [items]);

  return (
    <div className="space-y-3">
      {grouped.map((entry) => (
        <div key={entry.group} className="border border-black/20 p-3 bg-white">
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700">
            {entry.group}
          </p>
          <div className="mt-2 space-y-1">
            {entry.added.length > 0 && (
              <p className="font-mono text-xs text-[#14532D]">
                + Added ({entry.added.length}): {entry.added.join(', ')}
              </p>
            )}
            {entry.removed.length > 0 && (
              <p className="font-mono text-xs text-[#7F1D1D]">
                - Removed ({entry.removed.length}): {entry.removed.join(', ')}
              </p>
            )}
            {entry.modified.length > 0 && (
              <p className="font-mono text-xs text-[#1D4ED8]">
                ~ Updated ({entry.modified.length}): {entry.modified.join(' | ')}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function DiffValueBox({
  label,
  value,
  tone,
}: {
  label: string;
  value?: string;
  tone: 'added' | 'removed' | 'system';
}) {
  const toneClass =
    tone === 'added'
      ? 'border-[#15803D] bg-[#F0FDF4] text-[#14532D]'
      : tone === 'removed'
        ? 'border-[#B91C1C] bg-[#FEF2F2] text-[#7F1D1D]'
        : 'border-[#92400E] bg-[#FFFBEB] text-[#78350F]';

  return (
    <div className={`border p-2 ${toneClass}`}>
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] opacity-70 mb-1">{label}</p>
      <p className="font-mono text-xs whitespace-pre-wrap break-words">{value || '(empty)'}</p>
    </div>
  );
}
