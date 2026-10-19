'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
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
import { ArtifactGallery } from './artifact-gallery';

export interface RenderPreviewPanelHandle {
  refresh: () => void;
  isLoading: boolean;
}

interface RenderPreviewPanelProps {
  resumeId?: string | null;
  settings?: RenderThemeSettings;
  draftRequest?: ResumeDraftRequest | null;
  initialArtifacts?: ArtifactSummary[];
  refreshKey?: string | number;
  stale?: boolean;
  onLoadingChange?: (loading: boolean) => void;
}

const EMPTY_ARTIFACTS: ArtifactSummary[] = [];

function PreviewSkeleton() {
  return (
    <div className="space-y-3 px-1 py-3" aria-hidden>
      <div className="mx-auto h-4 w-40 animate-pulse rounded-sm bg-muted" />
      <div className="mx-auto h-3 w-56 animate-pulse rounded-sm bg-muted/70" />
      <div className="mx-auto mt-4 h-[min(60vh,720px)] w-full max-w-[210mm] animate-pulse border border-border bg-card" />
    </div>
  );
}

export const RenderPreviewPanel = forwardRef<RenderPreviewPanelHandle, RenderPreviewPanelProps>(
  function RenderPreviewPanel(
    {
      resumeId,
      settings = DEFAULT_RENDER_THEME_SETTINGS,
      draftRequest,
      initialArtifacts = EMPTY_ARTIFACTS,
      refreshKey,
      stale = false,
      onLoadingChange,
    },
    ref
  ) {
    const [artifacts, setArtifacts] = useState<ArtifactSummary[]>(initialArtifacts);
    const [isLoading, setIsLoading] = useState(false);
    const [isPendingLoad, setIsPendingLoad] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const requestSequenceRef = useRef(0);
    const previewSessionRef = useRef<string | null>(null);

    useEffect(() => {
      if (initialArtifacts.length > 0) {
        setArtifacts(initialArtifacts);
      }
    }, [initialArtifacts]);

    const hasFetchedResume = Boolean(resumeId);

    const loadPreview = useCallback(async () => {
      if (!resumeId && !draftRequest) {
        return;
      }
      const requestSequence = ++requestSequenceRef.current;
      try {
        setIsLoading(true);
        setIsPendingLoad(false);
        setError(null);
        const preview = draftRequest
          ? await fetchDraftRenderPreview({
              ...draftRequest,
              preview_session_id:
                previewSessionRef.current ??
                (previewSessionRef.current = globalThis.crypto.randomUUID()),
              preview_sequence: requestSequence,
            })
          : await fetchResumeRenderPreview(resumeId!, settings);
        if (requestSequenceRef.current !== requestSequence) return;
        setArtifacts(preview.artifacts);
      } catch (loadError) {
        if (requestSequenceRef.current !== requestSequence) return;
        const message =
          loadError instanceof Error ? loadError.message : 'Failed to load RenderCV preview.';
        setError(message);
      } finally {
        if (requestSequenceRef.current === requestSequence) setIsLoading(false);
      }
    }, [draftRequest, resumeId, settings]);

    useImperativeHandle(
      ref,
      () => ({
        refresh: () => {
          void loadPreview();
        },
        isLoading,
      }),
      [isLoading, loadPreview]
    );

    useEffect(() => {
      if (!resumeId && !draftRequest) {
        setIsPendingLoad(false);
        return;
      }
      setIsPendingLoad(true);
      const timeout = window.setTimeout(() => {
        void loadPreview();
      }, 450);
      return () => {
        window.clearTimeout(timeout);
        requestSequenceRef.current += 1;
      };
    }, [draftRequest, loadPreview, refreshKey, resumeId, settings]);

    useEffect(() => {
      onLoadingChange?.(isLoading || isPendingLoad);
    }, [isLoading, isPendingLoad, onLoadingChange]);

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

    const showSkeleton = (isLoading || isPendingLoad) && artifacts.length === 0 && !error;

    return (
      <div className="min-h-0">
        {statusMessage && (
          <div className="mb-1.5 flex items-start gap-1.5 border border-border bg-muted px-2 py-1 font-sans text-[11px] leading-snug text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
            <span>{statusMessage}</span>
          </div>
        )}

        {showSkeleton ? (
          <div role="status" aria-live="polite">
            <div className="flex items-center gap-2 px-1 py-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="font-sans text-[12px] text-muted-foreground">Loading preview…</span>
            </div>
            <PreviewSkeleton />
          </div>
        ) : (
          <ArtifactGallery
            artifacts={artifacts}
            showHeader={false}
            emptyMessage="No preview yet. Save the resume or use the refresh button above."
          />
        )}
      </div>
    );
  }
);

RenderPreviewPanel.displayName = 'RenderPreviewPanel';
