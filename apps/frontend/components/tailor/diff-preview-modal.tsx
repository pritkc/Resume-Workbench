'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Wrench,
  X,
} from 'lucide-react';
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
import { cn } from '@/lib/utils';

/** One sans stack + scale for the whole diff pane. */
const DIFF_FONT = 'font-sans antialiased';
const DIFF_BODY = `${DIFF_FONT} text-[15px] font-medium leading-[1.55] text-neutral-900`;
const DIFF_BODY_SM = `${DIFF_FONT} text-[13px] font-medium leading-snug text-neutral-800`;
const DIFF_CATEGORY = `${DIFF_FONT} mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em] text-neutral-500 first:mt-0`;

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
  warnings?: string[];
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
  jumpLabel: string;
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
  if (/personalprojects\[\d+\]\.(?:techstack|tech_stacks|summary|role)$/i.test(pl))
    return 'project';
  if (/personalprojects\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';

  if (/workexperience\[\d+\]\.(?:company|(?:start|end)(?:_|)?date(?:s)?)$/i.test(pl)) {
    return 'experience';
  }
  if (/workexperience\[\d+\]\.(?:position|title)$/i.test(pl)) return 'experience_title';
  if (/workexperience\[\d+\]\.(?:techstack|tech_stacks|summary)$/i.test(pl)) return 'experience';
  if (/workexperience\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';

  if (/education\[\d+\]\.description\[\d+\]$/i.test(pl)) return 'description';
  if (/^education\[\d+\]$/i.test(pl)) return 'education';
  if (
    /education\[\d+\]\.(?:degree|area|institution|date|years|start_date|end_date|startdate|enddate)$/i.test(
      pl
    )
  ) {
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

    const change_type: ResumeFieldDiff['change_type'] =
      orig && !next ? 'removed' : !orig && next ? 'added' : 'modified';

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

function experienceRowHeading(
  resumePreview: ResumePreview | null | undefined,
  index: number
): string {
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

function isTechStackPath(path: string): boolean {
  const p = path.toLowerCase();
  return p.includes('.techstack') || p.includes('.tech_stack');
}

function ExperienceSectionTitle({
  resumePreview,
  index,
}: {
  resumePreview: ResumePreview | null | undefined;
  index: number;
}): ReactNode {
  const exp = resumePreview?.workExperience?.[index];
  const company = exp?.company?.trim();
  return <span>{company || `Experience ${index + 1}`}</span>;
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
  return <span>{name || `Project ${index + 1}`}</span>;
}

function educationRowHeading(
  resumePreview: ResumePreview | null | undefined,
  index: number
): string {
  const ed = resumePreview?.education?.[index];
  const institution = ed?.institution?.trim();
  const degree = ed?.degree?.trim();
  if (institution && degree) return `${institution} — ${degree}`;
  return institution || degree || `Education ${index + 1}`;
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
  return <span>{institution || `Education ${index + 1}`}</span>;
}

type SectionCategory =
  | 'summary'
  | 'contact'
  | 'keywords'
  | 'experience'
  | 'projects'
  | 'education'
  | 'skills'
  | 'other';

function sectionCategoryFromKey(sectionKey: string): SectionCategory {
  if (sectionKey === 'summary') return 'summary';
  if (sectionKey.startsWith('experience-')) return 'experience';
  if (sectionKey.startsWith('project-')) return 'projects';
  if (sectionKey === 'skills') return 'skills';
  if (sectionKey.startsWith('education-')) return 'education';
  if (sectionKey === 'personal') return 'contact';
  if (sectionKey === 'keywords') return 'keywords';
  return 'other';
}

const CATEGORY_TITLE: Record<SectionCategory, string> = {
  summary: 'Summary',
  experience: 'Experience',
  projects: 'Projects',
  skills: 'Skills',
  education: 'Education',
  contact: 'Contact',
  keywords: 'Keywords',
  other: 'Other',
};

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
        return 'Tech stack';
      }
      if (change.field_type === 'experience_title') {
        return 'Role title';
      }
      if (change.field_type === 'description') {
        return `Bullet ${(parsed.bulletIndex ?? 0) + 1}`;
      }
      return labelBase ? 'Entry details' : `Experience ${n}`;
    }
    case 'project': {
      const idx = parsed.entryIndex ?? 0;
      const labelBase = resumePreview ? projectRowHeading(resumePreview, idx) : null;
      const n = idx + 1;
      if (change.field_path.toLowerCase().includes('.techstack')) {
        return 'Tech stack';
      }
      if (change.field_type === 'project_title') {
        return 'Project name';
      }
      if (change.field_type === 'description') {
        return `Bullet ${(parsed.bulletIndex ?? 0) + 1}`;
      }
      return labelBase ? 'Project details' : `Project ${n}`;
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
      title: <span>Professional summary</span>,
      jumpLabel: 'Professional summary',
      items: summaryItems,
    });
  }

  const personalItems = displayChanges.filter((item) => item.parsed.section === 'personal');
  if (personalItems.length > 0) {
    sections.push({
      key: 'personal',
      title: <span>Contact</span>,
      jumpLabel: 'Contact',
      items: personalItems.sort((a, b) => a.change.field_path.localeCompare(b.change.field_path)),
    });
  }

  const keywordItems = displayChanges.filter((item) => item.parsed.section === 'keywords');
  if (keywordItems.length > 0) {
    sections.push({
      key: 'keywords',
      title: <span>Bold keywords</span>,
      jumpLabel: 'Bold keywords',
      items: keywordItems.sort((a, b) => a.change.field_path.localeCompare(b.change.field_path)),
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
    const company = resumePreview?.workExperience?.[index]?.company?.trim();
    sections.push({
      key: `experience-${index}`,
      title: <ExperienceSectionTitle resumePreview={resumePreview} index={index} />,
      jumpLabel: company || `Experience ${index + 1}`,
      items,
    });
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
    const projectName = resumePreview?.personalProjects?.[index]?.name?.trim();
    sections.push({
      key: `project-${index}`,
      title: <ProjectSectionTitle resumePreview={resumePreview} index={index} />,
      jumpLabel: projectName || `Project ${index + 1}`,
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
    const institution = resumePreview?.education?.[index]?.institution?.trim();
    sections.push({
      key: `education-${index}`,
      title: <EducationSectionTitle resumePreview={resumePreview} index={index} />,
      jumpLabel: institution || `Education ${index + 1}`,
      items,
    });
  }

  const skillsItems = displayChanges
    .filter((item) => item.parsed.section === 'skills')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (skillsItems.length > 0) {
    sections.push({
      key: 'skills',
      title: <span>Skills</span>,
      jumpLabel: 'Skills',
      items: skillsItems,
    });
  }

  const otherItems = displayChanges
    .filter((item) => item.parsed.section === 'other')
    .sort((a, b) => a.change.field_path.localeCompare(b.change.field_path));
  if (otherItems.length > 0) {
    sections.push({
      key: 'other',
      title: <span>Other</span>,
      jumpLabel: 'Other',
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
  warnings?: string[];
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
  warnings = [],
  errorMessage,
  emptyFallback,
  resumePreview = null,
  skillsObservation = null,
}: TailorDiffReadonlyBodyProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [showMetaDetails, setShowMetaDetails] = useState(false);
  const [activeJumpKey, setActiveJumpKey] = useState<string | null>(null);

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
    [changeBreakdown?.cleanup_only_changes, changeManifest, mergedDetailedChanges, resumePreview]
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
      <div className="rounded-sm border border-dashed border-neutral-300 bg-card px-4 py-8 text-center text-[15px] font-medium leading-relaxed text-neutral-600">
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
      <div className="mb-5 rounded-sm border border-neutral-200 bg-neutral-50/80 px-3 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={cn('m-0 min-w-0 leading-snug text-neutral-800', DIFF_BODY)}>
              <span className="tabular-nums text-xl font-bold text-neutral-950">{stats.total}</span>{' '}
              <span className="font-semibold text-neutral-700">
                row{stats.total === 1 ? '' : 's'} changed
              </span>
              {stats.verify > 0 ? (
                <span className="ml-2 inline-flex items-center gap-1 rounded-sm border border-amber-700/30 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {stats.verify} to
                  verify
                </span>
              ) : null}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <InlineStat label="From model" value={stats.ai} variant="success" />
              <InlineStat label="Cleanup / checks" value={stats.system} variant="warning" />
              <InlineStat label="Resume areas" value={orderedSections.length} variant="info" />
            </div>
          </div>
          <Button
            variant="outline"
            size="xs"
            className="border-[#1f2328] bg-card text-foreground shadow-none hover:bg-[#f6f8fa]"
            onClick={() => setShowMetaDetails((value) => !value)}
          >
            {showMetaDetails ? 'Hide breakdown' : 'Breakdown'}
          </Button>
        </div>
        {showMetaDetails ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
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
            <InlineStat
              label="Unchanged (with note)"
              value={stats.unchangedSemantics}
              variant="info"
            />
            <InlineStat label="Skills verify" value={stats.verify} variant="warning" />
          </div>
        ) : null}
      </div>

      {errorMessage && (
        <div className="mt-3 whitespace-pre-wrap rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-[13px] leading-snug text-red-950">
          {errorMessage}
        </div>
      )}

      {warnings.length > 0 ? (
        <div className="mt-3 rounded-sm border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-snug text-amber-950">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            Resume warnings
          </div>
          <ul className="list-disc space-y-1 pl-5">
            {warnings.map((warning, index) => (
              <li key={`${index}-${warning}`}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className={cn('w-full bg-card text-neutral-900', DIFF_BODY)}>
        <div className="mt-4 flex flex-col gap-6 pb-4">
          {artifacts && artifacts.length > 0 && (
            <ArtifactGallery artifacts={artifacts} title={artifactGalleryTitle} />
          )}

          {orderedSections.length > 1 ? (
            <DiffSectionJumpNav
              sections={orderedSections}
              activeKey={activeJumpKey}
              onJump={(key) => {
                setActiveJumpKey(key);
                setExpandedSections((prev) => new Set(prev).add(key));
                document.getElementById(`diff-section-${key}`)?.scrollIntoView({
                  behavior: 'smooth',
                  block: 'start',
                });
              }}
            />
          ) : null}

          {orderedSections.map((section, sectionIndex) => {
            const category = sectionCategoryFromKey(section.key);
            const previousCategory =
              sectionIndex > 0
                ? sectionCategoryFromKey(orderedSections[sectionIndex - 1].key)
                : null;
            const showCategory = category !== previousCategory;

            const inner =
              section.key === 'skills' ? (
                <SkillsGroupedView
                  items={section.items}
                  aggregateRationale={skillsAggregateRationale}
                  observation={skillsObsNormalized}
                />
              ) : section.key.startsWith('experience-') ? (
                <ExperienceEntryDiff items={section.items} />
              ) : section.key.startsWith('project-') ? (
                <ProjectEntryDiff items={section.items} />
              ) : section.key.startsWith('education-') ? (
                <EducationEntryDiff items={section.items} />
              ) : (
                section.items.map((item, index) => (
                  <ChangeItem key={`${section.key}-${index}`} item={item} />
                ))
              );

            return (
              <div key={section.key} id={`diff-section-${section.key}`} className="scroll-mt-2">
                {showCategory ? (
                  <h2 className={DIFF_CATEGORY}>
                    <span className="h-px min-w-4 flex-1 bg-neutral-200" aria-hidden />
                    <span>{CATEGORY_TITLE[category]}</span>
                    <span className="h-px min-w-4 flex-1 bg-neutral-200" aria-hidden />
                  </h2>
                ) : null}
                <ChangeSection
                  title={section.title}
                  sectionLabel={section.jumpLabel}
                  count={section.items.length}
                  isExpanded={expandedSections.has(section.key)}
                  onToggle={() => toggleSection(section.key)}
                >
                  {inner}
                </ChangeSection>
              </div>
            );
          })}
        </div>
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
  warnings = [],
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
        <DialogContent className="flex max-h-[90vh] max-w-5xl flex-col gap-0 overflow-hidden border border-[#1f2328] bg-card p-0 shadow-lg">
          <DialogHeader className="shrink-0 border-b border-[#d0d7de] px-5 py-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-foreground">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 text-[13px] leading-relaxed text-foreground">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="flex items-start gap-2 px-5 pb-1 text-[12px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="mt-auto flex justify-end gap-2 border-t border-[#d0d7de] px-5 py-3">
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
      <DialogContent className="flex max-h-[95vh] w-[94vw] max-w-7xl flex-col gap-0 overflow-hidden border border-[#1f2328] bg-card p-0 shadow-2xl">
        <DialogHeader className="shrink-0 border-b border-[#1f2328] bg-card px-4 py-3 sm:px-5">
          <DialogTitle className="text-lg font-bold tracking-tight text-foreground">
            {t('tailor.diffModal.title')}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-card px-4 pb-4 pt-3 sm:px-5">
          <TailorDiffReadonlyBody
            detailedChanges={detailedChanges}
            changeManifest={changeManifest}
            changeBreakdown={changeBreakdown ?? null}
            artifacts={artifacts}
            warnings={warnings}
            errorMessage={errorMessage}
            resumePreview={resumePreview}
            skillsObservation={skillsObservation}
          />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#1f2328] bg-card px-4 py-3 sm:px-5">
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isConfirming}
            className="gap-2 border-[#1f2328] bg-card text-foreground hover:bg-[#f6f8fa]"
          >
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
              className="gap-2 border border-[#1f2328] bg-[#1f883d] font-semibold text-white hover:bg-[#1a7f37]"
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
    success: 'border-[#1a7f37] bg-[#dafbe1] text-foreground',
    warning: 'border-[#9a6700] bg-[#fff8c5] text-foreground',
    danger: 'border-[#cf222e] bg-[#ffebe9] text-foreground',
    info: 'border-[#0969da] bg-[#ddf4ff] text-foreground',
  };

  return (
    <div
      className={`flex items-center gap-2 border px-2 py-1 text-xs font-medium leading-none ${colors[variant]}`}
    >
      <span className="tabular-nums font-bold">{value}</span>
      <span className="opacity-85">{label}</span>
    </div>
  );
}

function SourceBadge({ item }: { item: DisplayChange }) {
  const isCleanup = item.source === 'system';
  const isVerify = item.needsVerification;
  const label = isCleanup ? 'Cleanup change' : isVerify ? 'Needs verification' : 'Model change';
  const title = isCleanup
    ? 'Changed by deterministic cleanup or local checks after the model response'
    : isVerify
      ? 'Added by the model and worth manually verifying'
      : 'Attributed to model tailoring';
  const Icon = isCleanup ? Wrench : isVerify ? AlertTriangle : Bot;

  return (
    <span
      className={cn(
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border',
        isCleanup
          ? 'border-amber-300 bg-amber-50 text-amber-950'
          : isVerify
            ? 'border-amber-500 bg-amber-100 text-amber-950'
            : 'border-emerald-300 bg-emerald-50 text-emerald-950',
        DIFF_FONT
      )}
      title={title}
    >
      <Icon className="h-3 w-3" aria-hidden />
      <span className="sr-only">
        {label}: {title}
      </span>
    </span>
  );
}

interface ChangeSectionProps {
  title: React.ReactNode;
  sectionLabel: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function DiffSectionJumpNav({
  sections,
  activeKey,
  onJump,
}: {
  sections: OrderedSection[];
  activeKey: string | null;
  onJump: (key: string) => void;
}) {
  return (
    <div className="sticky top-0 z-20 -mx-1 mb-3 border-b border-neutral-200 bg-card/95 px-1 pb-1 backdrop-blur-sm">
      <div className="flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section) => {
          const isActive = activeKey === section.key;
          return (
            <button
              key={section.key}
              type="button"
              onClick={() => onJump(section.key)}
              aria-label={`Jump to ${section.jumpLabel}`}
              className={cn(
                'shrink-0 whitespace-nowrap border px-2 py-1 font-sans text-[11px] transition-colors',
                isActive
                  ? 'border-neutral-900 bg-neutral-900 text-white'
                  : 'border-neutral-200 bg-card text-neutral-700 hover:border-neutral-400 hover:text-neutral-950'
              )}
            >
              {section.jumpLabel}
              <span className="ml-1 tabular-nums opacity-75">{section.items.length}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ChangeSection({
  title,
  sectionLabel,
  count,
  isExpanded,
  onToggle,
  children,
}: ChangeSectionProps) {
  return (
    <section className="m-0 overflow-hidden rounded-sm border border-neutral-200 bg-card shadow-[0_1px_0_rgba(27,31,36,0.04)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${sectionLabel}`}
        className={cn(
          'flex w-full items-start justify-between gap-3 border-0 bg-neutral-50 px-2.5 py-2 text-left',
          'transition-colors hover:bg-neutral-100'
        )}
      >
        <span className="flex min-w-0 flex-1 items-start gap-2.5">
          {isExpanded ? (
            <ChevronDown
              className={cn('mt-1 size-4 shrink-0 text-neutral-400', DIFF_FONT)}
              strokeWidth={2}
              aria-hidden
            />
          ) : (
            <ChevronRight
              className={cn('mt-1 size-4 shrink-0 text-neutral-400', DIFF_FONT)}
              strokeWidth={2}
              aria-hidden
            />
          )}
          <span
            className={cn(
              'min-w-0 flex-1 text-base font-semibold leading-snug text-neutral-950',
              DIFF_FONT
            )}
          >
            {title}
          </span>
        </span>
        <span
          className={cn(
            'shrink-0 rounded-sm border border-neutral-200 bg-card px-1.5 py-0.5 text-xs font-bold tabular-nums text-neutral-500',
            DIFF_FONT
          )}
          title="Changes in this section"
        >
          {count}
        </span>
      </button>

      {isExpanded ? (
        <div className={cn('flex flex-col gap-2 px-2.5 py-2.5', DIFF_FONT)}>{children}</div>
      ) : null}
    </section>
  );
}

function RationaleNote({ text }: { text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <p
      className={cn(
        'relative mb-0 mt-2 border-l-[3px] border-sky-500/55 pl-3.5 text-[13px] font-medium leading-relaxed text-sky-900',
        DIFF_FONT
      )}
    >
      <span
        className="absolute left-0 top-[0.4em] h-1 w-1 -translate-x-[5px] rounded-full bg-sky-500/90"
        aria-hidden
      />
      {text.trim()}
    </p>
  );
}

function HighlightedRationale({ text }: { text?: string | null }) {
  if (!text?.trim()) return null;
  return (
    <p
      className={cn(
        'm-0 min-w-0 rounded-sm bg-yellow-100 px-1.5 py-0.5 text-[12px] font-semibold leading-snug text-yellow-950 ring-1 ring-yellow-300/70',
        DIFF_FONT
      )}
    >
      {text.trim()}
    </p>
  );
}

function DiffTextPair({
  before,
  after,
  rationale,
  showRationale = true,
}: {
  before?: string;
  after?: string;
  rationale?: string;
  showRationale?: boolean;
}) {
  return (
    <div className={cn('flex flex-col gap-1', DIFF_FONT)}>
      {before ? (
        <p
          className={cn(
            'm-0 text-red-900 line-through decoration-red-400/85 decoration-1',
            DIFF_BODY
          )}
        >
          {before}
        </p>
      ) : null}
      {after ? <p className={cn('m-0 text-neutral-950', DIFF_BODY)}>{after}</p> : null}
      {showRationale ? <RationaleNote text={rationale} /> : null}
    </div>
  );
}

function DiffChangeBody({
  item,
  showRationale = true,
}: {
  item: DisplayChange;
  showRationale?: boolean;
}) {
  const { change } = item;
  const unchangedFlag = item.semanticUnchanged;
  const displayLine = (change.original_value ?? change.new_value)?.trim() || '';

  return (
    <>
      {change.change_type === 'added' && change.new_value && (
        <DiffTextPair
          after={change.new_value}
          rationale={item.aiRationale}
          showRationale={showRationale}
        />
      )}
      {change.change_type === 'removed' && change.original_value && (
        <DiffTextPair
          before={change.original_value}
          rationale={item.aiRationale}
          showRationale={showRationale}
        />
      )}
      {change.change_type === 'modified' &&
        (unchangedFlag ? (
          displayLine ? (
            <>
              <p className={cn('m-0', DIFF_BODY)}>{displayLine}</p>
              {showRationale ? <RationaleNote text={item.aiRationale} /> : null}
            </>
          ) : (
            <>
              <p className={cn('m-0 text-neutral-500', DIFF_BODY_SM)}>
                No textual change on this row — retained as-is.
              </p>
              {showRationale ? <RationaleNote text={item.aiRationale} /> : null}
            </>
          )
        ) : (
          <DiffTextPair
            before={change.original_value ?? '(empty)'}
            after={change.new_value ?? '(empty)'}
            rationale={item.aiRationale}
            showRationale={showRationale}
          />
        ))}
      {item.cleanupNote && !unchangedFlag ? (
        <div className="mt-2 border-l-2 border-amber-300/90 pl-3 text-[13px] leading-snug text-neutral-800">
          <p className="m-0">
            <span className="text-neutral-500">−</span> {item.cleanupNote.oldFragment}
            <span className="mx-1.5 text-neutral-400">→</span>
            <span className="text-neutral-500">+</span> {item.cleanupNote.newFragment}
          </p>
        </div>
      ) : null}
    </>
  );
}

function TitleDiffRow({ item, label = 'Role' }: { item: DisplayChange; label?: string }) {
  return (
    <div className="m-0 rounded-sm border border-neutral-200 bg-card px-2.5 py-2">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
        <p className={cn('m-0 text-[11px] font-bold uppercase tracking-wide text-neutral-500')}>
          {label}
        </p>
        <SourceBadge item={item} />
      </div>
      <DiffChangeBody item={item} />
    </div>
  );
}

function TechBulletDiffRow({ item }: { item: DisplayChange }) {
  return (
    <div
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2 rounded-sm border border-neutral-200 bg-card px-2.5 py-2',
        DIFF_FONT
      )}
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-neutral-100 text-[15px] font-bold leading-none text-neutral-500">
        #
      </span>
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className={cn('m-0 text-[11px] font-bold uppercase tracking-wide text-neutral-500')}>
            Tech stack
          </p>
          <SourceBadge item={item} />
        </div>
        <DiffChangeBody item={item} />
      </div>
    </div>
  );
}

function BulletDiffRow({ item }: { item: DisplayChange }) {
  const bulletPos = item.parsed.bulletIndex !== undefined ? item.parsed.bulletIndex + 1 : null;
  const label = bulletPos ? `#${bulletPos}` : '#';
  return (
    <div
      className={cn(
        'grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-2 rounded-sm border border-neutral-200 bg-card px-2.5 py-2',
        DIFF_FONT
      )}
    >
      <span
        className={cn(
          'flex h-6 w-8 items-center justify-center rounded-sm bg-neutral-100 text-[12px] font-black leading-none text-neutral-700',
          DIFF_FONT
        )}
        aria-label={bulletPos ? `Bullet ${bulletPos}` : 'Bullet'}
      >
        {label}
      </span>
      <div className="min-w-0 space-y-1">
        <HighlightedRationale text={item.aiRationale} />
        <DiffChangeBody item={item} showRationale={false} />
      </div>
    </div>
  );
}

function ExperienceEntryDiff({ items }: { items: DisplayChange[] }) {
  const title = items.filter((i) => i.change.field_type === 'experience_title');
  const tech = items.filter(
    (i) => i.change.field_type === 'experience' && isTechStackPath(i.change.field_path)
  );
  const other = items.filter(
    (i) => i.change.field_type === 'experience' && !isTechStackPath(i.change.field_path)
  );
  const bullets = items.filter((i) => i.change.field_type === 'description');
  const sortedOther = [...other].sort((a, b) =>
    a.change.field_path.localeCompare(b.change.field_path)
  );
  return (
    <div className="flex flex-col gap-2">
      {title.map((item) => (
        <TitleDiffRow key={item.change.field_path} item={item} />
      ))}
      {tech.map((item) => (
        <TechBulletDiffRow key={item.change.field_path} item={item} />
      ))}
      {bullets.map((item) => (
        <BulletDiffRow key={item.change.field_path} item={item} />
      ))}
      {sortedOther.map((item) => (
        <ChangeItem key={item.change.field_path} item={item} />
      ))}
    </div>
  );
}

function ProjectEntryDiff({ items }: { items: DisplayChange[] }) {
  const title = items.filter((i) => i.change.field_type === 'project_title');
  const tech = items.filter(
    (i) => i.change.field_type === 'project' && isTechStackPath(i.change.field_path)
  );
  const other = items.filter(
    (i) => i.change.field_type === 'project' && !isTechStackPath(i.change.field_path)
  );
  const bullets = items.filter((i) => i.change.field_type === 'description');
  const sortedOther = [...other].sort((a, b) =>
    a.change.field_path.localeCompare(b.change.field_path)
  );
  return (
    <div className="flex flex-col gap-2">
      {title.map((item) => (
        <TitleDiffRow key={item.change.field_path} item={item} label="Project name" />
      ))}
      {tech.map((item) => (
        <TechBulletDiffRow key={item.change.field_path} item={item} />
      ))}
      {bullets.map((item) => (
        <BulletDiffRow key={item.change.field_path} item={item} />
      ))}
      {sortedOther.map((item) => (
        <ChangeItem key={item.change.field_path} item={item} />
      ))}
    </div>
  );
}

function EducationEntryDiff({ items }: { items: DisplayChange[] }) {
  const bullets = items.filter((i) => i.change.field_type === 'description');
  const meta = items.filter((i) => i.change.field_type !== 'description');
  const sortedMeta = [...meta].sort((a, b) =>
    a.change.field_path.localeCompare(b.change.field_path)
  );
  return (
    <div className="flex flex-col gap-2">
      {sortedMeta.map((item) => (
        <ChangeItem key={item.change.field_path} item={item} />
      ))}
      {bullets.map((item) => (
        <BulletDiffRow key={item.change.field_path} item={item} />
      ))}
    </div>
  );
}

function ChangeItem({ item }: { item: DisplayChange }) {
  const { change } = item;
  const bulletPos =
    item.parsed.bulletIndex !== undefined && change.field_type === 'description'
      ? item.parsed.bulletIndex + 1
      : null;
  const isBullet = bulletPos !== null;

  if (isBullet) {
    return <BulletDiffRow item={item} />;
  }

  return (
    <div className="m-0 rounded-sm border border-neutral-200 bg-card px-2.5 py-2">
      <div className="min-w-0">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <span
            className={cn(
              'text-[11px] font-bold uppercase tracking-wide text-neutral-500',
              DIFF_FONT
            )}
          >
            {item.contextLabel}
          </span>
          <SourceBadge item={item} />
        </div>
        <DiffChangeBody item={item} />
      </div>
    </div>
  );
}

function skillsFallbackLineParts(entry: {
  added: string[];
  removed: string[];
  modified: string[];
}): string {
  const fromModified = entry.modified.map((m) => {
    const arrow = m.indexOf(' -> ');
    if (arrow === -1) return m.trim();
    return m.slice(arrow + 4).trim();
  });
  return [...entry.added, ...fromModified].filter(Boolean).join(', ');
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
      <div className="flex flex-col gap-4">
        {observation.groups.map((grp) => {
          const label = grp.group_label || grp.group_id;
          const valuesText = grp.values
            .map((c) => c.text)
            .filter(Boolean)
            .join(', ');
          return (
            <div key={grp.group_id} className="m-0 p-0">
              <div
                className={cn(
                  'grid grid-cols-[1.35rem_minmax(0,1fr)] items-start gap-x-3.5 text-neutral-900',
                  DIFF_BODY
                )}
              >
                <span className="flex justify-end pt-[0.35rem] leading-none text-neutral-400">
                  <span className={cn('text-[16px] font-semibold', DIFF_FONT)} aria-hidden>
                    •
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="m-0">
                    <span className="font-semibold text-neutral-950">{label}:</span> {valuesText}
                  </p>
                  {grp.group_why ? <RationaleNote text={grp.group_why} /> : null}
                </div>
              </div>
              {(grp.removed?.length ?? 0) > 0 ? (
                <div className="mt-3 flex flex-col gap-2">
                  {(grp.removed ?? []).map((r, ix) => (
                    <div
                      key={`${grp.group_id}-r-${ix}`}
                      className="grid grid-cols-[1.35rem_minmax(0,1fr)] items-start gap-x-3.5 text-[15px] font-medium leading-snug text-neutral-900"
                    >
                      <span className="flex justify-end pt-[0.1rem] font-semibold text-red-800">
                        −
                      </span>
                      <span className="text-red-900 line-through decoration-red-400 decoration-1">
                        {r.text}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {aggregateRationale ? <RationaleNote text={aggregateRationale} /> : null}
      {grouped.map((entry) => {
        const line = skillsFallbackLineParts(entry);
        return (
          <div key={entry.group} className="m-0 p-0">
            <div
              className={cn(
                'grid grid-cols-[1.35rem_minmax(0,1fr)] items-start gap-x-3.5 text-neutral-900',
                DIFF_BODY
              )}
            >
              <span className="flex justify-end pt-[0.35rem] leading-none text-neutral-400">
                <span className={cn('text-[16px] font-semibold', DIFF_FONT)} aria-hidden>
                  •
                </span>
              </span>
              <div className="min-w-0">
                <p className="m-0">
                  <span className="font-semibold text-neutral-950">{entry.group}:</span> {line}
                </p>
              </div>
            </div>
            {entry.removed.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1.5 pl-[calc(1.35rem+0.875rem)]">
                <p className={cn('m-0 text-red-800', DIFF_BODY_SM)}>
                  <span className="font-semibold">Removed:</span>{' '}
                  <span className="text-red-900 line-through decoration-red-400 decoration-1">
                    {entry.removed.join(', ')}
                  </span>
                </p>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
