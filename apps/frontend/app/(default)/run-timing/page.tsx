'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowLeft, Clock, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  fetchGenerationRunTimingDetails,
  type GenerationRunTimingDetailRow,
} from '@/lib/api/config';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';

interface ResumeTimingGroup {
  resume: ResumeListItem;
  runs: GenerationRunTimingDetailRow[];
}

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

function normalizeValue(value?: string | null): string {
  if (!value) return 'N/A';
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'N/A';
}

function compareIsoDesc(a?: string | null, b?: string | null): number {
  const aMs = a ? Date.parse(a) : Number.NaN;
  const bMs = b ? Date.parse(b) : Number.NaN;
  if (Number.isNaN(aMs) && Number.isNaN(bMs)) return 0;
  if (Number.isNaN(aMs)) return 1;
  if (Number.isNaN(bMs)) return -1;
  return bMs - aMs;
}

function resolveRunResumeId(
  run: GenerationRunTimingDetailRow,
  resumeIdSet: Set<string>
): string | null {
  if (run.tailored_resume_id && resumeIdSet.has(run.tailored_resume_id)) {
    return run.tailored_resume_id;
  }
  if (run.original_resume_id && resumeIdSet.has(run.original_resume_id)) {
    return run.original_resume_id;
  }
  return null;
}

export default function RunTimingPage() {
  const [groups, setGroups] = useState<ResumeTimingGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ resumes }, runs] = await Promise.all([
        fetchResumeList(false),
        fetchGenerationRunTimingDetails({ limit: 1000 }),
      ]);

      const resumeIdSet = new Set(resumes.map((resume) => resume.resume_id));
      const runsByResumeId = new Map<string, GenerationRunTimingDetailRow[]>();

      for (const run of runs) {
        const resumeId = resolveRunResumeId(run, resumeIdSet);
        if (!resumeId) continue;
        const existing = runsByResumeId.get(resumeId) || [];
        existing.push(run);
        runsByResumeId.set(resumeId, existing);
      }

      const mapped = resumes.map((resume) => ({
        resume,
        runs: (runsByResumeId.get(resume.resume_id) || []).sort((a, b) =>
          compareIsoDesc(a.created_at, b.created_at)
        ),
      }));

      setGroups(mapped);
    } catch (err) {
      console.error('Failed to load run timing groups', err);
      setError((err as Error).message || 'Failed to load run timing groups.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const summary = useMemo(() => {
    const totalRows = groups.length;
    const withRuntime = groups.filter((group) => group.runs.length > 0).length;
    const allTotals = groups.flatMap((group) =>
      group.runs.map((run) => run.total_duration_ms).filter((value): value is number => !!value)
    );
    const avgTotalMs =
      allTotals.length > 0
        ? Math.round(allTotals.reduce((sum, value) => sum + value, 0) / allTotals.length)
        : null;
    return { totalRows, withRuntime, avgTotalMs };
  }, [groups]);

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
                <Clock className="h-5 w-5" />
                <p className="font-mono text-xs font-bold uppercase tracking-[0.25em] text-blue-700">
                  Performance Analyzer
                </p>
              </div>
              <h1 className="mt-3 font-serif text-4xl font-bold uppercase tracking-tight">
                Resume Timing Groups
              </h1>
              <p className="mt-3 max-w-3xl text-sm text-gray-600">
                One row per dashboard resume. Expand a resume row to inspect all related runs and
                their process-level timings. Historical runs without metrics are shown as `N/A`.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="outline" className="gap-2" onClick={() => void refresh()}>
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Refresh
              </Button>
              <Link href="/settings">
                <Button variant="outline" className="gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Settings
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="border border-black bg-white p-4 shadow-[6px_6px_0px_0px_rgba(0,0,0,0.08)]">
          <div className="flex flex-wrap gap-2">
            <Stat label="Resume Rows" value={summary.totalRows.toString()} />
            <Stat label="Rows With Runtime" value={summary.withRuntime.toString()} />
            <Stat label="Avg Run Total" value={formatDuration(summary.avgTotalMs)} />
          </div>
        </div>

        {error && (
          <div className="border border-red-300 bg-red-50 px-4 py-3 font-mono text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <div className="border border-black bg-white px-4 py-8 text-center font-mono text-sm text-gray-500">
            No resumes found in dashboard list.
          </div>
        )}

        <div className="space-y-4">
          {groups.map(({ resume, runs }, index) => {
            const company = normalizeValue(resume.target_company || resume.company);
            const role = normalizeValue(resume.target_role || resume.role || resume.title);
            const location = normalizeValue(resume.target_location || resume.location);
            const generationTime = formatTimestamp(resume.updated_at || resume.created_at);

            return (
              <details
                key={resume.resume_id}
                open={index < 8}
                className="border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.06)]"
              >
                <summary className="cursor-pointer list-none px-4 py-3 hover:bg-[#F8F7F1]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-gray-500">
                        Resume #{resume.resume_code || 'N/A'} • {resume.processing_status}
                      </span>
                      <span className="font-mono text-xs text-gray-800">
                        {company} • {role} • {location}
                      </span>
                      <span className="font-mono text-[11px] text-gray-600">
                        Generation time: {generationTime}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Stat label="Runs" value={runs.length.toString()} />
                      <Stat
                        label="Latest Total"
                        value={formatDuration(runs[0]?.total_duration_ms ?? null)}
                      />
                    </div>
                  </div>
                </summary>

                <div className="border-t border-black/20 px-4 py-3">
                  <div className="mb-3 flex flex-wrap gap-4 font-mono text-[11px] text-gray-600">
                    <span>Resume ID: {resume.resume_id}</span>
                    <span>Title: {normalizeValue(resume.title)}</span>
                    <span>Updated: {formatTimestamp(resume.updated_at)}</span>
                  </div>

                  {runs.length === 0 ? (
                    <div className="border border-black/20 bg-[#FAFAF7] px-3 py-2 font-mono text-[11px] text-gray-600">
                      Runtime data: N/A (likely historical run before timing capture).
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {runs.map((run) => {
                        const total = run.total_duration_ms ?? 0;
                        return (
                          <div
                            key={`${resume.resume_id}-${run.generation_run_id}`}
                            className="border border-black/20 bg-[#FAFAF7] p-3"
                          >
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="font-mono text-[11px] text-gray-700">
                                <span className="font-bold">{run.run_kind}</span>
                                {' • '}
                                {formatTimestamp(run.created_at)}
                                {' • '}
                                {run.status}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <Stat label="Total" value={formatDuration(run.total_duration_ms)} />
                                <Stat
                                  label="LLM"
                                  value={formatDuration(run.llm_latency_total_ms)}
                                />
                                <Stat label="Tokens" value={formatNumber(run.llm_total_tokens)} />
                                <Stat
                                  label="Cost"
                                  value={formatCurrency(run.llm_estimated_cost_usd)}
                                />
                              </div>
                            </div>

                            <div className="mb-2 font-mono text-[11px] text-gray-600">
                              Run ID: {run.generation_run_id} • Pack:{' '}
                              {run.application_pack_id || 'N/A'} • Job: {run.job_id || 'N/A'}
                            </div>

                            <div className="overflow-x-auto border border-black/20 bg-white">
                              <table className="min-w-[760px] w-full border-collapse">
                                <thead className="bg-[#F8F7F1] border-b border-black/20">
                                  <tr>
                                    <th className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-gray-600">
                                      Process
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-gray-600">
                                      Duration
                                    </th>
                                    <th className="px-2 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider text-gray-600">
                                      Share
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {run.process_timings.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={3}
                                        className="px-2 py-2 font-mono text-[11px] text-gray-500"
                                      >
                                        Process timings: N/A
                                      </td>
                                    </tr>
                                  ) : (
                                    run.process_timings.map((process) => (
                                      <tr
                                        key={`${run.generation_run_id}-${process.process_key}`}
                                        className="border-b border-black/10 last:border-b-0"
                                      >
                                        <td className="px-2 py-1.5 font-mono text-[11px] text-gray-800">
                                          {process.process_key}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-[11px] text-gray-800">
                                          {formatDuration(process.duration_ms)}
                                        </td>
                                        <td className="px-2 py-1.5 font-mono text-[11px] text-gray-700">
                                          {total > 0
                                            ? `${((process.duration_ms / total) * 100).toFixed(1)}%`
                                            : 'N/A'}
                                        </td>
                                      </tr>
                                    ))
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </details>
            );
          })}
        </div>

        <div className="border border-black bg-white p-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Activity className="h-4 w-4" />
            Row count here tracks dashboard resume count. Missing historical timing is explicitly
            shown as `N/A`.
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[#1D4ED8] bg-[#EFF6FF] px-2 py-0.5 flex items-center gap-1.5">
      <span className="font-mono text-sm font-bold text-[#1D4ED8]">{value}</span>
      <span className="font-mono text-xs uppercase tracking-wide text-[#1D4ED8]/80">{label}</span>
    </div>
  );
}
