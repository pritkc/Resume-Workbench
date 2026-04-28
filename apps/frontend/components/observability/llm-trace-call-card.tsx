'use client';

import React from 'react';
import type { LLMCallRecord } from '@/lib/api/llm';
import {
  formatCost,
  formatCount,
  formatLatency,
  formatTimestamp,
  getInputTokens,
  getOutputTokens,
  renderPreviewStats,
  shortenId,
} from '@/lib/observability/llm-trace-helpers';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';

const PRE_BASE =
  'mt-2 min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-800 max-lg:min-h-[min(48dvh,22rem)]';

function PreviewPane({
  title,
  statsLine,
  body,
}: {
  title: string;
  statsLine: string;
  body: string;
}): React.ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-md border border-slate-200 bg-white p-3 shadow-sm lg:h-full lg:min-h-0">
      <p className="shrink-0 font-mono text-xs font-semibold uppercase tracking-wide text-slate-800">
        {title}
      </p>
      <p className="mt-1 shrink-0 font-mono text-[10px] uppercase tracking-wide text-slate-400">
        {statsLine}
      </p>
      <pre className={PRE_BASE}>{body}</pre>
    </div>
  );
}

export function LlmTraceCallCard({
  call,
  previewsOpen,
  onTogglePreviews,
}: {
  call: LLMCallRecord;
  previewsOpen: boolean;
  onTogglePreviews: () => void;
}): React.ReactElement {
  return (
    <article
      className={`rounded-md border p-4 ${
        call.success
          ? 'border-slate-200/90 bg-white shadow-sm'
          : 'border-red-200 bg-red-50/80 shadow-sm'
      }`}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold uppercase tracking-wide text-slate-900">
              {call.operation}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[11px] uppercase ${
                call.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-red-200 bg-white text-red-800'
              }`}
            >
              {call.success ? (
                <CheckCircle2 className="h-3 w-3" aria-hidden />
              ) : (
                <XCircle className="h-3 w-3" aria-hidden />
              )}
              {call.success ? 'success' : 'failed'}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] uppercase text-slate-600">
              attempt {call.attempt}
            </span>
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] uppercase text-slate-600">
              {call.request_kind}
            </span>
            {call.json_mode ? (
              <span className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] uppercase text-slate-600">
                json mode
              </span>
            ) : null}
          </div>

          <div className="font-mono text-xs text-slate-500">
            {call.provider} / {call.model_name} / group {shortenId(call.call_group_id)}
          </div>

          <div className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Trace</p>
              <p className="mt-0.5 font-mono text-slate-800">{shortenId(call.trace_id)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Scope</p>
              <p className="mt-0.5 font-mono text-slate-800">{call.request_scope ?? 'n/a'}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                Created
              </p>
              <p className="mt-0.5 font-mono text-slate-800">{formatTimestamp(call.created_at)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                Finished
              </p>
              <p className="mt-0.5 font-mono text-slate-800">
                {formatTimestamp(call.completed_at)}
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                Prompt size
              </p>
              <p className="mt-0.5 font-mono text-slate-800">
                {formatCount(call.prompt_chars)} chars
              </p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
                Response size
              </p>
              <p className="mt-0.5 font-mono text-slate-800">
                {formatCount(call.response_chars ?? 0)} chars
              </p>
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-2 text-sm lg:w-[min(100%,20rem)]">
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Latency</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {formatLatency(call.latency_ms)}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
              Finish reason
            </p>
            <p className="mt-0.5 break-all font-mono font-semibold text-slate-900">
              {call.finish_reason ?? 'n/a'}
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">Tokens</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {formatCount(getInputTokens(call) + getOutputTokens(call))}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              {formatCount(getInputTokens(call))} in / {formatCount(getOutputTokens(call))} out
            </p>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50/80 p-2.5">
            <p className="font-mono text-[10px] uppercase tracking-wide text-slate-400">
              Est. cost
            </p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {formatCost(call.estimated_total_cost_usd)}
            </p>
            <p className="mt-0.5 font-mono text-[10px] text-slate-500">
              max {call.max_tokens ?? 'n/a'} tokens
            </p>
          </div>
        </div>
      </div>

      {(call.error_type || call.error_message) && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50/90 p-3">
          <div className="flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="font-mono text-xs font-semibold uppercase tracking-wide">
                {call.error_type ?? 'error'}
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
                {call.error_message}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        <button
          type="button"
          onClick={onTogglePreviews}
          className="flex w-full items-center justify-between gap-2 rounded-md border border-slate-200/80 bg-slate-50/80 px-3 py-2 text-left text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-100"
        >
          <span>Prompt & response previews</span>
          {previewsOpen ? (
            <ChevronUp className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          )}
        </button>

        {previewsOpen ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-col gap-3 lg:min-h-[min(85dvh,52rem)] lg:flex-row lg:gap-4">
              <PreviewPane
                title="Prompt"
                statsLine={renderPreviewStats('Prompt', call.prompt_preview, call.prompt_chars)}
                body={call.prompt_preview || 'No prompt preview stored.'}
              />
              <PreviewPane
                title="Response"
                statsLine={renderPreviewStats(
                  'Response',
                  call.response_preview,
                  call.response_chars
                )}
                body={call.response_preview || 'No response preview stored.'}
              />
            </div>

            <details className="rounded-md border border-slate-200 bg-white p-3">
              <summary className="cursor-pointer font-mono text-xs font-semibold uppercase tracking-wide text-slate-700">
                Request context (JSON)
              </summary>
              <pre className="mt-2 max-h-[min(42dvh,24rem)] overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800">
                {call.request_context
                  ? JSON.stringify(call.request_context, null, 2)
                  : 'No request context stored.'}
              </pre>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
