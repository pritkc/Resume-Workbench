'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import {
  fetchLlmCalls,
  fetchLlmCallSummary,
  type FetchLLMCallsParams,
  type LLMCallRecord,
  type LLMCallSummary,
} from '@/lib/api/llm';
import {
  Activity,
  AlertTriangle,
  Braces,
  CheckCircle2,
  Clock3,
  Database,
  Loader2,
  RefreshCw,
  Search,
  XCircle,
} from 'lucide-react';

type SuccessFilter = 'all' | 'success' | 'failed';

interface TraceQuery {
  traceId: string;
  requestScope: string;
  successFilter: SuccessFilter;
  limit: number;
}

interface LLMTraceViewerProps {
  initialTraceId?: string | null;
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

const FILTER_BUTTON_BASE =
  'border border-black px-3 py-2 text-xs font-mono uppercase tracking-wider transition-colors';
const FILTER_BUTTON_ACTIVE = 'bg-blue-700 text-white';
const FILTER_BUTTON_INACTIVE = 'bg-white text-gray-700 hover:bg-[#E5E5E0]';

function toSuccessValue(value: SuccessFilter): boolean | undefined {
  if (value === 'success') return true;
  if (value === 'failed') return false;
  return undefined;
}

function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

function formatCost(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'n/a';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatLatency(value?: number | null): string {
  if (value === undefined || value === null) return 'n/a';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function shortenId(value?: string | null): string {
  if (!value) return 'n/a';
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

function getInputTokens(call: LLMCallRecord): number {
  return call.usage_input_tokens ?? call.prompt_tokens_est ?? 0;
}

function getOutputTokens(call: LLMCallRecord): number {
  return call.usage_output_tokens ?? call.response_tokens_est ?? 0;
}

function getPreviewChars(value?: string | null): number {
  return value?.length ?? 0;
}

function hasStoredTruncation(value?: string | null): boolean {
  return value?.includes('[truncated ') ?? false;
}

function renderPreviewStats(
  label: string,
  preview: string | null | undefined,
  totalChars: number | null | undefined
): string {
  const previewChars = getPreviewChars(preview);
  const total = totalChars ?? previewChars;
  const suffix =
    hasStoredTruncation(preview) || total > previewChars ? ' / stored preview is truncated' : '';
  return `${label}: ${formatCount(total)} total chars / ${formatCount(previewChars)} shown${suffix}`;
}

function sortCalls(calls: LLMCallRecord[], traceId?: string): LLMCallRecord[] {
  const sorted = [...calls].sort((left, right) => {
    const leftTime = new Date(left.created_at ?? 0).getTime();
    const rightTime = new Date(right.created_at ?? 0).getTime();
    return leftTime - rightTime;
  });

  if (traceId) {
    return sorted;
  }

  return sorted.reverse();
}

export function LLMTraceViewer({
  initialTraceId,
  initialRequestScope,
  defaultAutoRefresh = true,
}: LLMTraceViewerProps) {
  const initialQuery = useMemo<TraceQuery>(
    () => ({
      traceId: initialTraceId?.trim() ?? '',
      requestScope: initialRequestScope?.trim() ?? '',
      successFilter: 'all',
      limit: 100,
    }),
    [initialRequestScope, initialTraceId]
  );

  const [traceIdInput, setTraceIdInput] = useState(initialQuery.traceId);
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
  const [expandedPreviewCalls, setExpandedPreviewCalls] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async (nextQuery: TraceQuery) => {
    setIsLoading(true);
    setError(null);

    const callParams: FetchLLMCallsParams = {
      traceId: nextQuery.traceId || undefined,
      requestScope: nextQuery.requestScope || undefined,
      success: toSuccessValue(nextQuery.successFilter),
      limit: nextQuery.limit,
    };

    try {
      const [summaryData, callsData] = await Promise.all([
        fetchLlmCallSummary({
          traceId: nextQuery.traceId || undefined,
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
      requestScope: requestScopeInput.trim(),
      successFilter: successFilterInput,
      limit: limitInput,
    });
  };

  const handleClearFilters = () => {
    setTraceIdInput('');
    setRequestScopeInput('');
    setSuccessFilterInput('all');
    setLimitInput(100);
    setQuery({
      traceId: '',
      requestScope: '',
      successFilter: 'all',
      limit: 100,
    });
  };

  const togglePreviewPanels = (callId: string) => {
    setExpandedPreviewCalls((current) => ({
      ...current,
      [callId]: !current[callId],
    }));
  };

  const currentModeLabel = query.traceId
    ? 'Chronological trace flow'
    : query.requestScope
      ? 'Latest calls in this request scope'
      : 'Latest calls across the whole system';

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="border border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              Query
            </p>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="trace-id">Trace ID</Label>
              <Input
                id="trace-id"
                value={traceIdInput}
                onChange={(event) => setTraceIdInput(event.target.value)}
                placeholder="Paste request_id / trace_id"
                className="font-mono"
              />
              <p className="text-xs text-gray-500">
                Best for one end-to-end request flow, including retries.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="request-scope">Request Scope</Label>
              <Input
                id="request-scope"
                value={requestScopeInput}
                onChange={(event) => setRequestScopeInput(event.target.value)}
                placeholder="resumes.improve_preview"
                className="font-mono"
              />
              <div className="flex flex-wrap gap-2">
                {REQUEST_SCOPE_SUGGESTIONS.map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    onClick={() => setRequestScopeInput(scope)}
                    className="border border-black bg-[#F6F5EE] px-2 py-1 font-mono text-[11px] uppercase tracking-wide hover:bg-[#E5E5E0]"
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto_auto]">
            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                Status Filter
              </p>
              <div className="flex flex-wrap gap-2">
                {(['all', 'success', 'failed'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSuccessFilterInput(value)}
                    className={`${FILTER_BUTTON_BASE} ${
                      successFilterInput === value ? FILTER_BUTTON_ACTIVE : FILTER_BUTTON_INACTIVE
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                Limit
              </p>
              <div className="flex flex-wrap gap-2">
                {LIMIT_OPTIONS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLimitInput(value)}
                    className={`${FILTER_BUTTON_BASE} ${
                      limitInput === value ? FILTER_BUTTON_ACTIVE : FILTER_BUTTON_INACTIVE
                    }`}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
                Actions
              </p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleApplyFilters} className="gap-2">
                  <Search className="h-4 w-4" />
                  Apply
                </Button>
                <Button variant="outline" onClick={() => void loadData(query)} className="gap-2">
                  <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
                <Button variant="outline" onClick={handleClearFilters}>
                  Clear
                </Button>
              </div>
            </div>
          </div>
        </div>

        <ToggleSwitch
          checked={autoRefresh}
          onCheckedChange={setAutoRefresh}
          label="Auto Refresh"
          description="Poll every 4 seconds so you can keep this page open while another tab is generating."
          className="h-fit"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Mode
          </p>
          <p className="mt-2 text-sm text-gray-800">{currentModeLabel}</p>
          <p className="mt-2 font-mono text-xs text-gray-500">
            Updated {lastUpdatedAt ? formatTimestamp(lastUpdatedAt) : 'not yet'}
          </p>
        </div>
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Calls
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">{formatCount(summary?.total_calls)}</p>
          <p className="mt-2 text-xs text-gray-500">
            {formatCount(summary?.successful_calls)} successful /{' '}
            {formatCount(summary?.failed_calls)} failed
          </p>
        </div>
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Tokens
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">{formatCount(summary?.total_tokens)}</p>
          <p className="mt-2 text-xs text-gray-500">
            {formatCount(summary?.input_tokens)} in / {formatCount(summary?.output_tokens)} out
          </p>
        </div>
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Estimated Cost
          </p>
          <p className="mt-2 font-mono text-2xl font-bold">
            {formatCost(summary?.estimated_cost_usd)}
          </p>
          <p className="mt-2 text-xs text-gray-500">
            {formatCount(summary?.usage_backed_calls)} usage-backed /{' '}
            {formatCount(summary?.estimated_calls)} estimated
          </p>
        </div>
      </div>

      <div className="border border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4" />
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
            Operation Breakdown
          </p>
        </div>

        {summary?.operations?.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {summary.operations.map((operation) => (
              <div key={operation.operation} className="border border-black bg-[#F8F7F1] p-4">
                <p className="font-mono text-sm font-bold uppercase">{operation.operation}</p>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      Calls
                    </p>
                    <p className="mt-1 font-mono font-bold">{formatCount(operation.calls)}</p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      Success
                    </p>
                    <p className="mt-1 font-mono font-bold">
                      {formatCount(operation.successes)} / {formatCount(operation.failures)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      Tokens
                    </p>
                    <p className="mt-1 font-mono font-bold">
                      {formatCount(operation.total_tokens)}
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      Cost
                    </p>
                    <p className="mt-1 font-mono font-bold">
                      {formatCost(operation.estimated_cost_usd)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">No operation data yet for this filter.</p>
        )}
      </div>

      <div className="border border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.08)]">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4" />
            <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-gray-500">
              Call Timeline
            </p>
          </div>
          {query.traceId && (
            <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
              Trace {shortenId(query.traceId)}
            </p>
          )}
        </div>

        {error && (
          <div className="mt-4 border border-red-300 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {isLoading && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading LLM trace data...
          </div>
        )}

        {!isLoading && !error && calls.length === 0 && (
          <div className="mt-4 border border-dashed border-gray-300 bg-[#F8F7F1] p-5 text-sm text-gray-500">
            No calls matched the current filters.
          </div>
        )}

        <div className="mt-4 space-y-4">
          {calls.map((call) => {
            const previewsExpanded = Boolean(expandedPreviewCalls[call.llm_call_id]);

            return (
              <article
                key={call.llm_call_id}
                className={`border p-4 ${
                  call.success ? 'border-black bg-[#F8F7F1]' : 'border-red-400 bg-red-50'
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold uppercase">
                        {call.operation}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 border px-2 py-1 font-mono text-[11px] uppercase ${
                          call.success
                            ? 'border-green-700 text-green-700'
                            : 'border-red-700 text-red-700'
                        }`}
                      >
                        {call.success ? (
                          <CheckCircle2 className="h-3 w-3" />
                        ) : (
                          <XCircle className="h-3 w-3" />
                        )}
                        {call.success ? 'success' : 'failed'}
                      </span>
                      <span className="border border-black px-2 py-1 font-mono text-[11px] uppercase">
                        attempt {call.attempt}
                      </span>
                      <span className="border border-black px-2 py-1 font-mono text-[11px] uppercase">
                        {call.request_kind}
                      </span>
                      {call.json_mode && (
                        <span className="border border-black px-2 py-1 font-mono text-[11px] uppercase">
                          json mode
                        </span>
                      )}
                    </div>

                    <div className="font-mono text-xs text-gray-500">
                      {call.provider} / {call.model_name} / group {shortenId(call.call_group_id)}
                    </div>

                    <div className="grid gap-2 text-xs text-gray-600 md:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">Trace</p>
                        <p className="mt-1 font-mono">{shortenId(call.trace_id)}</p>
                      </div>
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">Scope</p>
                        <p className="mt-1 font-mono">{call.request_scope ?? 'n/a'}</p>
                      </div>
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">Created</p>
                        <p className="mt-1 font-mono">{formatTimestamp(call.created_at)}</p>
                      </div>
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">Finished</p>
                        <p className="mt-1 font-mono">{formatTimestamp(call.completed_at)}</p>
                      </div>
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">
                          Prompt Size
                        </p>
                        <p className="mt-1 font-mono">{formatCount(call.prompt_chars)} chars</p>
                      </div>
                      <div>
                        <p className="font-mono uppercase tracking-wider text-gray-500">
                          Response Size
                        </p>
                        <p className="mt-1 font-mono">
                          {formatCount(call.response_chars ?? 0)} chars
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm lg:min-w-[320px]">
                    <div className="border border-black bg-white p-3">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                        Latency
                      </p>
                      <p className="mt-1 font-mono font-bold">{formatLatency(call.latency_ms)}</p>
                    </div>
                    <div className="border border-black bg-white p-3">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                        Finish Reason
                      </p>
                      <p className="mt-1 font-mono font-bold">{call.finish_reason ?? 'n/a'}</p>
                    </div>
                    <div className="border border-black bg-white p-3">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                        Tokens
                      </p>
                      <p className="mt-1 font-mono font-bold">
                        {formatCount(getInputTokens(call) + getOutputTokens(call))}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-gray-500">
                        {formatCount(getInputTokens(call))} in /{' '}
                        {formatCount(getOutputTokens(call))} out
                      </p>
                    </div>
                    <div className="border border-black bg-white p-3">
                      <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">
                        Est. Cost
                      </p>
                      <p className="mt-1 font-mono font-bold">
                        {formatCost(call.estimated_total_cost_usd)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-gray-500">
                        max {call.max_tokens ?? 'n/a'} tokens
                      </p>
                    </div>
                  </div>
                </div>

                {(call.error_type || call.error_message) && (
                  <div className="mt-4 border border-red-300 bg-red-50 p-3">
                    <div className="flex items-start gap-2 text-sm text-red-700">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        <p className="font-mono font-bold uppercase tracking-wider">
                          {call.error_type ?? 'error'}
                        </p>
                        <p className="mt-1 whitespace-pre-wrap text-sm">{call.error_message}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-4 grid gap-3 xl:grid-cols-3">
                  <details open={previewsExpanded} className="border border-black bg-white p-3">
                    <summary
                      className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider"
                      onClick={(event) => {
                        event.preventDefault();
                        togglePreviewPanels(call.llm_call_id);
                      }}
                    >
                      Prompt Preview
                    </summary>
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      {renderPreviewStats('Prompt', call.prompt_preview, call.prompt_chars)}
                    </p>
                    <pre className="mt-3 h-80 overflow-auto whitespace-pre-wrap break-words border border-black bg-[#F8F7F1] p-3 text-xs text-gray-700">
                      {call.prompt_preview || 'No prompt preview stored.'}
                    </pre>
                  </details>

                  <details open={previewsExpanded} className="border border-black bg-white p-3">
                    <summary
                      className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider"
                      onClick={(event) => {
                        event.preventDefault();
                        togglePreviewPanels(call.llm_call_id);
                      }}
                    >
                      Response Preview
                    </summary>
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-wider text-gray-500">
                      {renderPreviewStats('Response', call.response_preview, call.response_chars)}
                    </p>
                    <pre className="mt-3 h-80 overflow-auto whitespace-pre-wrap break-words border border-black bg-[#F8F7F1] p-3 text-xs text-gray-700">
                      {call.response_preview || 'No response preview stored.'}
                    </pre>
                  </details>

                  <details open={previewsExpanded} className="border border-black bg-white p-3">
                    <summary
                      className="cursor-pointer font-mono text-xs font-bold uppercase tracking-wider"
                      onClick={(event) => {
                        event.preventDefault();
                        togglePreviewPanels(call.llm_call_id);
                      }}
                    >
                      Request Context
                    </summary>
                    <pre className="mt-3 h-80 overflow-auto whitespace-pre-wrap break-words border border-black bg-[#F8F7F1] p-3 text-xs text-gray-700">
                      {call.request_context
                        ? JSON.stringify(call.request_context, null, 2)
                        : 'No request context stored.'}
                    </pre>
                  </details>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="border border-black bg-[#F8F7F1] p-4 text-sm text-gray-600">
        <div className="flex items-center gap-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
          <Clock3 className="h-4 w-4" />
          Notes
        </div>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>`trace_id` follows one request end-to-end. Use it when you want the exact flow.</li>
          <li>
            `request_scope` is better for live watching a class of requests, like preview or
            confirm.
          </li>
          <li>
            Prompt and response previews can contain resume/JD content, so keep this page
            internal-only.
          </li>
        </ul>
      </div>
    </div>
  );
}
