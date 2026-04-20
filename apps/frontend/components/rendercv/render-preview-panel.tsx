'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2, RefreshCcw } from 'lucide-react';
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
    <div className="space-y-1.5 p-0 sm:p-1">
      <div className="flex items-center justify-between gap-2 border-0 border-b border-black/10 bg-transparent px-1 py-1 sm:px-2">
        <div className="min-w-0" title="Same snapshot as PDF export.">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-black/50">
            Preview
          </p>
        </div>
        <Button
          variant="builderOutline"
          size="xs"
          onClick={() => void loadPreview()}
          disabled={(!resumeId && !draftRequest) || isLoading}
          aria-label="Refresh preview"
          className="gap-1"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">Refresh</span>
        </Button>
      </div>

      {statusMessage && (
        <div className="flex items-start gap-1.5 border border-black/15 bg-black/[0.03] px-2 py-1 font-mono text-[10px] uppercase leading-snug tracking-wide text-black/70">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-black/40" />
          <span>{statusMessage}</span>
        </div>
      )}

      <ArtifactGallery
        artifacts={artifacts}
        showHeader={false}
        emptyMessage="No preview yet. Save the resume or tap Refresh."
      />
    </div>
  );
}
