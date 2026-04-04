'use client';

import Link from 'next/link';
import type { ImprovedResult } from '@/components/common/resume_previewer_context';
import type { RenderThemeSettings } from '@/lib/types/render-theme';
import { Button } from '@/components/ui/button';
import { ArtifactGallery } from './artifact-gallery';

interface ApplicationPackPanelProps {
  pendingResult: ImprovedResult | null;
  themeSettings: RenderThemeSettings;
  selectedPromptId: string;
}

export function ApplicationPackPanel({
  pendingResult,
  themeSettings,
  selectedPromptId,
}: ApplicationPackPanelProps) {
  const data = pendingResult?.data;
  const warnings = data?.warnings ?? [];
  const traceId = data?.request_id;

  return (
    <div className="space-y-4 border border-black bg-[#F8F7F1] p-4">
      <div className="flex items-center gap-2">
        <div className="h-2 w-2 bg-blue-700" />
        <p className="font-mono text-xs font-bold uppercase tracking-wider">Application Pack</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="border border-black bg-white p-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Prompt
          </p>
          <p className="mt-2 font-mono text-sm uppercase">{selectedPromptId}</p>
        </div>
        <div className="border border-black bg-white p-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Theme
          </p>
          <p className="mt-2 font-mono text-sm uppercase">
            {themeSettings.theme_id} / {themeSettings.density_profile}
          </p>
        </div>
        <div className="border border-black bg-white p-3">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Output
          </p>
          <p className="mt-2 font-mono text-sm uppercase">
            {data?.application_pack_id ? 'Preview Ready' : 'Awaiting Generate'}
          </p>
        </div>
      </div>

      <ArtifactGallery
        artifacts={data?.artifacts}
        title="Pack Artifacts"
        emptyMessage="Generate a preview to create the resume snapshot, PDF, and preview image."
      />

      <div className="border border-black bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
              LLM Trace
            </p>
            {traceId ? (
              <>
                <p className="mt-2 font-mono text-sm break-all">{traceId}</p>
                <p className="mt-2 text-sm text-gray-600">
                  Open the internal trace viewer to inspect tokens, retries, latency, finish
                  reasons, and prompt/response previews for this specific request.
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-gray-600">
                Generate a preview to capture an end-to-end trace for every LLM call in this flow.
              </p>
            )}
          </div>

          {traceId && (
            <Link
              href={`/llm-traces?trace_id=${encodeURIComponent(traceId)}&request_scope=${encodeURIComponent(
                'resumes.improve_preview'
              )}`}
            >
              <Button variant="outline" size="sm">
                Open Trace Viewer
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Cover Letter
          </p>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {data?.cover_letter || 'Generated cover letter will appear here.'}
          </p>
        </div>
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Outreach
          </p>
          <p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap">
            {data?.outreach_message || 'Generated LinkedIn or email outreach will appear here.'}
          </p>
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="border border-black bg-white p-4">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">
            Warnings
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-700">
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
