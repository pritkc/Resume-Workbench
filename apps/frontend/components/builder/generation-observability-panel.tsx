'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, FileText, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchLlmCalls,
  fetchLlmCallSummary,
  type LLMCallRecord,
  type LLMCallSummary,
} from '@/lib/api/llm';
import {
  fetchGenerationRunTimingDetails,
  type GenerationRunTimingDetailRow,
} from '@/lib/api/config';
import {
  aggregateGroupCostUsd,
  aggregateGroupTokens,
  groupCallsByResumeGeneration,
  groupTimeRangeLabel,
  type TraceCallGroup,
} from '@/lib/observability/llm-trace-helpers';

type TracePanelTab = 'trace' | 'timeline' | 'raw-prompts';

function formatDuration(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'N/A';
  if (value < 1000) return `${value}ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(2)}s`;
  return `${(value / 60_000).toFixed(2)}m`;
}

function formatTimestamp(value?: string | null): string {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return value.toLocaleString();
}

function formatCurrency(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return 'N/A';
  return `$${value.toFixed(4)}`;
}

function shortId(value?: string | null): string {
  if (!value) return 'N/A';
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function compareCallTime(a: LLMCallRecord, b: LLMCallRecord): number {
  const aMs = Date.parse(a.created_at || '');
  const bMs = Date.parse(b.created_at || '');
  if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
  if (Number.isNaN(aMs)) return 1;
  if (Number.isNaN(bMs)) return -1;
  return aMs - bMs;
}

function getCallGenerationRunId(call: LLMCallRecord): string | null {
  const context = call.request_context ?? {};
  const value =
    context.generation_run_id ??
    context.preview_generation_run_id ??
    context.source_generation_run_id ??
    null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeCalls(calls: LLMCallRecord[], traceId?: string | null): LLMCallSummary {
  const operations = new Map<string, LLMCallSummary['operations'][number]>();
  let latencyTotal = 0;
  let latencyCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalTokens = 0;
  let estimatedCost = 0;
  let usageBackedCalls = 0;

  for (const call of calls) {
    const latency = call.latency_ms ?? 0;
    latencyTotal += latency;
    if (call.latency_ms != null) latencyCount += 1;
    const input = call.usage_input_tokens ?? call.prompt_tokens_est ?? 0;
    const output = call.usage_output_tokens ?? call.response_tokens_est ?? 0;
    const total = call.usage_total_tokens ?? input + output;
    const cost = call.estimated_total_cost_usd ?? 0;
    inputTokens += input;
    outputTokens += output;
    totalTokens += total;
    estimatedCost += cost;
    if (call.usage_total_tokens != null) usageBackedCalls += 1;

    const existing =
      operations.get(call.operation) ??
      ({
        operation: call.operation,
        calls: 0,
        successes: 0,
        failures: 0,
        latency_total_ms: 0,
        latency_avg_ms: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        estimated_cost_usd: 0,
      } satisfies LLMCallSummary['operations'][number]);
    existing.calls += 1;
    existing.successes += call.success ? 1 : 0;
    existing.failures += call.success ? 0 : 1;
    existing.latency_total_ms = (existing.latency_total_ms ?? 0) + latency;
    existing.latency_avg_ms =
      existing.calls > 0
        ? Math.round(((existing.latency_total_ms ?? 0) / existing.calls) * 100) / 100
        : 0;
    existing.input_tokens += input;
    existing.output_tokens += output;
    existing.total_tokens += total;
    existing.estimated_cost_usd += cost;
    operations.set(call.operation, existing);
  }

  const sortedCalls = [...calls].sort(compareCallTime);
  return {
    trace_id: traceId ?? sortedCalls[0]?.trace_id ?? null,
    request_scope: sortedCalls[0]?.request_scope ?? null,
    total_calls: calls.length,
    successful_calls: calls.filter((call) => call.success).length,
    failed_calls: calls.filter((call) => !call.success).length,
    latency_total_ms: latencyTotal,
    latency_avg_ms: latencyCount > 0 ? Math.round((latencyTotal / latencyCount) * 100) / 100 : 0,
    first_call_at: sortedCalls[0]?.created_at ?? null,
    last_call_at:
      sortedCalls[sortedCalls.length - 1]?.completed_at ??
      sortedCalls[sortedCalls.length - 1]?.created_at ??
      null,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: estimatedCost,
    usage_backed_calls: usageBackedCalls,
    estimated_calls: calls.length - usageBackedCalls,
    operations: [...operations.values()].sort((left, right) =>
      left.operation.localeCompare(right.operation)
    ),
  };
}

function selectCurrentCalls({
  traceCalls,
  resumeCalls,
  traceId,
  generationRunId,
}: {
  traceCalls: LLMCallRecord[];
  resumeCalls: LLMCallRecord[];
  traceId?: string | null;
  generationRunId?: string | null;
}): LLMCallRecord[] {
  if (traceCalls.length > 0) {
    return traceCalls;
  }
  const trimmedRunId = generationRunId?.trim();
  if (trimmedRunId) {
    const runCalls = resumeCalls.filter((call) => getCallGenerationRunId(call) === trimmedRunId);
    if (runCalls.length > 0) {
      return runCalls;
    }
  }
  const trimmedTraceId = traceId?.trim();
  if (trimmedTraceId) {
    const matchingTraceCalls = resumeCalls.filter((call) => call.trace_id === trimmedTraceId);
    if (matchingTraceCalls.length > 0) {
      return matchingTraceCalls;
    }
  }
  return groupCallsByResumeGeneration(resumeCalls)[0]?.calls ?? [];
}

function isSameGenerationGroup(group: TraceCallGroup, currentCalls: LLMCallRecord[]): boolean {
  if (currentCalls.length === 0) return false;
  const currentIds = new Set(currentCalls.map((call) => call.llm_call_id));
  return group.calls.some((call) => currentIds.has(call.llm_call_id));
}

export function GenerationObservabilityPanel({
  traceId,
  generationRunId,
  resumeId,
  resumeCode,
}: {
  traceId?: string | null;
  generationRunId?: string | null;
  resumeId?: string | null;
  resumeCode?: string | null;
}) {
  const [activeTab, setActiveTab] = useState<TracePanelTab>('trace');
  const [calls, setCalls] = useState<LLMCallRecord[]>([]);
  const [archivedGroups, setArchivedGroups] = useState<TraceCallGroup[]>([]);
  const [summary, setSummary] = useState<LLMCallSummary | null>(null);
  const [timing, setTiming] = useState<GenerationRunTimingDetailRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedCalls = useMemo(() => [...calls].sort(compareCallTime), [calls]);
  const resumeFilter = useMemo(
    () =>
      resumeCode?.trim() || resumeId?.trim()
        ? {
            resumeCode: resumeCode?.trim() || undefined,
            resumeId: resumeId?.trim() || undefined,
          }
        : null,
    [resumeCode, resumeId]
  );

  const refresh = useCallback(async () => {
    if (!traceId && !generationRunId && !resumeFilter) {
      setCalls([]);
      setArchivedGroups([]);
      setSummary(null);
      setTiming(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [traceCalls, resumeCalls, nextSummary, timingRows] = await Promise.all([
        traceId ? fetchLlmCalls({ traceId, limit: 500 }) : Promise.resolve([]),
        resumeFilter ? fetchLlmCalls({ ...resumeFilter, limit: 500 }) : Promise.resolve([]),
        traceId ? fetchLlmCallSummary({ traceId }) : Promise.resolve(null),
        generationRunId
          ? fetchGenerationRunTimingDetails({ generationRunId, limit: 1 })
          : Promise.resolve([]),
      ]);
      const currentCalls = selectCurrentCalls({
        traceCalls,
        resumeCalls,
        traceId,
        generationRunId,
      });
      const dedupedCurrentCalls = currentCalls.filter(
        (call, index, rows) =>
          rows.findIndex((row) => row.llm_call_id === call.llm_call_id) === index
      );
      const groups = groupCallsByResumeGeneration(resumeCalls);
      setCalls(dedupedCurrentCalls);
      setArchivedGroups(
        groups.filter((group) => !isSameGenerationGroup(group, dedupedCurrentCalls))
      );
      setSummary(nextSummary ?? summarizeCalls(dedupedCurrentCalls, traceId));
      setTiming(timingRows[0] ?? null);
    } catch (err) {
      console.error('Failed to load generation observability', err);
      setError(err instanceof Error ? err.message : 'Failed to load generation trace.');
    } finally {
      setLoading(false);
    }
  }, [generationRunId, resumeFilter, traceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (!traceId && !generationRunId && !resumeFilter) {
    return (
      <div className="border border-black/15 bg-white p-3 font-mono text-xs text-gray-600">
        No generation trace is linked to this resume. This is expected for older or manually created
        resumes.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col border border-black/15 bg-[#F0F0E8]">
      <section className="shrink-0 border-b border-black/10 bg-white px-3 py-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-blue-700" />
              <h3 className="font-mono text-[11px] font-semibold uppercase tracking-wide text-gray-900">
                Generation Trace
              </h3>
            </div>
            <p className="mt-1 font-mono text-[11px] leading-relaxed text-gray-600">
              Run <span title={generationRunId || undefined}>{shortId(generationRunId)}</span> ·
              Trace <span title={traceId || undefined}>{shortId(traceId)}</span>
              {resumeCode ? <> · Resume {resumeCode}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {traceId || resumeCode || resumeId ? (
              <Link
                href={
                  traceId
                    ? `/llm-traces?trace_id=${encodeURIComponent(traceId)}`
                    : resumeCode
                      ? `/llm-traces?resume_code=${encodeURIComponent(resumeCode)}`
                      : `/llm-traces?resume_id=${encodeURIComponent(resumeId || '')}`
                }
              >
                <Button size="xs" variant="outline">
                  Open Full Trace
                </Button>
              </Link>
            ) : null}
            <Button size="xs" variant="outline" onClick={() => void refresh()}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            ['trace', 'Trace'] as const,
            ['timeline', 'Timeline'] as const,
            ['raw-prompts', 'Raw Prompts'] as const,
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`border border-black/20 px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
                activeTab === id
                  ? 'bg-black text-white'
                  : 'bg-white text-black hover:bg-black/[0.04]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className="m-3 border border-red-300 bg-red-50 px-3 py-2 font-mono text-[11px] text-red-700">
          {error}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading && !summary && calls.length === 0 && !timing ? (
          <div className="flex items-center gap-2 font-mono text-xs text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading generation trace...
          </div>
        ) : null}

        {activeTab === 'trace' && (
          <div className="space-y-3">
            <div className="grid gap-2 md:grid-cols-4">
              <Metric label="Calls" value={formatNumber(summary?.total_calls)} />
              <Metric label="LLM Time" value={formatDuration(summary?.latency_total_ms)} />
              <Metric label="Tokens" value={formatNumber(summary?.total_tokens)} />
              <Metric label="Cost" value={formatCurrency(summary?.estimated_cost_usd)} />
            </div>
            <div className="border border-black/20 bg-white">
              <div className="border-b border-black/10 bg-[#F8F7F1] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                LLM Operations
              </div>
              <div className="divide-y divide-black/10">
                {(summary?.operations ?? []).map((operation) => (
                  <div
                    key={operation.operation}
                    className="grid gap-2 px-2 py-2 font-mono text-[11px] text-gray-800 md:grid-cols-[minmax(0,1fr)_80px_90px_80px]"
                  >
                    <span className="truncate" title={operation.operation}>
                      {operation.operation}
                    </span>
                    <span>{operation.calls} calls</span>
                    <span>{formatDuration(operation.latency_total_ms)}</span>
                    <span>{formatNumber(operation.total_tokens)} tok</span>
                  </div>
                ))}
                {summary && summary.operations.length === 0 ? (
                  <div className="px-2 py-3 font-mono text-[11px] text-gray-500">
                    No operation rows.
                  </div>
                ) : null}
              </div>
            </div>
            <ArchivedGenerationRuns groups={archivedGroups} />
          </div>
        )}

        {activeTab === 'timeline' && (
          <div className="space-y-3">
            {timing ? (
              <div className="border border-black/20 bg-white p-2">
                <div className="mb-2 flex flex-wrap gap-2">
                  <Metric label="Total" value={formatDuration(timing.total_duration_ms)} />
                  <Metric label="LLM" value={formatDuration(timing.llm_latency_total_ms)} />
                  <Metric label="Run Status" value={timing.status} />
                </div>
                <div className="space-y-1">
                  {timing.process_timings.map((process) => (
                    <div
                      key={process.process_key}
                      className="grid gap-2 border-t border-black/10 px-1 py-1.5 font-mono text-[11px] text-gray-800 md:grid-cols-[minmax(0,1fr)_90px]"
                    >
                      <span>{process.process_key}</span>
                      <span>{formatDuration(process.duration_ms)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border border-black/20 bg-white px-3 py-3 font-mono text-[11px] text-gray-500">
                No process timing was found for this generation run.
              </div>
            )}

            <div className="border border-black/20 bg-white">
              <div className="border-b border-black/10 bg-[#F8F7F1] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                LLM Call Timeline
              </div>
              {sortedCalls.map((call) => (
                <div
                  key={call.llm_call_id}
                  className="grid gap-2 border-b border-black/10 px-2 py-2 font-mono text-[11px] text-gray-800 last:border-b-0 md:grid-cols-[145px_minmax(0,1fr)_90px_90px]"
                >
                  <span>{formatTimestamp(call.created_at)}</span>
                  <span className="truncate" title={call.operation}>
                    {call.operation}
                  </span>
                  <span>{formatDuration(call.latency_ms)}</span>
                  <span>{call.success ? 'success' : 'failed'}</span>
                </div>
              ))}
              {sortedCalls.length === 0 ? (
                <div className="px-2 py-3 font-mono text-[11px] text-gray-500">
                  No LLM calls found.
                </div>
              ) : null}
            </div>
          </div>
        )}

        {activeTab === 'raw-prompts' && (
          <div className="space-y-3">
            {sortedCalls.map((call) => (
              <details key={call.llm_call_id} open className="border border-black/20 bg-white">
                <summary className="cursor-pointer px-2 py-2 font-mono text-[11px] font-semibold text-gray-900">
                  <FileText className="mr-1 inline h-3.5 w-3.5" />
                  {call.operation} · {call.model_name} · {formatDuration(call.latency_ms)}
                </summary>
                <div className="border-t border-black/10 p-2">
                  <div className="mb-2 flex flex-wrap gap-2 font-mono text-[10px] uppercase tracking-wide text-gray-500">
                    <span>{call.request_kind}</span>
                    <span>{call.json_mode ? 'json' : 'text'}</span>
                    <span>{call.finish_reason || 'finish N/A'}</span>
                  </div>
                  <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap break-words border border-black/10 bg-[#FAFAF7] p-2 font-mono text-[11px] leading-relaxed text-gray-800">
                    {call.prompt_preview || 'Prompt preview not stored.'}
                  </pre>
                  {call.response_preview ? (
                    <pre className="mt-2 max-h-[220px] overflow-auto whitespace-pre-wrap break-words border border-black/10 bg-white p-2 font-mono text-[11px] leading-relaxed text-gray-700">
                      {call.response_preview}
                    </pre>
                  ) : null}
                </div>
              </details>
            ))}
            {sortedCalls.length === 0 ? (
              <div className="border border-black/20 bg-white px-3 py-3 font-mono text-[11px] text-gray-500">
                No raw prompt rows found for this trace.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#1D4ED8] bg-[#EFF6FF] px-2 py-1">
      <div className="font-mono text-sm font-bold text-[#1D4ED8]">{value}</div>
      <div className="font-mono text-[10px] uppercase tracking-wide text-[#1D4ED8]/75">{label}</div>
    </div>
  );
}

function ArchivedGenerationRuns({ groups }: { groups: TraceCallGroup[] }) {
  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="border border-black/20 bg-white">
      <div className="border-b border-black/10 bg-[#F8F7F1] px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-600">
        Archived Generation Requests
      </div>
      <div className="divide-y divide-black/10">
        {groups.map((group) => {
          const operations = [...new Set(group.calls.map((call) => call.operation))];
          return (
            <details key={group.traceKey} className="group">
              <summary className="cursor-pointer list-none px-2 py-2 font-mono text-[11px] text-gray-900 hover:bg-black/[0.03]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {shortId(group.traceKey)} · {group.calls.length} calls ·{' '}
                    {groupTimeRangeLabel(group.calls)}
                  </span>
                  <span className="text-gray-600">
                    {formatNumber(aggregateGroupTokens(group.calls))} tok ·{' '}
                    {formatCurrency(aggregateGroupCostUsd(group.calls))}
                  </span>
                </div>
              </summary>
              <div className="border-t border-black/10 px-2 py-2 font-mono text-[11px] text-gray-700">
                {operations.join(', ') || 'No operations recorded.'}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}
