'use client';

import React, { useMemo } from 'react';
import type { LLMCallRecord } from '@/lib/api/llm';
import { CopyCharBar } from '@/components/settings/prompt-field-chrome';
import {
  formatCost,
  formatCount,
  formatLatency,
  formatTimestamp,
  getCapUtilization,
  getInputTokens,
  getOutputTokens,
  renderPreviewStats,
  shortenId,
} from '@/lib/observability/llm-trace-helpers';
import { useTranslations } from '@/lib/i18n';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, XCircle } from 'lucide-react';

const PRE_BASE =
  'min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[13px] leading-relaxed text-slate-800 max-lg:min-h-[min(48dvh,22rem)]';

const CONTEXT_PRE =
  'max-h-[min(42dvh,24rem)] overflow-auto whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-[12px] leading-relaxed text-slate-800';

function PreviewPane({
  title,
  statsLine,
  body,
}: {
  title: string;
  statsLine: string;
  body: string;
}): React.ReactElement {
  const { t } = useTranslations();
  return (
    <div className="flex min-w-0 flex-1 flex-col rounded-md border border-slate-200 bg-white p-3 shadow-sm lg:h-full lg:min-h-0">
      <div className="mb-1 flex shrink-0 items-end justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-800">
            {title}
          </p>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-slate-400">
            {statsLine}
          </p>
        </div>
        <CopyCharBar text={body} t={t} />
      </div>
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
  const { t } = useTranslations();
  const requestContextText = useMemo(
    () =>
      call.request_context
        ? JSON.stringify(call.request_context, null, 2)
        : 'No request context stored.',
    [call.request_context]
  );
  const compactEnvelope =
    typeof call.request_context?.compact_diff_validation === 'object' &&
    call.request_context.compact_diff_validation !== null &&
    !Array.isArray(call.request_context.compact_diff_validation)
      ? (call.request_context.compact_diff_validation as Record<string, unknown>)
      : null;

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
            {call.request_context?.response_had_fence === true ? (
              <span className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-mono text-[11px] uppercase text-amber-800">
                fence
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
            {(() => {
              const util = getCapUtilization(call);
              if (util === null) return null;
              const pct = Math.round(util * 100);
              const color =
                pct >= 85 ? 'text-red-600' : pct >= 50 ? 'text-amber-600' : 'text-emerald-600';
              return <p className={`mt-0.5 font-mono text-[10px] ${color}`}>{pct}% of cap</p>;
            })()}
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

      {compactEnvelope ? (
        <div
          className={`mt-4 rounded-md border p-3 ${
            compactEnvelope.valid === false
              ? 'border-amber-200 bg-amber-50/90'
              : 'border-emerald-200 bg-emerald-50/70'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-xs font-semibold uppercase tracking-wide text-slate-800">
              Compact envelope validation
            </p>
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase ${
                compactEnvelope.valid === false
                  ? 'border-amber-300 bg-white text-amber-900'
                  : 'border-emerald-300 bg-white text-emerald-900'
              }`}
            >
              {compactEnvelope.valid === false ? 'issues' : 'ok'}
            </span>
            {typeof compactEnvelope.phase === 'string' && compactEnvelope.phase ? (
              <span className="rounded border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] uppercase text-slate-700">
                {compactEnvelope.phase}
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-[11px] leading-snug text-slate-600">
            {typeof compactEnvelope.origin === 'string' ? compactEnvelope.origin : 'Origin unknown'}
          </p>
          <p className="mt-1 font-mono text-[11px] text-slate-700">
            {typeof compactEnvelope.error_count === 'number' ? compactEnvelope.error_count : 0}{' '}
            error
            {(typeof compactEnvelope.error_count === 'number' ? compactEnvelope.error_count : 0) ===
            1
              ? ''
              : 's'}
            {' · '}
            {typeof compactEnvelope.warning_count === 'number'
              ? compactEnvelope.warning_count
              : 0}{' '}
            warning
            {(typeof compactEnvelope.warning_count === 'number'
              ? compactEnvelope.warning_count
              : 0) === 1
              ? ''
              : 's'}
          </p>
          {Array.isArray(compactEnvelope.errors) && compactEnvelope.errors.length > 0 ? (
            <ul className="mt-2 max-h-[min(32dvh,18rem)] list-disc space-y-1 overflow-auto pl-4 font-mono text-[11px] text-slate-800">
              {compactEnvelope.errors.map((line, idx) => (
                <li key={idx}>{String(line)}</li>
              ))}
            </ul>
          ) : null}
          {Array.isArray(compactEnvelope.warnings) && compactEnvelope.warnings.length > 0 ? (
            <ul className="mt-2 max-h-[min(20dvh,12rem)] list-disc space-y-1 overflow-auto pl-4 font-mono text-[11px] text-slate-700">
              {compactEnvelope.warnings.map((line, idx) => (
                <li key={`w-${idx}`}>{String(line)}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {(call.error_type || call.error_message) && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50/90 p-3">
          <div className="flex items-start gap-2 text-sm text-red-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-end justify-between gap-2">
                <p className="font-mono text-xs font-semibold uppercase tracking-wide">
                  {call.error_type ?? 'error'}
                </p>
                {call.error_message ? <CopyCharBar text={call.error_message} t={t} /> : null}
              </div>
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
              <div className="mt-2 mb-1 flex items-end justify-end">
                <CopyCharBar text={requestContextText} t={t} />
              </div>
              <pre className={CONTEXT_PRE}>{requestContextText}</pre>
            </details>
          </div>
        ) : null}
      </div>
    </article>
  );
}
