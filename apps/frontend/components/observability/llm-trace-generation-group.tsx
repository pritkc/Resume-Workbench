'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LlmTraceCallCard } from '@/components/observability/llm-trace-call-card';
import {
  aggregateGroupCostUsd,
  aggregateGroupTokens,
  formatCost,
  formatCount,
  groupTimeRangeLabel,
  shortenId,
  type TraceCallGroup,
} from '@/lib/observability/llm-trace-helpers';
import { ChevronDown, Layers } from 'lucide-react';

export function LlmTraceGenerationGroup({
  group,
  defaultOpen,
  isSingleTraceQuery,
  collapsedPreviewsByCallId,
  onToggleCallPreviews,
}: {
  group: TraceCallGroup;
  defaultOpen: boolean;
  isSingleTraceQuery: boolean;
  collapsedPreviewsByCallId: Record<string, boolean>;
  onToggleCallPreviews: (callId: string) => void;
}): React.ReactElement {
  const [open, setOpen] = useState(defaultOpen);
  const { traceKey, calls } = group;
  const scope = calls[0]?.request_scope ?? 'n/a';
  const failed = calls.filter((c) => !c.success).length;
  const tokens = aggregateGroupTokens(calls);
  const cost = aggregateGroupCostUsd(calls);

  return (
    <details
      className="group rounded-md border border-slate-200/90 bg-slate-50/40 shadow-sm open:bg-white"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 p-3 marker:hidden [&::-webkit-details-marker]:hidden">
        <ChevronDown
          className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          strokeWidth={1.75}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Layers className="h-4 w-4 shrink-0 text-slate-400" strokeWidth={1.75} aria-hidden />
            <span className="text-xs font-medium text-slate-800">Resume generation</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
              {formatCount(calls.length)} LLM call{calls.length === 1 ? '' : 's'}
            </span>
            {failed > 0 ? (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                {formatCount(failed)} failed
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[11px] leading-snug text-slate-500" title={traceKey}>
            trace <span className="text-slate-700">{shortenId(traceKey)}</span>
            {traceKey.length > 22 ? (
              <span className="text-slate-400"> · full id in link below</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-slate-500">
            <span>scope {scope}</span>
            <span>{formatCount(tokens)} tok</span>
            <span>{formatCost(cost)}</span>
            <span>{groupTimeRangeLabel(calls)}</span>
          </div>
          {!isSingleTraceQuery ? (
            <Link
              href={`/llm-traces?trace_id=${encodeURIComponent(traceKey)}`}
              className="inline-block pt-1 text-[11px] font-medium text-blue-700 underline-offset-2 hover:underline"
            >
              Open only this generation
            </Link>
          ) : null}
        </div>
      </summary>

      <div className="space-y-3 border-t border-slate-100 px-3 pb-3 pt-1">
        {calls.map((call) => (
          <LlmTraceCallCard
            key={call.llm_call_id}
            call={call}
            previewsOpen={!collapsedPreviewsByCallId[call.llm_call_id]}
            onTogglePreviews={() => onToggleCallPreviews(call.llm_call_id)}
          />
        ))}
      </div>
    </details>
  );
}
