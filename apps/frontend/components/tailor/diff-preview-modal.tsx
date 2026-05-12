'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  PipelineTimingSummary,
  ResumeChange,
  ResumeDiffSummary,
  ResumeFieldDiff,
  ResumePreview,
  SkillsObservationPayload,
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
  /** Sparse skills QA rows from tailoring pipeline (tags + optional LLM whys). */
  skillsObservation?: SkillsObservationPayload | null;
  errorMessage?: string;
  resumePreview?: ResumePreview | null;
}

type ChangeSource = 'ai' | 'system';
type ResumeSectionKey =
  | 'summary'
  | 'keywords'
  | 'personal'
  | 'experience'
  | 'education'
  | 'project'
  | 'skills'
  | 'other';

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
  /** Present when applied text equals the prior value but a model note explains retention. */
  semanticUnchanged: boolean;
  parsed: ParsedChangePath;
  cleanupNote?: CleanupNote;
  /** From change manifest (LLM per-cell ``why``) when path matches. */
  aiRationale?: string;
}

interface OrderedSection {
  key: string;
  title: ReactNode;
  items: DisplayChange[];
}

interface ManifestCandidate {
  raw: ResumeChange;
  canonicalPath: string;
}

const WORK_INDEX_PATTERNS = [/workExperience\[(\d+)\]/, /experience\[(\d+)\]/];
const PROJECT_INDEX_PATTERNS = [/personalProjects\[(\d+)\]/, /projects\[(\d+)\]/];

function stringifyManifestValue(value: ResumeChange['value']): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value, null, 0);
    } catch {
      return String(value);
    }
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return '';
}

/** Accept backend JSON blobs (JD diff endpoint may omit strict typing client-side). */
function coerceSkillsObservationPayload(
  raw: SkillsObservationPayload | Record<string, unknown> | null | undefined
): SkillsObservationPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as SkillsObservationPayload;
  if (typeof candidate.version !== 'number' || !Array.isArray(candidate.groups)) return null;
  return candidate;
}

/** When final resume matches the source (localization/cleanup), line diffs omit summary — surface manifest row anyway. */
function augmentDetailedChangesFromManifest(
  detailedChanges: ResumeFieldDiff[],
  changeManifest?: ResumeChange[]
): ResumeFieldDiff[] {
  let next = detailedChanges;
  const hasSummary = detailedChanges.some((c) => c.field_path === 'summary');
  const summaryManifest = changeManifest?.find((c) => c.path === 'summary');
  if (!hasSummary && summaryManifest?.action === 'replace') {
    const orig = summaryManifest.original?.trim() ?? '';
    const nw = stringifyManifestValue(summaryManifest.value).trim();
    const change_type: ResumeFieldDiff['change_type'] =
      orig && !nw ? 'removed' : !orig && nw ? 'added' : 'modified';
    next = [
      {
        field_path: 'summary',
        field_type: 'summary',
        change_type,
        original_value: orig || undefined,
        new_value: nw || undefined,
        confidence: 'medium',
      },
      ...detailedChanges,
    ];
  }
  return next;
}

function inferFieldTypeForManifestPath(rawPath: string): ResumeFieldDiff['field_type'] | null {
  const canonical = normalizeComparablePath(rawPath);
  const pl = rawPath.trim().toLowerCase();

  if (canonical === 'summary') return 'summary';
  if (canonical === 'bold_keywords') return 'bold_keywords';
  if (canonical === 'skills.groups') return 'additional_group';
  if (/skills\.groups\[[^\]]+\]\.values$/i.test(pl)) return 'additional_item';

  if (/^personalinfo\./i.test(pl)) return 'personal_info';

  if (/personalprojects\[\d+\]\.name$/i.test(pl)) return 'project_title';
  if (/personalprojects\[\d+\]\.(?:techstack|tech_stacks|summary|role)$/i.test(pl)) return 'project';
  if (/personalprojects\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';

  if (/workexperience\[\d+\]\.(?:company|(?:start|end)(?:_|)?date(?:s)?)$/i.test(pl)) {
    return 'experience';
  }
  if (/workexperience\[\d+\]\.(?:position|title)$/i.test(pl)) return 'experience_title';
  if (/workexperience\[\d+\]\.(?:techstack|tech_stacks|summary)$/i.test(pl)) return 'experience';
  if (/workexperience\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';

  if (/education\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';
  if (/^education\[\d+\]$/i.test(pl)) return 'education';
  if (/education\[\d+\]\.(?:degree|area|institution|date|years|start_date|end_date|startdate|enddate)$/i.test(pl)) {
    return 'education';
  }

  return null;
}

function augmentChangesFromManifestOnlyPaths(
  detailedChanges: ResumeFieldDiff[],
  changeManifest?: ResumeChange[]
): ResumeFieldDiff[] {
  if (!changeManifest?.length) {
    return detailedChanges;
  }

  const extras: ResumeFieldDiff[] = [];

  const alreadyHas = (path: string): boolean =>
    detailedChanges.some((d) => pathsMatchForManifest(d.field_path, path)) ||
    extras.some((e) => pathsMatchForManifest(e.field_path, path));

  for (const row of changeManifest) {
    const p = row.path.trim();
    if (!p || alreadyHas(p)) continue;

    const field_type = inferFieldTypeForManifestPath(p);
    if (!field_type) continue;

    const reasonStr = typeof row.reason === 'string' ? row.reason.trim() : '';

    const orig = typeof row.original === 'string' ? row.original.trim() : '';
    const next = stringifyManifestValue(row.value).trim();

    if (!orig && !next && !reasonStr) continue;

    const change_type: ResumeFieldDiff['change_type'] = orig && !next
      ? 'removed'
      : !orig && next
        ? 'added'
        : 'modified';

    extras.push({
      field_path: p,
      field_type,
      change_type,
      original_value: orig || undefined,
      new_value: next || undefined,
      confidence: 'medium',
    });
  }

  if (!extras.length) {
    return detailedChanges;
  }
  return [...detailedChanges, ...extras];
}

function experienceRowHeading(resumePreview: ResumePreview | null | undefined, index: number): string {
  const exp = resumePreview?.workExperience?.[index];
  if (!exp) return `Experience ${index + 1}`;
  const title = exp.title?.trim();
  const company = exp.company?.trim();
  if (company && title) return `${company} — ${title}`;
  return company || title || `Experience ${index + 1}`;
}

function projectRowHeading(resumePreview: ResumePreview | null | undefined, index: number): string {
  const proj = resumePreview?.personalProjects?.[index];
  const name = proj?.name?.trim();
  return name || `Project ${index + 1}`;
}

function educationRowHeading(resumePreview: ResumePreview | null | undefined, index: number): string {
  const ed = resumePreview?.education?.[index];
  const institution = ed?.institution?.trim();
  const degree = ed?.degree?.trim();
  if (institution && degree) return `${institution} — ${degree}`;
  return institution || degree || `Education ${index + 1}`;
}

function ExperienceSectionTitle({
  resumePreview,
  index,
}: {
  resumePreview: ResumePreview | null | undefined;
  index: number;
}): ReactNode {
  const exp = resumePreview?.workExperience?.[index];
  if (!exp) {
    return (
      <span className="text-sm font-semibold text-slate-900">Experience {index + 1}</span>
    );
  }
  const company = exp.company?.trim();
  const title = exp.title?.trim();
  if (!company && !title) {
    return (
      <span className="text-sm font-semibold text-slate-900">Experience {index + 1}</span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-px">
      {company ? (
        <span className="text-base font-semibold tracking-tight text-slate-900">{company}</span>
      ) : null}
      {title ? (
        <span
          className={`text-[13px] font-normal text-slate-500 ${
            !company ? 'text-base font-semibold text-slate-900' : ''
          }`}
        >
          {title}
        </span>
      ) : null}
    </span>
  );
}

function ProjectSectionTitle({
  resumePreview,
  index,
}: {
  resumePreview: ResumePreview | null | undefined;
  index: number;
}): ReactNode {
  const proj = resumePreview?.personalProjects?.[index];
  const name = proj?.name?.trim();
  return (
    <span className="text-base font-semibold tracking-tight text-slate-900">
      {name || `Project ${index + 1}`}
    </span>
  );
}

function EducationSectionTitle({
  resumePreview,
  index,
}: {
  resumePreview: ResumePreview | null | undefined;
  index: number;
}): ReactNode {
  const ed = resumePreview?.education?.[index];
  const institution = ed?.institution?.trim();
  const degree = ed?.degree?.trim();
  if (!institution && !degree) {
    return (
      <span className="text-sm font-semibold text-slate-900">Education {index + 1}</span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-px">
      {institution ? (
        <span className="text-[15px] font-semibold text-slate-900">{institution}</span>
      ) : null}
      {degree ? (
        <span
          className={`text-[13px] text-slate-500 ${
            institution ? 'font-normal' : 'text-base font-semibold text-slate-900'
          }`}
        >
          {degree}
        </span>
      ) : null}
    </span>
  );
}

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
    case 'bold_keywords':
      return { section: 'keywords' };
    case 'personal_info':
      return { section: 'personal' };
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
      if (educationIndex !== undefined) {
        return { section: 'education', entryIndex: educationIndex, bulletIndex };
      }
      return { section: 'other', bulletIndex };
    case 'additional_item':
    case 'additional_group':
      return { section: 'skills' };
    default:
      return { section: 'other' };
  }
}

function buildContextLabel(
  change: ResumeFieldDiff,
  parsed: ParsedChangePath,
  resumePreview?: ResumePreview | null
): string {
  const groupId = change.field_path.match(/skills\.groups\[([^\]]+)\]/)?.[1];

  switch (parsed.section) {
    case 'summary':
      return 'Resume summary';
    case 'keywords':
      return 'Bold keywords';
    case 'personal': {
      const key = change.field_path.replace(/^personalInfo\./i, '');
      const human: Record<string, string> = {
        name: 'Name',
        title: 'Headline title',
        email: 'Email',
        phone: 'Phone',
        location: 'Location',
        website: 'Website',
        linkedin: 'LinkedIn',
        github: 'GitHub',
      };
      return human[key] ?? key;
    }
    case 'experience': {
      const idx = parsed.entryIndex ?? 0;
      const labelBase = resumePreview ? experienceRowHeading(resumePreview, idx) : null;
      const n = idx + 1;
      if (change.field_path.toLowerCase().includes('.techstack')) {
        return labelBase ? `${labelBase} — tech stack` : `Experience ${n} tech stack`;
      }
      if (change.field_type === 'experience_title') {
        return labelBase ? `${labelBase} — role title` : `Experience ${n} role`;
      }
      if (change.field_type === 'description') {
        return `Bullet ${(parsed.bulletIndex ?? 0) + 1}`;
      }
      return labelBase ?? `Experience ${n} entry`;
    }
    case 'project': {
      const idx = parsed.entryIndex ?? 0;
      const labelBase = resumePreview ? projectRowHeading(resumePreview, idx) : null;
      const n = idx + 1;
      if (change.field_path.toLowerCase().includes('.techstack')) {
        return labelBase ? `${labelBase} — tech stack` : `Project ${n} tech stack`;
      }
      if (change.field_type === 'project_title') {
        return labelBase ? `${labelBase} — name` : `Project ${n} name`;
      }
      if (change.field_type === 'description') {
        return `Bullet ${(parsed.bulletIndex ?? 0) + 1}`;
      }
      return labelBase ?? `Project ${n} entry`;
    }
    case 'education': {
      if (change.field_type === 'description') {
        return `Bullet ${(parsed.bulletIndex ?? 0) + 1}`;
      }
      return resumePreview
        ? educationRowHeading(resumePreview, parsed.entryIndex ?? 0)
        : `Education ${(parsed.entryIndex ?? 0) + 1} entry`;
    }
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
  includeSystemCleanupNotes: boolean,
  resumePreview?: ResumePreview | null
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

    let bestScore = exactCandidate ? 4 : 0;

    if (!exactCandidate) {
      for (const candidate of manifestCandidates) {
        const score = matchScore(canonicalDiffPath, candidate.canonicalPath);
        if (score > bestScore) {
          bestScore = score;
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
      if (aiValue && normalizeTextForCompare(aiValue) !== normalizeTextForCompare(finalText)) {
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

    let aiRationale: string | undefined;
    if (exactCandidate?.raw.reason?.trim()) {
      aiRationale = exactCandidate.raw.reason.trim();
    }

    const semanticUnchanged =
      change.change_type === 'modified' &&
      normalizeTextForCompare(change.original_value ?? '') ===
        normalizeTextForCompare(change.new_value ?? '');

    return {
      change,
      source,
      contextLabel: buildContextLabel(change, parsed, resumePreview),
      needsVerification: isVerificationChange(change),
      semanticUnchanged,
      parsed,
      cleanupNote,
      aiRationale,
    };
  });
}

function compareWithinEntry(a: DisplayChange, b: DisplayChange): number {
  const fieldPriority = (item: DisplayChange): number => {
    const fp = item.change.field_path.toLowerCase();
    switch (item.change.field_type) {
      case 'experience_title':
      case 'project_title':
        return 0;
      case 'experience':
      case 'project':
        if (fp.includes('.techstack') || fp.includes('.tech_stack')) return 1;
        return 3;
      case 'description':
        return 2;
      case 'education':
        return 3;
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

function buildOrderedSections(
  displayChanges: DisplayChange[],
  resumePreview?: ResumePreview | null
): OrderedSection[] {
  const sections: OrderedSection[] = [];

  const summaryItems = displayChanges.filter((item) => item.parsed.section === 'summary');
  if (summaryItems.length > 0) {
    sections.push({
      key: 'summary',
      title: (
        <span className="text-sm font-semibold text-slate-900">Professional summary</span>
      ),
      items: summaryItems,
    });
  }

  const keywordItems = displayChanges.filter((item) => item.parsed.section === 'keywords');
  if (keywordItems.length > 0) {
    sections.push({
      key: 'keywords',
      title: <span className="text-sm font-semibold text-slate-900">Bold keywords</span>,
      items: keywordItems.sort((a, b) =>
        a.change.field_path.localeCompare(b.change.field_path)
      ),
    });
  }

  const personalItems = displayChanges.filter((item) => item.parsed.section === 'personal');
  if (personalItems.length > 0) {
    sections.push({
      key: 'personal',
      title: <span className="text-sm font-semibold text-slate-900">Contact</span>,
      items: personalItems.sort((a, b) =>
        a.change.field_path.localeCompare(b.change.field_path)
      ),
    });
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
    sections.push({
      key: `experience-${index}`,
      title: <ExperienceSectionTitle resumePreview={resumePreview} index={index} />,
      items,
    });
  }

  const projectIndices = Array.from(
    new Set(
      displayChanges
        .filter(
          (item) => item.parsed.section === 'project' && item.parsed.entryIndex !== undefined
        )
        .map((item) => item.parsed.entryIndex as number)
    )
  ).sort((a, b) => a - b);

  for (const index of projectIndices) {
    const items = displayChanges
      .filter((item) => item.parsed.section === 'project' && item.parsed.entryIndex === index)
      .sort(compareWithinEntry);
    sections.push({
      key: `project-${index}`,
      title: <ProjectSectionTitle resumePreview={resumePreview} index={index} />,
      items,
    });
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
    sections.push({
      key: `education-${index}`,
      title: <EducationSectionTitle resumePreview={resumePreview} index={index} />,
      items,
    });
  }

  const skillsItems = displayChanges
    .filter((item) => item.parsed.section === 'skills')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (skillsItems.length > 0) {
    sections.push({
      key: 'skills',
      title: <span className="text-sm font-semibold text-slate-900">Skills</span>,
      items: skillsItems,
    });
  }

  const otherItems = displayChanges
    .filter((item) => item.parsed.section === 'other')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (otherItems.length > 0) {
    sections.push({
      key: 'other',
      title: <span className="text-sm font-semibold text-slate-900">Other</span>,
      items: otherItems,
    });
  }

  return sections;
}

/** Trim a shared prefix/suffix inside two strings (character-level). */
function refineCharacterFocus(
  before: string,
  after: string
): { oldFragment: string; newFragment: string } {
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

function displayValuesForModifiedField(
  original: string | null | undefined,
  next: string | null | undefined
) {
  const o = original ?? '';
  const n = next ?? '';
  const focused = extractFocusedWordChange(o, n);
  if (!focused) {
    return { before: o || '(empty)', after: n || '(empty)' };
  }
  return { before: focused.oldFragment, after: focused.newFragment };
}

export interface TailorDiffReadonlyBodyProps {
  detailedChanges: ResumeFieldDiff[];
  changeManifest?: ResumeChange[];
  changeBreakdown?: TailoringStageBreakdown | null;
  artifacts?: ArtifactSummary[];
  artifactGalleryTitle?: string;
  errorMessage?: string;
  emptyFallback?: ReactNode;
  /** Tailored preview (improved snapshot) — used for human-readable section titles. */
  resumePreview?: ResumePreview | null;
  /** Deterministic chip tags (+/−/moved/unchanged) + sparse LLM whys. */
  skillsObservation?: SkillsObservationPayload | Record<string, unknown> | null;
}

export function TailorDiffReadonlyBody({
  detailedChanges,
  changeManifest,
  changeBreakdown,
  artifacts,
  artifactGalleryTitle = 'Preview Snapshot',
  errorMessage,
  emptyFallback,
  resumePreview = null,
  skillsObservation = null,
}: TailorDiffReadonlyBodyProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showMetaDetails, setShowMetaDetails] = useState(false);

  const skillsObsNormalized = useMemo(
    () => coerceSkillsObservationPayload(skillsObservation),
    [skillsObservation]
  );

  const mergedDetailedChanges = useMemo(() => {
    let next = augmentDetailedChangesFromManifest(detailedChanges, changeManifest);
    next = augmentChangesFromManifestOnlyPaths(next, changeManifest);
    return next;
  }, [detailedChanges, changeManifest]);

  const skillsAggregateRationale = useMemo(
    () => changeManifest?.find((c) => c.path === 'skills.groups')?.reason?.trim(),
    [changeManifest]
  );

  const displayChanges = useMemo(
    () =>
      mergedDetailedChanges?.length
        ? buildDisplayChanges(
            mergedDetailedChanges,
            changeManifest,
            (changeBreakdown?.cleanup_only_changes ?? 0) > 0,
            resumePreview
          )
        : [],
    [
      changeBreakdown?.cleanup_only_changes,
      changeManifest,
      mergedDetailedChanges,
      resumePreview,
    ]
  );

  const orderedSections = useMemo(
    () => buildOrderedSections(displayChanges, resumePreview),
    [displayChanges, resumePreview]
  );

  useEffect(() => {
    if (orderedSections.length === 0) {
      return;
    }
    setExpandedSections(new Set(orderedSections.map((section) => section.key)));
  }, [orderedSections]);

  const toggleSection = useCallback((sectionKey: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionKey)) {
        next.delete(sectionKey);
      } else {
        next.add(sectionKey);
      }
      return next;
    });
  }, []);

  if (!mergedDetailedChanges.length) {
    if (emptyFallback) {
      return <>{emptyFallback}</>;
    }
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-white px-4 py-8 text-center text-[13px] text-slate-600">
        No line-level tailoring changes recorded for this view.
      </div>
    );
  }

  const stats = {
    total: displayChanges.length,
    summaryChanged: displayChanges.filter((item) => item.parsed.section === 'summary').length,
    personalChanged: displayChanges.filter((item) => item.parsed.section === 'personal').length,
    experienceChanged: displayChanges.filter((item) => item.parsed.section === 'experience').length,
    educationChanged: displayChanges.filter((item) => item.parsed.section === 'education').length,
    projectChanged: displayChanges.filter((item) => item.parsed.section === 'project').length,
    keywordRows: displayChanges.filter((item) => item.parsed.section === 'keywords').length,
    unchangedSemantics: displayChanges.filter((item) => item.semanticUnchanged).length,
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

  return (
    <>
      <div className="mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 text-[13px] text-slate-600">
          <p className="m-0 min-w-[12rem]">
            <span className="tabular-nums text-lg font-semibold text-slate-900">{stats.total}</span>{' '}
            <span className="text-slate-500">
              row{stats.total === 1 ? '' : 's'} changed
            </span>
            {stats.verify > 0 ? (
              <span className="ml-3 inline-flex items-center gap-1 text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {stats.verify} to verify
              </span>
            ) : null}
          </p>
          <Button
            variant="ghost"
            size="xs"
            className="text-slate-600"
            onClick={() => setShowMetaDetails((value) => !value)}
          >
            {showMetaDetails ? 'Hide breakdown' : 'Breakdown'}
          </Button>
        </div>
        {showMetaDetails ? (
          <div className="flex flex-wrap gap-1.5 pt-2">
            <InlineStat label="Summary" value={stats.summaryChanged} variant="info" />
            <InlineStat label="Keywords" value={stats.keywordRows} variant="info" />
            <InlineStat label="Contact" value={stats.personalChanged} variant="info" />
            <InlineStat label="Experience" value={stats.experienceChanged} variant="info" />
            <InlineStat label="Projects" value={stats.projectChanged} variant="info" />
            <InlineStat label="Education" value={stats.educationChanged} variant="info" />
            <InlineStat label="Skills +" value={stats.skillsAdded} variant="success" />
            <InlineStat label="Skills −" value={stats.skillsRemoved} variant="danger" />
            <InlineStat label="Model-attributed rows" value={stats.ai} variant="success" />
            <InlineStat label="Cleanup / other rows" value={stats.system} variant="warning" />
            <InlineStat label="Unchanged (with note)" value={stats.unchangedSemantics} variant="info" />
            <InlineStat label="Skills verify" value={stats.verify} variant="warning" />
          </div>
        ) : null}
      </div>

      {errorMessage && (
        <div className="mt-3 whitespace-pre-wrap rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      <div className="mt-3 space-y-2 pb-2">
        {artifacts && artifacts.length > 0 && (
          <ArtifactGallery artifacts={artifacts} title={artifactGalleryTitle} />
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
              <SkillsGroupedView
                items={section.items}
                aggregateRationale={skillsAggregateRationale}
                observation={skillsObsNormalized}
              />
            ) : (
              section.items.map((item, index) => (
                <ChangeItem key={`${section.key}-${index}`} item={item} />
              ))
            )}
          </ChangeSection>
        ))}
      </div>
    </>
  );
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
  skillsObservation = null,
  errorMessage,
  resumePreview = null,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();

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
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden border border-slate-200 bg-white p-0 shadow-lg">
          <DialogHeader className="shrink-0 border-b border-slate-100 px-5 py-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-slate-900">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 text-[13px] leading-relaxed text-slate-700">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="flex items-start gap-2 px-5 pb-1 text-[12px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="mt-auto flex justify-end gap-2 border-t border-slate-100 px-5 py-3">
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

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[95vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden border border-slate-200 bg-slate-50 p-0 shadow-xl">
        <DialogHeader className="shrink-0 border-b border-slate-200 bg-white px-4 py-3 sm:px-5">
          <DialogTitle className="text-base font-semibold tracking-tight text-slate-900">
            {t('tailor.diffModal.title')}
          </DialogTitle>
          <p className="mt-0.5 text-[12px] text-slate-500">Reads top-to-bottom like your résumé.</p>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 pt-3 sm:px-4">
          <TailorDiffReadonlyBody
            detailedChanges={detailedChanges}
            changeManifest={changeManifest}
            changeBreakdown={changeBreakdown ?? null}
            artifacts={artifacts}
            errorMessage={errorMessage}
            resumePreview={resumePreview}
            skillsObservation={skillsObservation}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-5">
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
              className="gap-2 bg-emerald-700 hover:bg-emerald-800"
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
    success: 'border-emerald-200 bg-emerald-50/70 text-emerald-900',
    warning: 'border-amber-200 bg-amber-50/70 text-amber-900',
    danger: 'border-red-200 bg-red-50/70 text-red-900',
    info: 'border-slate-200 bg-slate-50 text-slate-800',
  };

  return (
    <div
      className={`flex items-center gap-2 rounded px-2 py-1 text-[11px] leading-none ${colors[variant]}`}
    >
      <span className="tabular-nums font-semibold">{value}</span>
      <span className="opacity-85">{label}</span>
    </div>
  );
}

interface ChangeSectionProps {
  title: React.ReactNode;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function ChangeSection({ title, count, isExpanded, onToggle, children }: ChangeSectionProps) {
  return (
    <section className="rounded-lg border border-slate-200/90 bg-white">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-slate-50"
      >
        <span className="flex min-w-0 flex-1 items-start gap-2">
          {isExpanded ? (
            <ChevronDown className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          ) : (
            <ChevronRight className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          )}
          <span className="min-w-0 flex-1 text-[15px] leading-snug">{title}</span>
        </span>
        <span className="shrink-0 tabular-nums text-xs font-medium text-slate-400">{count}</span>
      </button>

      {isExpanded ? (
        <div className="divide-y divide-slate-100 border-t border-slate-100">{children}</div>
      ) : null}
    </section>
  );
}

function ChangeItem({ item }: { item: DisplayChange }) {
  const { change } = item;
  const bulletPos =
    item.parsed.bulletIndex !== undefined && change.field_type === 'description'
      ? item.parsed.bulletIndex + 1
      : null;

  const unchangedFlag = item.semanticUnchanged;

  const rowTone = unchangedFlag
    ? 'border-l-slate-300 bg-slate-50/50'
    : change.change_type === 'added'
      ? 'border-l-emerald-500 bg-emerald-50/25'
      : change.change_type === 'removed'
        ? 'border-l-red-500 bg-red-50/25'
        : 'border-l-slate-400 bg-white';

  const rationaleBlock =
    item.aiRationale && item.aiRationale.length > 0 ? (
      <details open className="rounded-md border border-slate-100 bg-white px-2 py-1.5 text-[12px] text-slate-600">
        <summary className="cursor-pointer select-none text-[11px] font-medium text-slate-600">
          Model note
        </summary>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] text-slate-800">
          {item.aiRationale}
        </p>
      </details>
    ) : null;

  const attributionHint =
    unchangedFlag ? 'unchanged' : item.source === 'system'
      ? 'post-tailor delta'
      : item.needsVerification ? 'verify' : null;

  const displayLine =
    (change.original_value ?? change.new_value)?.trim() || '';

  const bodyContent = (
    <>
      {rationaleBlock ? <div>{rationaleBlock}</div> : null}

      {change.change_type === 'added' && change.new_value && (
        <DiffValueBox label="New" value={change.new_value} tone="added" />
      )}

      {change.change_type === 'removed' && change.original_value && (
        <DiffValueBox label="Removed" value={change.original_value} tone="removed" />
      )}

      {change.change_type === 'modified' &&
        (unchangedFlag ? (
          displayLine ? (
            <DiffValueBox label="Resume text (unchanged)" value={displayLine} tone="system" />
          ) : (
            <p className="text-[13px] leading-snug text-slate-600">
              No textual change on this row — retained as-is.
            </p>
          )
        ) : (
          (() => {
            const { before, after } = displayValuesForModifiedField(
              change.original_value,
              change.new_value
            );
            return (
              <div className="grid grid-cols-1 gap-1.5 sm:gap-2 md:grid-cols-2">
                <DiffValueBox label="Before" value={before} tone="removed" />
                <DiffValueBox label="After" value={after} tone="added" />
              </div>
            );
          })()
        ))}

      {item.cleanupNote && !unchangedFlag ? (
        <div className="rounded-md border border-amber-100 bg-amber-50/60 px-2 py-1.5 text-[12px] text-amber-950">
          <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800/85">
            Post-tailor tweak
          </p>
          <p className="mt-1 leading-snug">
            − {item.cleanupNote.oldFragment}
            <span className="mx-2 text-slate-400">→</span>+ {item.cleanupNote.newFragment}
          </p>
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`border-l-[3px] px-2.5 py-1.5 sm:px-3 sm:py-2 ${rowTone}`}>
      <div className="flex items-start gap-2">
        {bulletPos !== null ? (
          <span
            className="w-11 shrink-0 pt-0.5 text-center text-xl font-semibold tabular-nums tracking-tight text-slate-900 sm:text-[1.35rem]"
            aria-label={`Bullet ${bulletPos}`}
          >
            #{bulletPos}
          </span>
        ) : null}
        <div className="min-w-0 flex-1 space-y-1.5">
          {bulletPos === null ? (
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium text-slate-900">{item.contextLabel}</span>
                {unchangedFlag ? (
                  <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-violet-900">
                    same text
                  </span>
                ) : null}
              </span>
              {attributionHint ? (
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">
                  {attributionHint}
                </span>
              ) : unchangedFlag ? null : (
                <span className="sr-only">
                  Attributed to {item.source === 'ai' ? 'model' : 'cleanup'}
                </span>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 gap-y-1">
              {unchangedFlag ? (
                <span className="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-violet-900">
                  same text
                </span>
              ) : attributionHint ? (
                <span className="text-[10px] uppercase tracking-wide text-slate-400">{attributionHint}</span>
              ) : (
                <span className="sr-only">Attributed to model tailoring</span>
              )}
            </div>
          )}

          {bodyContent}
        </div>
      </div>
    </div>
  );
}

function skillObservationGlyph(changeTag: string): string {
  switch (changeTag) {
    case 'added':
      return '+';
    case 'removed':
      return '−';
    case 'moved':
      return '≈';
    case 'unchanged':
      return '●';
    default:
      return '•';
  }
}

function skillObservationTone(changeTag: string): string {
  switch (changeTag) {
    case 'added':
      return 'border-emerald-200 bg-emerald-50/70 text-emerald-950';
    case 'removed':
      return 'border-red-200 bg-red-50/70 text-red-950';
    case 'moved':
      return 'border-amber-200 bg-amber-50/70 text-amber-950';
    default:
      return 'border-slate-200 bg-slate-50/80 text-slate-800';
  }
}

function SkillsGroupedView({
  items,
  aggregateRationale,
  observation,
}: {
  items: DisplayChange[];
  aggregateRationale?: string;
  observation?: SkillsObservationPayload | null;
}) {
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

  if (observation?.groups?.length) {
    return (
      <div className="space-y-3">
        {observation.groups.map((grp) => (
          <div
            key={grp.group_id}
            className="rounded-md border border-slate-200/80 bg-white px-3 py-2 shadow-sm shadow-slate-900/5"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[13px] font-semibold text-slate-900">{grp.group_label || grp.group_id}</p>
              <span className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                {grp.group_id}
              </span>
            </div>
            {grp.group_why ? (
              <p className="mt-1 text-[12px] leading-snug text-slate-700">{grp.group_why}</p>
            ) : null}
            <div className="mt-2 space-y-1.5">
              {grp.values.map((cell, ix) => (
                <div
                  key={`${grp.group_id}-v-${ix}`}
                  className={`flex flex-wrap items-start gap-2 rounded border px-2 py-1.5 text-[12px] leading-snug ${skillObservationTone(
                    typeof cell.change_tag === 'string' ? cell.change_tag : ''
                  )}`}
                >
                  <span className="min-w-[1.25rem] font-semibold tabular-nums">
                    {skillObservationGlyph(typeof cell.change_tag === 'string' ? cell.change_tag : '')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{cell.text}</span>
                    {cell.why ? (
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-[11px] opacity-90">
                        {cell.why}
                      </p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-70">
                    {cell.change_tag}
                  </span>
                </div>
              ))}
            </div>
            {(grp.removed?.length ?? 0) > 0 ? (
              <div className="mt-2 border-t border-slate-100 pt-2">
                <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Removed</p>
                <div className="mt-1 space-y-1">
                  {(grp.removed ?? []).map((r, ix) => (
                    <div
                      key={`${grp.group_id}-r-${ix}`}
                      className="flex items-center gap-2 rounded border border-red-100 bg-red-50/60 px-2 py-1 text-[12px] text-red-900"
                    >
                      <span className="font-semibold">−</span>
                      <span>{r.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {aggregateRationale ? (
        <details open className="rounded-md border border-slate-200 bg-slate-50/80 px-3 py-2">
          <summary className="cursor-pointer text-[12px] font-medium text-slate-700">
            Skills — model note
          </summary>
          <p className="mt-2 whitespace-pre-wrap break-words text-[13px] text-slate-700">
            {aggregateRationale}
          </p>
        </details>
      ) : null}
      {grouped.map((entry) => (
        <div key={entry.group} className="rounded-md border border-slate-200/80 bg-white px-3 py-2">
          <p className="text-[13px] font-semibold text-slate-900">{entry.group}</p>
          <div className="mt-1.5 space-y-1 text-[12px] leading-snug">
            {entry.added.length > 0 && (
              <p className="text-emerald-800">
                <span className="font-medium">+</span> {entry.added.join(', ')}
              </p>
            )}
            {entry.removed.length > 0 && (
              <p className="text-red-800">
                <span className="font-medium">−</span> {entry.removed.join(', ')}
              </p>
            )}
            {entry.modified.length > 0 && (
              <p className="text-sky-950">
                <span className="font-medium">±</span> {entry.modified.join(' · ')}
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
      ? 'border-emerald-200/90 bg-white text-emerald-950'
      : tone === 'removed'
        ? 'border-red-200/90 bg-white text-red-950'
        : 'border-amber-200/90 bg-white text-amber-950';

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[13px] leading-snug ${toneClass}`}>
      <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="whitespace-pre-wrap break-words text-slate-900">{value || '(empty)'}</p>
    </div>
  );
}
