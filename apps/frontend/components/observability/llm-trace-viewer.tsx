'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { LlmTraceGenerationGroup } from '@/components/observability/llm-trace-generation-group';
import { LlmTraceNav, type LlmTraceNavItem } from '@/components/observability/llm-trace-nav';
import {
  fetchLlmCalls,
  fetchLlmCallSummary,
  type FetchLLMCallsParams,
  type LLMCallRecord,
  type LLMCallSummary,
} from '@/lib/api/llm';
import {
  formatCost,
  formatCount,
  formatTimestamp,
  groupCallsByResumeGeneration,
  shortenId,
  sortCalls,
  toSuccessValue,
  type SuccessFilter,
} from '@/lib/observability/llm-trace-helpers';
import { Activity, Braces, Database, Loader2, RefreshCw, Search } from 'lucide-react';

interface TraceQuery {
  traceId: string;
  resumeCode: string;
  resumeId: string;
  requestScope: string;
  successFilter: SuccessFilter;
  limit: number;
}

interface LLMTraceViewerProps {
  initialTraceId?: string | null;
  initialResumeCode?: string | null;
  initialResumeId?: string | null;
  initialRequestScope?: string | null;
  defaultAutoRefresh?: boolean;
}

const REQUEST_SCOPE_SUGGESTIONS = [
  'resumes.upload',
  'resumes.retry_processing',
  'resumes.improve_preview',
  'resumes.improve_confirm',
  'resumes.improve',
] as const;

const LIMIT_OPTIONS = [25, 50, 100, 200] as const;

const FILTER_BTN =
  'rounded-md border px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300';
const FILTER_ACTIVE = 'border-slate-800 bg-slate-800 text-white';
const FILTER_IDLE =
  'border-slate-200/80 bg-card text-slate-600 hover:border-slate-300 hover:bg-slate-50';

function scrollToElementId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function StatCard({
  label,
  primary,
  secondary,
}: {
  label: string;
  primary: React.ReactNode;
  secondary?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="rounded-md border border-slate-200/80 bg-card p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-1.5 text-slate-900">{primary}</div>
      {secondary ? <div className="mt-1 text-xs text-slate-500">{secondary}</div> : null}
    </div>
  );
}

export function LLMTraceViewer({
  initialTraceId,
  initialResumeCode,
  initialResumeId,
  initialRequestScope,
  defaultAutoRefresh = true,
}: LLMTraceViewerProps) {
  const initialQuery = useMemo<TraceQuery>(
    () => ({
      traceId: initialTraceId?.trim() ?? '',
      resumeCode: initialResumeCode?.trim() ?? '',
      resumeId: initialResumeId?.trim() ?? '',
      requestScope: initialRequestScope?.trim() ?? '',
      successFilter: 'all',
      limit: 100,
    }),
    [initialRequestScope, initialResumeCode, initialResumeId, initialTraceId]
  );

  const [traceIdInput, setTraceIdInput] = useState(initialQuery.traceId);
  const [resumeCodeInput, setResumeCodeInput] = useState(initialQuery.resumeCode);
  const [resumeIdInput, setResumeIdInput] = useState(initialQuery.resumeId);
  const [requestScopeInput, setRequestScopeInput] = useState(initialQuery.requestScope);
  const [successFilterInput, setSuccessFilterInput] = useState<SuccessFilter>(
    initialQuery.successFilter
  );
  const [limitInput, setLimitInput] = useState(initialQuery.limit);
  const [query, setQuery] = useState<TraceQuery>(initialQuery);
  const [autoRefresh, setAutoRefresh] = useState(defaultAutoRefresh);
  const [summary, setSummary] = useState<LLMCallSummary | null>(null);
  const [calls, setCalls] = useState<LLMCallRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  /** When true, prompt/response previews for that call are hidden (toolbar). Default: expanded. */
  const [collapsedPreviewPanels, setCollapsedPreviewPanels] = useState<Record<string, boolean>>({});
  const [jumpSelectKey, setJumpSelectKey] = useState(0);

  const traceGroups = useMemo(() => groupCallsByResumeGeneration(calls), [calls]);
  const isTraceScoped = Boolean(query.traceId);

  const navItems: LlmTraceNavItem[] = useMemo(
    () => [
      { id: 'trace-query', label: 'Query & refresh' },
      { id: 'trace-summary', label: 'Summary' },
      { id: 'trace-operations', label: 'Operations' },
      { id: 'trace-timeline', label: 'Generations' },
      { id: 'trace-notes', label: 'Notes' },
    ],
    []
  );

  const loadData = useCallback(async (nextQuery: TraceQuery) => {
    setIsLoading(true);
    setError(null);

    const callParams: FetchLLMCallsParams = {
      traceId: nextQuery.traceId || undefined,
      resumeCode: nextQuery.resumeCode || undefined,
      resumeId: nextQuery.resumeId || undefined,
      requestScope: nextQuery.requestScope || undefined,
      success: toSuccessValue(nextQuery.successFilter),
      limit: nextQuery.limit,
    };

    try {
      const [summaryData, callsData] = await Promise.all([
        fetchLlmCallSummary({
          traceId: nextQuery.traceId || undefined,
          resumeCode: nextQuery.resumeCode || undefined,
          resumeId: nextQuery.resumeId || undefined,
          requestScope: nextQuery.requestScope || undefined,
        }),
        fetchLlmCalls(callParams),
      ]);

      setSummary(summaryData);
      setCalls(sortCalls(callsData, nextQuery.traceId || undefined));
      setLastUpdatedAt(new Date().toISOString());
    } catch (err) {
      console.error('Failed to load LLM trace data', err);
      setError(err instanceof Error ? err.message : 'Failed to load LLM trace data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData(query);
  }, [loadData, query]);

  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const timer = window.setInterval(() => {
      void loadData(query);
    }, 4000);

    return () => window.clearInterval(timer);
  }, [autoRefresh, loadData, query]);

  const handleApplyFilters = () => {
    setQuery({
      traceId: traceIdInput.trim(),
      resumeCode: resumeCodeInput.trim(),
      resumeId: resumeIdInput.trim(),
      requestScope: requestScopeInput.trim(),
      successFilter: successFilterInput,
      limit: limitInput,
    });
  };

  const handleClearFilters = () => {
    setTraceIdInput('');
    setResumeCodeInput('');
    setResumeIdInput('');
    setRequestScopeInput('');
    setSuccessFilterInput('all');
    setLimitInput(100);
    setQuery({
      traceId: '',
      resumeCode: '',
      resumeId: '',
      requestScope: '',
      successFilter: 'all',
      limit: 100,
    });
  };

  const togglePreviewPanels = (callId: string) => {
    setCollapsedPreviewPanels((current) => ({
      ...current,
      [callId]: !current[callId],
    }));
  };

  const currentModeLabel = query.traceId
    ? 'Chronological trace flow'
    : query.resumeCode || query.resumeId
      ? 'All calls linked to this resume'
      : query.requestScope
        ? 'Latest calls in this request scope'
        : 'Latest calls across the whole system';

  return (
    <div className="lg:grid lg:grid-cols-[10rem_minmax(0,1fr)] lg:items-start lg:gap-6">
      <aside className="mb-3 hidden min-w-0 self-start lg:sticky lg:top-4 lg:mb-0 lg:block lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <LlmTraceNav
          items={navItems}
          title="On this page"
          onJumped={() => setJumpSelectKey((k) => k + 1)}
        />
      </aside>

      <div className="min-w-0 space-y-4">
        <div className="lg:hidden">
          <select
            key={jumpSelectKey}
            defaultValue=""
            aria-label="Jump to section"
            className="h-9 w-full max-w-md rounded-md border border-slate-200/80 bg-card px-2 text-xs text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
            onChange={(e) => {
              const v = e.target.value;
              if (!v) return;
              scrollToElementId(v);
              setJumpSelectKey((k) => k + 1);
            }}
          >
            <option value="" disabled>
              Jump to section…
            </option>
            {navItems.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <section id="trace-query" className="scroll-mt-6 space-y-3">
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Query & refresh
          </h2>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,14rem)] lg:items-start">
            <div className="rounded-md border border-slate-200/80 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-slate-500">
                <Activity className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="text-xs font-medium text-slate-600">Filters</span>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="trace-id" className="text-xs text-slate-600">
                    Trace ID
                  </Label>
                  <Input
                    id="trace-id"
                    value={traceIdInput}
                    onChange={(event) => setTraceIdInput(event.target.value)}
                    placeholder="Paste request_id / trace_id"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] leading-snug text-slate-500">
                    One end-to-end request, including retries.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resume-code" className="text-xs text-slate-600">
                    Resume code
                  </Label>
                  <Input
                    id="resume-code"
                    value={resumeCodeInput}
                    onChange={(event) => setResumeCodeInput(event.target.value.toUpperCase())}
                    placeholder="ABC123"
                    className="font-mono text-sm uppercase"
                  />
                  <p className="text-[11px] leading-snug text-slate-500">
                    Pulls preview, cover letter, outreach, questions, and other calls tagged to the
                    resume.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="resume-id" className="text-xs text-slate-600">
                    Resume ID
                  </Label>
                  <Input
                    id="resume-id"
                    value={resumeIdInput}
                    onChange={(event) => setResumeIdInput(event.target.value)}
                    placeholder="tailored resume id"
                    className="font-mono text-sm"
                  />
                  <p className="text-[11px] leading-snug text-slate-500">
                    Useful when a code is not available on older trace rows.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="request-scope" className="text-xs text-slate-600">
                    Request scope
                  </Label>
                  <Input
                    id="request-scope"
                    value={requestScopeInput}
                    onChange={(event) => setRequestScopeInput(event.target.value)}
                    placeholder="resumes.improve_preview"
                    className="font-mono text-sm"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {REQUEST_SCOPE_SUGGESTIONS.map((scope) => (
                      <button
                        key={scope}
                        type="button"
                        onClick={() => setRequestScopeInput(scope)}
                        className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] text-slate-600 transition hover:bg-slate-200 hover:text-slate-900"
                      >
                        {scope}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col gap-4 border-t border-slate-100 pt-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Status
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', 'success', 'failed'] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setSuccessFilterInput(value)}
                        className={`${FILTER_BTN} ${
                          successFilterInput === value ? FILTER_ACTIVE : FILTER_IDLE
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Limit
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {LIMIT_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setLimitInput(value)}
                        className={`${FILTER_BTN} ${
                          limitInput === value ? FILTER_ACTIVE : FILTER_IDLE
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={handleApplyFilters} className="gap-1.5">
                    <Search className="h-3.5 w-3.5" aria-hidden />
                    Apply
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void loadData(query)}
                    className="gap-1.5 border-slate-200"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
                      aria-hidden
                    />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleClearFilters}
                    className="text-slate-600"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>

            <ToggleSwitch
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              label="Auto refresh"
              description="Poll every 4s while you work in another tab."
              density="compact"
              className="h-fit rounded-md border-slate-200/80 shadow-none"
            />
          </div>
        </section>

        <section id="trace-summary" className="scroll-mt-6 space-y-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Summary
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Mode"
              primary={<p className="text-sm leading-snug text-slate-800">{currentModeLabel}</p>}
              secondary={
                <span className="font-mono text-[11px] text-slate-500">
                  Updated {lastUpdatedAt ? formatTimestamp(lastUpdatedAt) : 'not yet'}
                </span>
              }
            />
            <StatCard
              label="Calls"
              primary={
                <p className="font-mono text-xl font-semibold">
                  {formatCount(summary?.total_calls)}
                </p>
              }
              secondary={
                <>
                  {formatCount(summary?.successful_calls)} successful /{' '}
                  {formatCount(summary?.failed_calls)} failed
                </>
              }
            />
            <StatCard
              label="Tokens"
              primary={
                <p className="font-mono text-xl font-semibold">
                  {formatCount(summary?.total_tokens)}
                </p>
              }
              secondary={
                <>
                  {formatCount(summary?.input_tokens)} in / {formatCount(summary?.output_tokens)}{' '}
                  out
                </>
              }
            />
            <StatCard
              label="Est. cost"
              primary={
                <p className="font-mono text-xl font-semibold">
                  {formatCost(summary?.estimated_cost_usd)}
                </p>
              }
              secondary={
                <>
                  {formatCount(summary?.usage_backed_calls)} usage-backed /{' '}
                  {formatCount(summary?.estimated_calls)} estimated
                </>
              }
            />
          </div>
        </section>

        <section id="trace-operations" className="scroll-mt-6 space-y-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Operation breakdown
          </h2>
          <div className="rounded-md border border-slate-200/80 bg-card p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <Database className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
              <span className="text-xs font-medium text-slate-600">By operation</span>
            </div>

            {summary?.operations?.length ? (
              <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {summary.operations.map((operation) => (
                  <div
                    key={operation.operation}
                    className="rounded-md border border-slate-200/80 bg-slate-50/60 p-3"
                  >
                    <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-800">
                      {operation.operation}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Calls
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                          {formatCount(operation.calls)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Success
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                          {formatCount(operation.successes)} / {formatCount(operation.failures)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Tokens
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                          {formatCount(operation.total_tokens)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          Cost
                        </p>
                        <p className="mt-0.5 font-mono text-sm font-semibold text-slate-900">
                          {formatCost(operation.estimated_cost_usd)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">No operation data for this filter.</p>
            )}
          </div>
        </section>

        <section id="trace-timeline" className="scroll-mt-6 space-y-2">
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
            Generations
          </h2>
          <p className="text-[11px] leading-snug text-slate-500">
            Each group shares one{' '}
            <code className="rounded bg-slate-100 px-1 font-mono">trace_id</code> (one API request
            such as a resume preview). Calls inside run in pipeline order.
          </p>
          <div className="rounded-md border border-slate-200/80 bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-slate-500">
                <Braces className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden />
                <span className="text-xs font-medium text-slate-600">Records</span>
              </div>
              {query.traceId ? (
                <p className="font-mono text-[11px] text-slate-400" title={query.traceId}>
                  {shortenId(query.traceId)}
                </p>
              ) : query.resumeCode || query.resumeId ? (
                <p
                  className="font-mono text-[11px] text-slate-400"
                  title={query.resumeCode || query.resumeId}
                >
                  resume {query.resumeCode || shortenId(query.resumeId)}
                </p>
              ) : null}
            </div>

            {error ? (
              <div className="mt-3 rounded-md border border-red-200 bg-red-50/90 p-3 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            {isLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin" strokeWidth={1.75} aria-hidden />
                Loading…
              </div>
            ) : null}

            {!isLoading && !error && calls.length === 0 ? (
              <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-600">
                No calls matched the current filters.
              </div>
            ) : null}

            <div className="mt-4 space-y-3">
              {traceGroups.map((group, index) => (
                <LlmTraceGenerationGroup
                  key={group.traceKey}
                  group={group}
                  defaultOpen={isTraceScoped || traceGroups.length <= 1 || index < 6}
                  isSingleTraceQuery={isTraceScoped}
                  collapsedPreviewsByCallId={collapsedPreviewPanels}
                  onToggleCallPreviews={togglePreviewPanels}
                />
              ))}
            </div>
          </div>
        </section>

        <section
          id="trace-notes"
          className="scroll-mt-6 rounded-md border border-slate-200/80 bg-slate-50/80 p-3 text-xs leading-relaxed text-slate-600"
        >
          <h2 className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Notes</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4 marker:text-slate-300">
            <li>
              <code className="rounded bg-card px-1 py-0.5 font-mono text-[11px] text-slate-800">
                trace_id
              </code>{' '}
              is one browser/API generation run; the timeline groups all LLM calls under it.
            </li>
            <li>
              <code className="rounded bg-card px-1 py-0.5 font-mono text-[11px] text-slate-800">
                request_scope
              </code>{' '}
              is better for watching a class of requests (e.g. preview or confirm).
            </li>
            <li>Previews may contain resume or JD text — keep this page internal-only.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
