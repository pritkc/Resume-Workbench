import Link from 'next/link';
import { LLMTraceViewer } from '@/components/observability/llm-trace-viewer';
import { ArrowLeft } from 'lucide-react';

type PageProps = {
  searchParams?: Promise<{
    trace_id?: string;
    resume_code?: string;
    resume_id?: string;
    request_scope?: string;
  }>;
};

export default async function LLMTracesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const traceId = resolvedSearchParams?.trace_id ?? null;
  const resumeCode = resolvedSearchParams?.resume_code ?? null;
  const resumeId = resolvedSearchParams?.resume_id ?? null;
  const requestScope = resolvedSearchParams?.request_scope ?? null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-[min(100%,118rem)] px-3 py-4 sm:px-5">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-2">
            <div className="flex min-w-0 items-center gap-2">
              <Link
                href="/settings"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200/80 hover:text-slate-800"
                aria-label="Back to settings"
                title="Back to settings"
              >
                <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden />
              </Link>
              <h1 className="truncate text-base font-medium text-slate-900">LLM traces</h1>
            </div>
            {(traceId || resumeCode || resumeId || requestScope) && (
              <div className="flex flex-wrap gap-1.5 pl-10 sm:pl-0">
                {traceId ? (
                  <span
                    className="max-w-full truncate rounded-md border border-slate-200 bg-card px-2 py-1 font-mono text-[11px] text-slate-700"
                    title={traceId}
                  >
                    trace: {traceId}
                  </span>
                ) : null}
                {resumeCode ? (
                  <span
                    className="max-w-full truncate rounded-md border border-slate-200 bg-card px-2 py-1 font-mono text-[11px] text-slate-700"
                    title={resumeCode}
                  >
                    resume code: {resumeCode}
                  </span>
                ) : null}
                {resumeId ? (
                  <span
                    className="max-w-full truncate rounded-md border border-slate-200 bg-card px-2 py-1 font-mono text-[11px] text-slate-700"
                    title={resumeId}
                  >
                    resume id: {resumeId}
                  </span>
                ) : null}
                {requestScope ? (
                  <span
                    className="max-w-full truncate rounded-md border border-slate-200 bg-card px-2 py-1 font-mono text-[11px] text-slate-700"
                    title={requestScope}
                  >
                    scope: {requestScope}
                  </span>
                ) : null}
              </div>
            )}
          </div>

          <details className="max-w-xs text-right text-xs text-slate-500 sm:max-w-sm">
            <summary className="cursor-pointer list-none marker:hidden hover:text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="border-b border-dotted border-slate-300">About this page</span>
            </summary>
            <div className="mt-1 rounded-md border border-slate-200 bg-card p-2 text-left text-[11px] leading-snug text-slate-600">
              <p className="m-0">
                Internal live logger for model calls: newest calls system-wide, filtered by request
                scope, or a single flow via trace ID.
              </p>
            </div>
          </details>
        </header>

        <LLMTraceViewer
          initialTraceId={traceId}
          initialResumeCode={resumeCode}
          initialResumeId={resumeId}
          initialRequestScope={requestScope}
          defaultAutoRefresh={true}
        />
      </div>
    </div>
  );
}
