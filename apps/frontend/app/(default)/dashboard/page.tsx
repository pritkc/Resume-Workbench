'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  FileText,
  GitBranch,
  Loader2,
  MoreVertical,
  PenLine,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Star,
  Upload,
} from 'lucide-react';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { Button } from '@/components/ui/button';
import { LinkButton } from '@/components/ui/link-button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  deleteResume,
  duplicateResume,
  fetchResume,
  fetchResumeList,
  pinResume,
  retryProcessing,
  setActiveResume,
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';
type DateFilter = 'all' | '7d' | '30d' | '90d';
type SortOption = 'updated' | 'created' | 'company' | 'role' | 'code';
const TITLE_SPLIT_RE = /^(.+?)\s*@\s*(.+)$/;
const ACTIVE_RESUME_STORAGE_KEY = 'active_resume_id';
const LEGACY_MASTER_RESUME_STORAGE_KEY = 'master_resume_id';

const TABLE_GRID =
  'grid w-full grid-cols-[minmax(0,1.55fr)_56px_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,0.7fr)_72px_68px] items-center gap-x-2';

function migrateLegacyActiveResumeStorage(): void {
  if (typeof window === 'undefined') return;
  const legacy = localStorage.getItem(LEGACY_MASTER_RESUME_STORAGE_KEY);
  if (legacy && !localStorage.getItem(ACTIVE_RESUME_STORAGE_KEY)) {
    localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, legacy);
    localStorage.removeItem(LEGACY_MASTER_RESUME_STORAGE_KEY);
  }
}

function normalizeFilterValue(value?: string | null): string {
  return value?.trim() || '';
}

function deriveRoleCompanyFromTitle(
  title?: string | null
): { role: string; company: string } | null {
  const normalizedTitle = normalizeFilterValue(title);
  if (!normalizedTitle) {
    return null;
  }
  const match = TITLE_SPLIT_RE.exec(normalizedTitle);
  if (!match) {
    return null;
  }
  const role = normalizeFilterValue(match[1]);
  const company = normalizeFilterValue(match[2]);
  if (!role || !company) {
    return null;
  }
  return { role, company };
}

function resolveRole(resume: ResumeListItem): string {
  return resolveTargetMetadata(resume).role;
}

function resolveCompany(resume: ResumeListItem): string {
  return resolveTargetMetadata(resume).company;
}

function resolveLocation(resume: ResumeListItem): string {
  return resolveTargetMetadata(resume).location;
}

function resolveResumeCode(resume: ResumeListItem): string {
  return normalizeFilterValue(resume.resume_code);
}

function resolveTargetMetadata(resume: ResumeListItem): {
  role: string;
  company: string;
  location: string;
} {
  const parsedTitle = deriveRoleCompanyFromTitle(resume.title);
  const role =
    normalizeFilterValue(resume.target_role) ||
    normalizeFilterValue(resume.role) ||
    parsedTitle?.role ||
    '';
  const company =
    normalizeFilterValue(resume.target_company) ||
    normalizeFilterValue(resume.company) ||
    parsedTitle?.company ||
    '';
  const location =
    normalizeFilterValue(resume.target_location) || normalizeFilterValue(resume.location) || '';

  return { role, company, location };
}

type ResumeRowActionsProps = {
  resume: ResumeListItem;
  busy: boolean;
  tailorDisabled: boolean;
  tailorHref: string;
  onSetActive: () => void;
  onPin: () => void;
  onDuplicate: () => void;
  labels: {
    setActive: string;
    pin: string;
    unpin: string;
    duplicate: string;
    tailor: string;
    llmTrace: string;
    llmTraceUnavailable: string;
  };
};

function ResumeRowActions({
  resume,
  busy,
  tailorDisabled,
  tailorHref,
  onSetActive,
  onPin,
  onDuplicate,
  labels,
}: ResumeRowActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div className="flex shrink-0 items-center justify-end gap-0.5">
      {tailorDisabled || busy ? (
        <Button
          type="button"
          variant="default"
          size="xs"
          className="h-7 w-7 shrink-0 p-0"
          title={labels.tailor}
          disabled
        >
          <PenLine className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <LinkButton
          href={tailorHref}
          variant="default"
          size="xs"
          className="h-7 w-7 shrink-0 p-0"
          title={labels.tailor}
        >
          <PenLine className="h-3.5 w-3.5" />
        </LinkButton>
      )}
      <div className="relative" ref={wrapRef}>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="h-7 w-7 shrink-0 p-0"
          title="More"
          disabled={busy}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <MoreVertical className="h-3.5 w-3.5" />
        </Button>
        {menuOpen ? (
          <div className="absolute right-0 top-full z-30 mt-0.5 min-w-[168px] border border-border bg-card py-0.5 shadow-[2px_2px_0_0_rgba(0,0,0,0.12)]">
            <button
              type="button"
              className="w-full px-2.5 py-1 text-left text-[11px] font-mono hover:bg-secondary disabled:opacity-40"
              disabled={resume.is_active}
              onClick={() => {
                onSetActive();
                setMenuOpen(false);
              }}
            >
              {labels.setActive}
            </button>
            <button
              type="button"
              className="w-full px-2.5 py-1 text-left text-[11px] font-mono hover:bg-secondary"
              onClick={() => {
                onPin();
                setMenuOpen(false);
              }}
            >
              {resume.is_pinned ? labels.unpin : labels.pin}
            </button>
            <button
              type="button"
              className="w-full px-2.5 py-1 text-left text-[11px] font-mono hover:bg-secondary"
              onClick={() => {
                onDuplicate();
                setMenuOpen(false);
              }}
            >
              {labels.duplicate}
            </button>
            {resume.llm_trace_id ? (
              <Link
                href={
                  resume.resume_code
                    ? `/llm-traces?resume_code=${encodeURIComponent(resume.resume_code)}`
                    : `/llm-traces?trace_id=${encodeURIComponent(resume.llm_trace_id)}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-2.5 py-1 text-left text-[11px] font-mono hover:bg-secondary"
                onClick={() => setMenuOpen(false)}
              >
                {labels.llmTrace}
              </Link>
            ) : (
              <span
                className="block w-full cursor-not-allowed px-2.5 py-1 text-left text-[11px] font-mono text-gray-400"
                title={labels.llmTraceUnavailable}
                aria-disabled="true"
              >
                {labels.llmTrace}
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslations();
  const [activeResumeId, setActiveResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [allResumes, setAllResumes] = useState<ResumeListItem[]>([]);
  const [rowActionBusyId, setRowActionBusyId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasActiveResume,
  } = useStatusCache();

  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;
  const isTailorEnabled =
    Boolean(activeResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const actionLabels = useMemo(
    () => ({
      setActive: t('dashboard.setActive'),
      pin: t('dashboard.pinAction'),
      unpin: t('dashboard.unpinAction'),
      duplicate: t('dashboard.duplicateResume'),
      tailor: t('dashboard.tailorResume'),
      llmTrace: t('dashboard.llmTraceMenu'),
      llmTraceUnavailable: t('dashboard.llmTraceMenuUnavailable'),
    }),
    [t]
  );

  const dateLocale = 'en-US';

  const formatShortDate = useCallback(
    (value: string): string => {
      const fallback = t('common.unknown');
      if (!value) return fallback;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return fallback;
      return date.toLocaleDateString(dateLocale, {
        month: 'short',
        day: 'numeric',
        year: '2-digit',
      });
    },
    [dateLocale, t]
  );

  const formatDateTimeTooltip = useCallback(
    (value: string): string => {
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';
      return date.toLocaleString(dateLocale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    },
    [dateLocale]
  );

  const checkResumeStatus = useCallback(async (resumeId: string) => {
    try {
      setProcessingStatus('loading');
      const data = await fetchResume(resumeId);
      const status = data.raw_resume?.processing_status || 'pending';
      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      console.error('Failed to check resume status:', err);
      if (err instanceof Error && err.message.includes('404')) {
        localStorage.removeItem(ACTIVE_RESUME_STORAGE_KEY);
        setActiveResumeId(null);
        return;
      }
      setProcessingStatus('failed');
    }
  }, []);

  const loadResumes = useCallback(async () => {
    try {
      migrateLegacyActiveResumeStorage();
      const { resumes, active_resume_id } = await fetchResumeList(true);
      const activeFromList = resumes.find((r) => r.is_active);
      const storedId = localStorage.getItem(ACTIVE_RESUME_STORAGE_KEY);
      const resolvedActiveId = active_resume_id ?? activeFromList?.resume_id ?? storedId ?? null;

      if (resolvedActiveId) {
        localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, resolvedActiveId);
        setActiveResumeId(resolvedActiveId);
        void checkResumeStatus(resolvedActiveId);
      } else {
        localStorage.removeItem(ACTIVE_RESUME_STORAGE_KEY);
        setActiveResumeId(null);
      }

      setAllResumes(resumes);
    } catch (err) {
      console.error('Failed to load resumes:', err);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    migrateLegacyActiveResumeStorage();
    const storedId = localStorage.getItem(ACTIVE_RESUME_STORAGE_KEY);
    if (storedId) {
      setActiveResumeId(storedId);
      checkResumeStatus(storedId);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    void loadResumes();
  }, [loadResumes]);

  useEffect(() => {
    const handleFocus = () => {
      void loadResumes();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadResumes]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, resumeId);
    setActiveResumeId(resumeId);
    checkResumeStatus(resumeId);
    incrementResumes();
    setHasActiveResume(true);
    void loadResumes();
  };

  const handleRetryProcessing = async () => {
    if (!activeResumeId) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(activeResumeId);
      if (result.processing_status === 'ready') {
        setProcessingStatus('ready');
      } else if (
        result.processing_status === 'processing' ||
        result.processing_status === 'pending'
      ) {
        setProcessingStatus(result.processing_status);
      } else {
        setProcessingStatus('failed');
      }
    } catch (err) {
      console.error('Retry processing failed:', err);
      setProcessingStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const confirmDeleteAndReupload = async () => {
    if (!activeResumeId) return;
    try {
      await deleteResume(activeResumeId);
      decrementResumes();
      setHasActiveResume(false);
      localStorage.removeItem(ACTIVE_RESUME_STORAGE_KEY);
      setActiveResumeId(null);
      setProcessingStatus('loading');
      setIsUploadDialogOpen(true);
      await loadResumes();
    } catch (err) {
      console.error('Failed to delete resume:', err);
    }
  };

  const handleSetActiveResume = async (resumeId: string) => {
    setRowActionBusyId(resumeId);
    try {
      await setActiveResume(resumeId);
      localStorage.setItem(ACTIVE_RESUME_STORAGE_KEY, resumeId);
      setActiveResumeId(resumeId);
      void checkResumeStatus(resumeId);
      await loadResumes();
    } catch (err) {
      console.error('Failed to set active resume:', err);
    } finally {
      setRowActionBusyId(null);
    }
  };

  const handlePinResume = async (resumeId: string, pinned: boolean) => {
    setRowActionBusyId(resumeId);
    try {
      await pinResume(resumeId, pinned);
      await loadResumes();
    } catch (err) {
      console.error('Failed to pin resume:', err);
    } finally {
      setRowActionBusyId(null);
    }
  };

  const handleDuplicateResume = async (resumeId: string) => {
    setRowActionBusyId(resumeId);
    try {
      await duplicateResume(resumeId);
      incrementResumes();
      await loadResumes();
    } catch (err) {
      console.error('Failed to duplicate resume:', err);
    } finally {
      setRowActionBusyId(null);
    }
  };

  const getStatusDisplay = useCallback(() => {
    switch (processingStatus) {
      case 'loading':
        return {
          text: t('dashboard.status.checking'),
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          color: 'text-gray-500',
        };
      case 'processing':
        return {
          text: t('dashboard.status.processing'),
          icon: <Loader2 className="h-3 w-3 animate-spin" />,
          color: 'text-primary',
        };
      case 'ready':
        return {
          text: t('dashboard.status.ready'),
          icon: null,
          color: 'text-green-700',
        };
      case 'failed':
        return {
          text: t('dashboard.status.failed'),
          icon: <AlertCircle className="h-3 w-3" />,
          color: 'text-red-600',
        };
      default:
        return {
          text: t('dashboard.status.pending'),
          icon: null,
          color: 'text-gray-500',
        };
    }
  }, [processingStatus, t]);

  const resumeCompanies = useMemo(
    () =>
      Array.from(new Set(allResumes.map((resume) => resolveCompany(resume)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [allResumes]
  );

  const resumeRoles = useMemo(
    () =>
      Array.from(new Set(allResumes.map((resume) => resolveRole(resume)).filter(Boolean))).sort(
        (left, right) => left.localeCompare(right)
      ),
    [allResumes]
  );

  const filteredResumes = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const dayToMs = 24 * 60 * 60 * 1000;
    const dateWindowDays =
      dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : dateFilter === '90d' ? 90 : null;

    const filtered = allResumes.filter((resume) => {
      const title = normalizeFilterValue(resume.title || resume.filename || 'Untitled resume');
      const role = resolveRole(resume);
      const company = resolveCompany(resume);
      const location = resolveLocation(resume);
      const resumeCode = resolveResumeCode(resume);
      const searchable = `${title} ${role} ${company} ${location} ${resumeCode}`.toLowerCase();

      if (searchNeedle && !searchable.includes(searchNeedle)) {
        return false;
      }
      if (companyFilter && company !== companyFilter) {
        return false;
      }
      if (roleFilter && role !== roleFilter) {
        return false;
      }

      if (dateWindowDays) {
        const comparisonDate = new Date(resume.updated_at || resume.created_at).getTime();
        if (Number.isNaN(comparisonDate) || now - comparisonDate > dateWindowDays * dayToMs) {
          return false;
        }
      }

      return true;
    });

    filtered.sort((left, right) => {
      if (sortBy === 'company') {
        return resolveCompany(left).localeCompare(resolveCompany(right));
      }

      if (sortBy === 'role') {
        return resolveRole(left).localeCompare(resolveRole(right));
      }
      if (sortBy === 'code') {
        return resolveResumeCode(left).localeCompare(resolveResumeCode(right));
      }

      const leftDate = new Date(
        sortBy === 'created' ? left.created_at : left.updated_at || left.created_at
      ).getTime();
      const rightDate = new Date(
        sortBy === 'created' ? right.created_at : right.updated_at || right.created_at
      ).getTime();
      return rightDate - leftDate;
    });

    return filtered;
  }, [companyFilter, dateFilter, roleFilter, searchQuery, sortBy, allResumes]);

  const pinnedFiltered = useMemo(
    () => filteredResumes.filter((resume) => resume.is_pinned),
    [filteredResumes]
  );
  const unpinnedFiltered = useMemo(
    () => filteredResumes.filter((resume) => !resume.is_pinned),
    [filteredResumes]
  );

  const activeStatus = getStatusDisplay();

  const activeResumeMeta = useMemo(
    () => allResumes.find((r) => r.resume_id === activeResumeId),
    [allResumes, activeResumeId]
  );
  const activeTitle =
    activeResumeMeta?.title || activeResumeMeta?.filename || t('dashboard.masterResume');

  const renderResumeRow = (resume: ResumeListItem) => {
    const title = resume.title || resume.filename || 'Untitled resume';
    const resolvedRole = resolveRole(resume);
    const resolvedCompany = resolveCompany(resume);
    const resolvedLocation = resolveLocation(resume);
    const resolvedCode = resolveResumeCode(resume);
    const updatedRaw = resume.updated_at || resume.created_at;
    const shortDate = formatShortDate(updatedRaw);
    const updatedTooltip = formatDateTimeTooltip(updatedRaw);
    const busy = rowActionBusyId === resume.resume_id;
    return (
      <div key={resume.resume_id} className={`${TABLE_GRID} border-b border-border px-2 py-0.5`}>
        <div className="flex min-h-[26px] min-w-0 items-center gap-1">
          <Link
            href={`/builder?id=${resume.resume_id}`}
            className="min-w-0 truncate text-[13px] font-medium leading-tight hover:text-blue-800"
          >
            {title}
          </Link>
          {resume.is_active ? (
            <Star className="h-3 w-3 shrink-0 fill-blue-700 text-primary" aria-label="Active" />
          ) : null}
          {resume.is_pinned ? (
            <Pin className="h-3 w-3 shrink-0 text-gray-600" aria-label="Pinned" />
          ) : null}
          {resume.parent_id ? (
            <GitBranch
              className="h-3 w-3 shrink-0 text-gray-400"
              aria-label={t('dashboard.tailoredResume')}
            />
          ) : null}
        </div>
        <div className="font-mono text-[11px] text-gray-700">{resolvedCode || '—'}</div>
        <div className="truncate text-[11px] text-gray-800">{resolvedRole || '—'}</div>
        <div className="truncate text-[11px] text-gray-800">{resolvedCompany || '—'}</div>
        <div className="truncate text-[11px] text-gray-800">{resolvedLocation || '—'}</div>
        <time
          dateTime={updatedRaw || undefined}
          title={updatedTooltip || undefined}
          aria-label={updatedTooltip || shortDate || undefined}
          className="cursor-default text-[11px] text-gray-600 underline decoration-dotted decoration-gray-400 underline-offset-2"
        >
          {shortDate}
        </time>
        <div className="flex justify-end">
          <ResumeRowActions
            resume={resume}
            busy={busy}
            tailorDisabled={resume.processing_status !== 'ready' || !isLlmConfigured}
            labels={actionLabels}
            tailorHref={`/tailor?source=${encodeURIComponent(resume.resume_id)}`}
            onSetActive={() => void handleSetActiveResume(resume.resume_id)}
            onPin={() => void handlePinResume(resume.resume_id, !resume.is_pinned)}
            onDuplicate={() => void handleDuplicateResume(resume.resume_id)}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex w-full max-w-[min(100vw-12px,1600px)] flex-col gap-2 px-1.5 py-2 md:px-2 md:py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-gray-500">
          {t('dashboard.title')}
        </p>
        <LinkButton
          href="/settings"
          variant="outline"
          size="xs"
          className="h-7 w-7 p-0"
          title={t('nav.settings')}
        >
          <Settings className="h-3.5 w-3.5" />
        </LinkButton>
      </div>

      {activeResumeId && !isLlmConfigured && !statusLoading && (
        <div className="flex items-start justify-between gap-2 border border-amber-500 bg-amber-50 px-2 py-2 text-[12px] text-amber-800 shadow-[1px_1px_0_0_rgba(0,0,0,0.06)]">
          <div className="flex min-w-0 items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                {t('dashboard.llmNotConfiguredTitle')}
              </p>
              <p className="mt-0.5 leading-snug">{t('dashboard.llmNotConfiguredMessage')}</p>
            </div>
          </div>
          <Link href="/settings">
            <Button
              variant="outline"
              size="xs"
              className="h-7 border-amber-500 px-2 text-amber-800"
            >
              <Settings className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      )}

      {!activeResumeId ? (
        !isLlmConfigured && !statusLoading ? (
          <div className="border border-border bg-card px-3 py-4 shadow-[3px_3px_0_0_rgba(0,0,0,0.06)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-amber-700">
                  {t('dashboard.setupRequiredTitle')}
                </p>
                <h1 className="font-serif text-xl font-bold uppercase tracking-tight">
                  {t('dashboard.setupRequiredMessage')}
                </h1>
              </div>
              <Link href="/settings">
                <Button size="sm" className="gap-1.5">
                  <Settings className="h-3.5 w-3.5" />
                  {t('nav.goToSettings')}
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <ResumeUploadDialog
            open={isUploadDialogOpen}
            onOpenChange={setIsUploadDialogOpen}
            onUploadComplete={handleUploadComplete}
            trigger={
              <div className="cursor-pointer border border-border bg-card px-3 py-4 shadow-[3px_3px_0_0_rgba(0,0,0,0.06)] transition-transform hover:translate-x-px hover:translate-y-px hover:shadow-none">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <h1 className="font-serif text-xl font-bold uppercase tracking-tight">
                      {t('dashboard.initializeMasterResume')}
                    </h1>
                    <p className="text-[12px] text-gray-600">{t('dashboard.initializeSequence')}</p>
                  </div>
                  <div className="flex items-center gap-2 border border-border bg-secondary px-3 py-2">
                    <Upload className="h-4 w-4" />
                    <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em]">
                      {t('dashboard.uploadResume')}
                    </span>
                  </div>
                </div>
              </div>
            }
          />
        )
      ) : (
        <section className="border border-border bg-card px-2 py-2 shadow-[3px_3px_0_0_rgba(0,0,0,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Link
                href={`/builder?id=${activeResumeId}`}
                className="min-w-0 truncate text-left font-serif text-base font-bold leading-tight hover:text-blue-800"
              >
                {activeTitle}
              </Link>
              <div
                className={`flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase ${activeStatus.color}`}
              >
                {activeStatus.icon}
                <span>{t('dashboard.statusLine', { status: activeStatus.text })}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-0.5">
              <LinkButton
                href={`/builder?id=${activeResumeId}`}
                variant="outline"
                size="xs"
                className="h-7 w-7 p-0"
                title={t('builder.title')}
              >
                <FileText className="h-3.5 w-3.5" />
              </LinkButton>
              {(processingStatus === 'failed' || processingStatus === 'processing') && (
                <>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 w-7 p-0"
                    title={t('dashboard.retryProcessing')}
                    onClick={handleRetryProcessing}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="h-7 w-7 border-red-500 p-0 text-red-600 hover:bg-red-50"
                    title={t('dashboard.deleteAndReupload')}
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {isTailorEnabled ? (
                <LinkButton
                  href={
                    activeResumeId
                      ? `/tailor?source=${encodeURIComponent(activeResumeId)}`
                      : '/tailor'
                  }
                  size="xs"
                  className="h-7 w-7 p-0"
                  title={t('dashboard.createResume')}
                >
                  <Plus className="h-3.5 w-3.5" />
                </LinkButton>
              ) : (
                <Button
                  size="xs"
                  className="h-7 w-7 p-0"
                  title={t('dashboard.createResume')}
                  disabled
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="border border-border bg-card shadow-[3px_3px_0_0_rgba(0,0,0,0.06)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border bg-secondary px-2 py-1.5">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-gray-600">
            {t('dashboard.myResumes')}
          </p>
          <span className="font-mono text-[10px] text-gray-500">
            {filteredResumes.length} / {allResumes.length}
          </span>
        </div>

        <div className="sticky top-2 z-10 border-b border-border bg-card px-2 py-1.5">
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_minmax(0,0.9fr)_auto_minmax(0,0.85fr)]">
            <label className="relative block sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search…"
                className="h-8 pl-8 text-xs"
              />
            </label>

            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="h-8 border border-border bg-card px-2 font-mono text-xs"
            >
              <option value="">All companies</option>
              {resumeCompanies.map((company) => (
                <option key={company} value={company}>
                  {company}
                </option>
              ))}
            </select>

            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-8 border border-border bg-card px-2 font-mono text-xs"
            >
              <option value="">All roles</option>
              {resumeRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <div className="flex h-8 border border-border bg-secondary">
              {(['all', '7d', '30d', '90d'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDateFilter(option)}
                  className={`min-w-[44px] flex-1 border-r border-border px-1.5 font-mono text-[10px] font-bold uppercase tracking-wide last:border-r-0 ${
                    dateFilter === option
                      ? 'bg-black text-white'
                      : 'text-gray-600 hover:bg-[#ECEADF]'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as SortOption)}
              className="h-8 border border-border bg-card px-2 font-mono text-xs"
            >
              <option value="updated">Updated</option>
              <option value="created">Created</option>
              <option value="company">Company</option>
              <option value="role">Role</option>
              <option value="code">Code</option>
            </select>
          </div>
        </div>

        {filteredResumes.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <p className="font-serif text-base font-bold">
              {allResumes.length === 0 ? t('dashboard.noResumes') : 'No matches'}
            </p>
            <p className="mt-1 text-[12px] text-gray-600">
              {allResumes.length === 0
                ? t('dashboard.noResumesDescription')
                : 'Adjust filters or search.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className={`${TABLE_GRID} border-b border-border bg-[#ECEADF] px-2 py-1`}>
                {['Resume', 'Code', 'Role', 'Company', 'Loc.', 'Updated', ''].map((label, col) => (
                  <span
                    key={`col-${col}`}
                    className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gray-600"
                  >
                    {col === 6 ? '\u00a0' : label}
                  </span>
                ))}
              </div>
              {pinnedFiltered.length > 0 ? (
                <div>
                  <div className="border-b border-border bg-[#E8E6DC] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gray-700">
                    Pinned
                  </div>
                  {pinnedFiltered.map((resume) => renderResumeRow(resume))}
                </div>
              ) : null}
              {unpinnedFiltered.length > 0 ? (
                <div>
                  {pinnedFiltered.length > 0 ? (
                    <div className="border-b border-border bg-[#E8E6DC] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-gray-700">
                      All
                    </div>
                  ) : null}
                  {unpinnedFiltered.map((resume) => renderResumeRow(resume))}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('confirmations.deleteMasterResumeTitle')}
        description={t('confirmations.deleteMasterResumeDescription')}
        confirmLabel={t('dashboard.deleteAndReupload')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={confirmDeleteAndReupload}
        variant="danger"
      />
    </div>
  );
}
