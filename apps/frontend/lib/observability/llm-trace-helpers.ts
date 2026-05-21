import type { LLMCallRecord } from '@/lib/api/llm';

export type SuccessFilter = 'all' | 'success' | 'failed';

export function toSuccessValue(value: SuccessFilter): boolean | undefined {
  if (value === 'success') return true;
  if (value === 'failed') return false;
  return undefined;
}

export function formatCount(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}

export function formatCost(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value ?? 0);
}

export function formatTimestamp(value?: string | null): string {
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

export function formatLatency(value?: number | null): string {
  if (value === undefined || value === null) return 'n/a';
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

export function shortenId(value?: string | null): string {
  if (!value) return 'n/a';
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

export function getInputTokens(call: LLMCallRecord): number {
  return call.usage_input_tokens ?? call.prompt_tokens_est ?? 0;
}

export function getOutputTokens(call: LLMCallRecord): number {
  return call.usage_output_tokens ?? call.response_tokens_est ?? 0;
}

export function getCapUtilization(call: LLMCallRecord): number | null {
  const output = call.usage_output_tokens ?? call.response_tokens_est;
  const cap = call.max_tokens;
  if (output == null || cap == null || cap === 0) return null;
  return output / cap;
}

function getPreviewChars(value?: string | null): number {
  return value?.length ?? 0;
}

function hasStoredTruncation(value?: string | null): boolean {
  return value?.includes('[truncated ') ?? false;
}

export function renderPreviewStats(
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

export function sortCalls(calls: LLMCallRecord[], traceId?: string): LLMCallRecord[] {
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

/** One HTTP / pipeline run: backend sets the same trace_id for every LLM call in llm_trace_scope. */
export function traceGroupKey(call: LLMCallRecord): string {
  const tid = call.trace_id?.trim();
  if (tid) return tid;
  return call.call_group_id || call.llm_call_id;
}

export type TraceCallGroup = {
  traceKey: string;
  calls: LLMCallRecord[];
  newestCreatedAt: number;
};

export function getCallResumeCode(call: LLMCallRecord): string | null {
  const context = call.request_context ?? {};
  const value =
    context.resume_code ?? context.tailored_resume_code ?? context.source_resume_code ?? null;
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

export function getCallResumeId(call: LLMCallRecord): string | null {
  const context = call.request_context ?? {};
  const value = context.resume_id ?? context.tailored_resume_id ?? context.source_resume_id ?? null;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/**
 * Partition flat API results into one group per resume-generation (or other) request.
 * Groups are ordered newest-first; calls inside each group are oldest-first (pipeline order).
 */
export function groupCallsByResumeGeneration(calls: LLMCallRecord[]): TraceCallGroup[] {
  const map = new Map<string, LLMCallRecord[]>();
  for (const c of calls) {
    const key = traceGroupKey(c);
    const bucket = map.get(key);
    if (bucket) bucket.push(c);
    else map.set(key, [c]);
  }

  const groups: TraceCallGroup[] = [];
  for (const [traceKey, groupCalls] of map) {
    const sorted = [...groupCalls].sort(
      (a, b) => new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime()
    );
    const newestCreatedAt = Math.max(
      0,
      ...sorted.map((c) => new Date(c.created_at ?? 0).getTime())
    );
    groups.push({ traceKey, calls: sorted, newestCreatedAt });
  }

  groups.sort((a, b) => b.newestCreatedAt - a.newestCreatedAt);
  return groups;
}

export function aggregateGroupTokens(calls: LLMCallRecord[]): number {
  return calls.reduce((sum, c) => sum + getInputTokens(c) + getOutputTokens(c), 0);
}

export function aggregateGroupCostUsd(calls: LLMCallRecord[]): number {
  return calls.reduce((sum, c) => sum + (c.estimated_total_cost_usd ?? 0), 0);
}

export function groupTimeRangeLabel(calls: LLMCallRecord[]): string {
  if (calls.length === 0) return 'n/a';
  const first = calls[0]?.created_at;
  const last = calls[calls.length - 1]?.completed_at ?? calls[calls.length - 1]?.created_at;
  return `${formatTimestamp(first)} → ${formatTimestamp(last)}`;
}
