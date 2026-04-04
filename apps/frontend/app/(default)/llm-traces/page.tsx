import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { LLMTraceViewer } from '@/components/observability/llm-trace-viewer';
import { Activity, ArrowLeft, Radar } from 'lucide-react';

type PageProps = {
  searchParams?: Promise<{
    trace_id?: string;
    request_scope?: string;
  }>;
};

export default async function LLMTracesPage({ searchParams }: PageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const traceId = resolvedSearchParams?.trace_id ?? null;
  const requestScope = resolvedSearchParams?.request_scope ?? null;

  return (
    <div
      className="min-h-screen bg-[#F6F5EE] p-6 md:p-10"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.08) 1px, transparent 1px)',
        backgroundSize: '36px 36px',
      }}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="border border-black bg-white p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Radar className="h-5 w-5" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-blue-700">
                  LLM Observatory
                </p>
              </div>
              <h1 className="mt-3 font-serif text-4xl font-bold uppercase tracking-tight">
                Trace Every Model Call
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-gray-600">
                Use this page as the internal live logger. It can watch the newest calls across the
                system, focus on one request scope like preview generation, or inspect a single
                request by pasting its trace ID.
              </p>
              {(traceId || requestScope) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {traceId && (
                    <span className="border border-black bg-[#F8F7F1] px-3 py-2 font-mono text-xs uppercase tracking-wider">
                      trace {traceId}
                    </span>
                  )}
                  {requestScope && (
                    <span className="border border-black bg-[#F8F7F1] px-3 py-2 font-mono text-xs uppercase tracking-wider">
                      scope {requestScope}
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/tailor">
                <Button variant="outline" className="gap-2">
                  <Activity className="h-4 w-4" />
                  Tailor
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <LLMTraceViewer
          initialTraceId={traceId}
          initialRequestScope={requestScope}
          defaultAutoRefresh={true}
        />
      </div>
    </div>
  );
}
