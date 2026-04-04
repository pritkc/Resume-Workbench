'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCcw } from 'lucide-react';
import {
  fetchDraftRenderPreview,
  fetchResumeRenderPreview,
  type ResumeDraftRequest,
} from '@/lib/api/resume';
import {
  type ArtifactSummary,
  type RenderThemeSettings,
  DEFAULT_RENDER_THEME_SETTINGS,
} from '@/lib/types/render-theme';
import { Button } from '@/components/ui/button';
import { ArtifactGallery } from './artifact-gallery';

interface RenderPreviewPanelProps {
  resumeId?: string | null;
  settings?: RenderThemeSettings;
  draftRequest?: ResumeDraftRequest | null;
  initialArtifacts?: ArtifactSummary[];
  refreshKey?: string | number;
  stale?: boolean;
}

const EMPTY_ARTIFACTS: ArtifactSummary[] = [];

export function RenderPreviewPanel({
  resumeId,
  settings = DEFAULT_RENDER_THEME_SETTINGS,
  draftRequest,
  initialArtifacts = EMPTY_ARTIFACTS,
  refreshKey,
  stale = false,
}: RenderPreviewPanelProps) {
  const [artifacts, setArtifacts] = useState<ArtifactSummary[]>(initialArtifacts);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setArtifacts(initialArtifacts);
  }, [initialArtifacts]);

  const hasFetchedResume = Boolean(resumeId);

  const loadPreview = useCallback(async () => {
    if (!resumeId && !draftRequest) {
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const preview = draftRequest
        ? await fetchDraftRenderPreview(draftRequest)
        : await fetchResumeRenderPreview(resumeId!, settings);
      setArtifacts(preview.artifacts);
    } catch (loadError) {
      const message =
        loadError instanceof Error ? loadError.message : 'Failed to load RenderCV preview.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [draftRequest, resumeId, settings]);

  useEffect(() => {
    if (!resumeId && !draftRequest) {
      return;
    }
    const timeout = window.setTimeout(() => {
      void loadPreview();
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [draftRequest, loadPreview, refreshKey, resumeId, settings]);

  const statusMessage = useMemo(() => {
    if (error) {
      return error;
    }
    if (stale) {
      return 'Preview reflects the last saved resume until you save current edits.';
    }
    if (!hasFetchedResume && !draftRequest) {
      return 'Save the resume once to generate a RenderCV preview.';
    }
    return null;
  }, [draftRequest, error, hasFetchedResume, stale]);

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between border border-black bg-white px-4 py-3">
        <div>
          <p className="font-mono text-xs font-bold uppercase tracking-wider">RenderCV Preview</p>
          <p className="mt-1 text-sm text-gray-600">
            PNG preview and PDF artifact come from the same render snapshot.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void loadPreview()}
          disabled={(!resumeId && !draftRequest) || isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCcw className="h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      {statusMessage && (
        <div className="border border-black bg-[#F8F7F1] px-4 py-3 font-mono text-xs text-gray-700">
          {statusMessage}
        </div>
      )}

      <ArtifactGallery artifacts={artifacts} />
    </div>
  );
}
