'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Upload,
} from 'lucide-react';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import {
  deleteResume,
  fetchResume,
  fetchResumeList,
  retryProcessing,
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { useTranslations } from '@/lib/i18n';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';
type DateFilter = 'all' | '7d' | '30d' | '90d';
type SortOption = 'updated' | 'created' | 'company' | 'role' | 'code';
const TITLE_SPLIT_RE = /^(.+?)\s*@\s*(.+)$/;

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

function statusBadgeClass(status: ResumeListItem['processing_status'] | ProcessingStatus): string {
  switch (status) {
    case 'ready':
      return 'border-green-600 bg-green-50 text-green-700';
    case 'processing':
      return 'border-blue-700 bg-blue-50 text-blue-700';
    case 'failed':
      return 'border-red-500 bg-red-50 text-red-600';
    default:
      return 'border-gray-300 bg-white text-gray-500';
  }
}

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const router = useRouter();
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
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
    setHasMasterResume,
  } = useStatusCache();

  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;
  const isTailorEnabled =
    Boolean(masterResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const formatDateTimeParts = useCallback(
    (value: string): { date: string; time: string } => {
      const fallback = t('common.unknown');
      if (!value) return { date: fallback, time: fallback };
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return { date: fallback, time: fallback };

      const dateLocale =
        locale === 'es' ? 'es-ES' : locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

      return {
        date: date.toLocaleDateString(dateLocale, {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }),
        time: date.toLocaleTimeString(dateLocale, {
          hour: '2-digit',
          minute: '2-digit',
        }),
      };
    },
    [locale, t]
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
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
        return;
      }
      setProcessingStatus('failed');
    }
  }, []);

  const loadTailoredResumes = useCallback(async () => {
    try {
      const data = await fetchResumeList(true);
      const masterFromList = data.find((resume) => resume.is_master);
      const storedId = localStorage.getItem('master_resume_id');
      const resolvedMasterId = masterFromList?.resume_id || storedId;

      if (resolvedMasterId) {
        localStorage.setItem('master_resume_id', resolvedMasterId);
        setMasterResumeId(resolvedMasterId);
        checkResumeStatus(resolvedMasterId);
      } else {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
      }

      setTailoredResumes(data.filter((resume) => resume.resume_id !== resolvedMasterId));
    } catch (err) {
      console.error('Failed to load tailored resumes:', err);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (storedId) {
      setMasterResumeId(storedId);
      checkResumeStatus(storedId);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    loadTailoredResumes();
  }, [loadTailoredResumes]);

  useEffect(() => {
    const handleFocus = () => {
      loadTailoredResumes();
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    checkResumeStatus(resumeId);
    incrementResumes();
    setHasMasterResume(true);
    void loadTailoredResumes();
  };

  const handleRetryProcessing = async () => {
    if (!masterResumeId) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(masterResumeId);
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
    if (!masterResumeId) return;
    try {
      await deleteResume(masterResumeId);
      decrementResumes();
      setHasMasterResume(false);
      localStorage.removeItem('master_resume_id');
      setMasterResumeId(null);
      setProcessingStatus('loading');
      setIsUploadDialogOpen(true);
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to delete resume:', err);
    }
  };

  const getStatusDisplay = useCallback(() => {
    switch (processingStatus) {
      case 'loading':
        return {
          text: t('dashboard.status.checking'),
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          color: 'text-gray-500',
        };
      case 'processing':
        return {
          text: t('dashboard.status.processing'),
          icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
          color: 'text-blue-700',
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
          icon: <AlertCircle className="h-3.5 w-3.5" />,
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
      Array.from(
        new Set(tailoredResumes.map((resume) => resolveCompany(resume)).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [tailoredResumes]
  );

  const resumeRoles = useMemo(
    () =>
      Array.from(
        new Set(tailoredResumes.map((resume) => resolveRole(resume)).filter(Boolean))
      ).sort((left, right) => left.localeCompare(right)),
    [tailoredResumes]
  );

  const filteredResumes = useMemo(() => {
    const searchNeedle = searchQuery.trim().toLowerCase();
    const now = Date.now();
    const dayToMs = 24 * 60 * 60 * 1000;
    const dateWindowDays =
      dateFilter === '7d' ? 7 : dateFilter === '30d' ? 30 : dateFilter === '90d' ? 90 : null;

    const filtered = tailoredResumes.filter((resume) => {
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
  }, [companyFilter, dateFilter, roleFilter, searchQuery, sortBy, tailoredResumes]);

  const masterStatus = getStatusDisplay();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 py-4 md:px-4 md:py-5">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
          {t('dashboard.title')}
        </p>
        <Button variant="outline" size="xs" onClick={() => router.push('/settings')}>
          <Settings className="h-4 w-4" />
          {t('nav.settings')}
        </Button>
      </div>

      {masterResumeId && !isLlmConfigured && !statusLoading && (
        <div className="flex items-start justify-between gap-3 border border-amber-500 bg-amber-50 px-3 py-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" />
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
                {t('dashboard.llmNotConfiguredTitle')}
              </p>
              <p className="mt-1 text-[13px] text-amber-700">
                {t('dashboard.llmNotConfiguredMessage')}
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="xs" className="border-amber-500 text-amber-700">
              <Settings className="h-4 w-4" />
              {t('nav.settings')}
            </Button>
          </Link>
        </div>
      )}

      {!masterResumeId ? (
        !isLlmConfigured && !statusLoading ? (
          <div className="border border-black bg-white px-4 py-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="space-y-2">
                <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-amber-700">
                  {t('dashboard.setupRequiredTitle')}
                </p>
                <h1 className="font-serif text-3xl font-bold uppercase tracking-tight">
                  {t('dashboard.setupRequiredMessage')}
                </h1>
              </div>
              <Link href="/settings">
                <Button size="lg" className="gap-2">
                  <Settings className="h-4 w-4" />
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
              <div className="cursor-pointer border border-black bg-white px-4 py-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                      Workspace setup
                    </p>
                    <h1 className="font-serif text-3xl font-bold uppercase tracking-tight">
                      {t('dashboard.initializeMasterResume')}
                    </h1>
                    <p className="text-[13px] text-gray-600">{t('dashboard.initializeSequence')}</p>
                  </div>
                  <div className="flex items-center gap-3 border border-black bg-[#F8F7F1] px-4 py-3">
                    <Upload className="h-5 w-5" />
                    <span className="font-mono text-xs font-bold uppercase tracking-[0.18em]">
                      Upload resume
                    </span>
                  </div>
                </div>
              </div>
            }
          />
        )
      ) : (
        <section className="border border-black bg-white px-4 py-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <button
                type="button"
                className="flex items-center gap-3 text-left transition-colors hover:text-blue-700"
                onClick={() => router.push(`/resumes/${masterResumeId}`)}
              >
                <div className="flex h-12 w-12 items-center justify-center border border-black bg-blue-700 text-white">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                    {t('dashboard.masterResume')}
                  </p>
                  <h1 className="font-serif text-2xl font-bold uppercase tracking-tight">
                    Focused editing workspace
                  </h1>
                </div>
              </button>
              <div
                className={`flex items-center gap-2 font-mono text-xs uppercase ${masterStatus.color}`}
              >
                {masterStatus.icon}
                <span>{t('dashboard.statusLine', { status: masterStatus.text })}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="xs"
                onClick={() => router.push(`/builder?id=${masterResumeId}`)}
              >
                <FileText className="h-4 w-4" />
                Open builder
              </Button>
              {(processingStatus === 'failed' || processingStatus === 'processing') && (
                <>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={handleRetryProcessing}
                    disabled={isRetrying}
                  >
                    {isRetrying ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    {t('dashboard.retryProcessing')}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    className="border-red-500 text-red-600 hover:bg-red-50"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    {t('dashboard.deleteAndReupload')}
                  </Button>
                </>
              )}
              <Button
                size="lg"
                onClick={() => {
                  if (isTailorEnabled) {
                    router.push('/tailor');
                  }
                }}
                disabled={!isTailorEnabled}
              >
                <Plus className="h-4 w-4" />
                {t('dashboard.createResume')}
              </Button>
            </div>
          </div>
        </section>
      )}

      <section className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="border-b border-black bg-[#F8F7F1] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="font-mono text-xs font-bold uppercase tracking-[0.18em] text-gray-500">
                Tailored resumes
              </p>
              <h2 className="font-serif text-2xl font-bold uppercase tracking-tight">
                Scan by role, company, and recency
              </h2>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs uppercase text-gray-500">
              <span>{filteredResumes.length}</span>
              <span>results</span>
            </div>
          </div>
        </div>

        <div className="sticky top-3 z-10 border-b border-black bg-white px-4 py-3">
          <div className="grid gap-2 lg:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,0.9fr)]">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, role, company, or code"
                className="pl-9"
              />
            </label>

            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="h-10 border border-black bg-white px-3 font-mono text-sm"
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
              className="h-10 border border-black bg-white px-3 font-mono text-sm"
            >
              <option value="">All roles</option>
              {resumeRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>

            <div className="flex border border-black bg-[#F8F7F1]">
              {(['all', '7d', '30d', '90d'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setDateFilter(option)}
                  className={`min-w-[56px] border-r border-black px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.16em] last:border-r-0 ${
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
              className="h-10 border border-black bg-white px-3 font-mono text-sm"
            >
              <option value="updated">Last updated</option>
              <option value="created">Created</option>
              <option value="company">Company</option>
              <option value="role">Role</option>
              <option value="code">Code</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden">
          <div className="hidden border-b border-black bg-[#F8F7F1] px-4 py-2 md:grid md:grid-cols-[minmax(0,1.8fr)_100px_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_130px_110px_96px] md:gap-3">
            {['Resume', 'Code', 'Role', 'Company', 'Location', 'Updated', 'Status', 'Open'].map(
              (label) => (
                <span
                  key={label}
                  className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-gray-500"
                >
                  {label}
                </span>
              )
            )}
          </div>

          {filteredResumes.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="font-serif text-xl font-bold uppercase tracking-tight">
                No tailored resumes yet
              </p>
              <p className="mt-2 text-[13px] text-gray-600">
                Generate a new resume to start building a searchable history here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-black/10">
              {filteredResumes.map((resume) => {
                const title = resume.title || resume.filename || 'Untitled resume';
                const resolvedRole = resolveRole(resume);
                const resolvedCompany = resolveCompany(resume);
                const resolvedLocation = resolveLocation(resume);
                const resolvedCode = resolveResumeCode(resume);
                const updatedParts = formatDateTimeParts(resume.updated_at || resume.created_at);
                return (
                  <button
                    key={resume.resume_id}
                    type="button"
                    onClick={() => router.push(`/resumes/${resume.resume_id}`)}
                    className="grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F8F7F1] md:grid-cols-[minmax(0,1.8fr)_100px_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_130px_110px_96px] md:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-serif text-lg font-bold leading-tight">{title}</p>
                      <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-gray-500 md:hidden">
                        {resolvedCode || 'N/A'}
                      </p>
                    </div>
                    <div className="font-mono text-sm text-gray-700">{resolvedCode || 'N/A'}</div>
                    <div className="font-mono text-sm text-gray-700">{resolvedRole || 'N/A'}</div>
                    <div className="font-mono text-sm text-gray-700">
                      {resolvedCompany || 'N/A'}
                    </div>
                    <div className="font-mono text-sm text-gray-700">
                      {resolvedLocation || 'N/A'}
                    </div>
                    <div className="font-mono text-xs uppercase text-gray-500">
                      <div>{updatedParts.date}</div>
                      <div className="mt-1">{updatedParts.time}</div>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center border px-2 py-1 font-mono text-[11px] font-bold uppercase tracking-[0.16em] ${statusBadgeClass(resume.processing_status)}`}
                      >
                        {resume.processing_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 font-mono text-xs font-bold uppercase tracking-[0.16em] text-blue-700">
                      <span>Open</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
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
