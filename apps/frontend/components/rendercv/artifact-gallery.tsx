'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { X } from 'lucide-react';
import type { ArtifactSummary } from '@/lib/types/render-theme';

interface ArtifactGalleryProps {
  artifacts?: ArtifactSummary[];
  title?: string;
  emptyMessage?: string;
  showHeader?: boolean;
}

export function ArtifactGallery({
  artifacts = [],
  title = 'Render Preview',
  emptyMessage = 'No RenderCV artifacts yet.',
  showHeader = true,
}: ArtifactGalleryProps) {
  const [selectedPreviewId, setSelectedPreviewId] = useState<string | null>(null);
  const previewArtifacts = artifacts.filter((artifact) => artifact.kind === 'resume_preview_png');
  const selectedPreview = useMemo(
    () => previewArtifacts.find((artifact) => artifact.artifact_id === selectedPreviewId) ?? null,
    [previewArtifacts, selectedPreviewId]
  );

  useEffect(() => {
    if (!selectedPreview) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedPreviewId(null);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [selectedPreview]);

  return (
    <>
      <div className="bg-transparent">
        {showHeader ? (
          <div className="border-b border-black/10 px-2.5 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
              {title}
            </p>
          </div>
        ) : null}
        <div className="space-y-2 p-0">
          {previewArtifacts.length === 0 ? (
            <p className="font-mono text-xs text-gray-600">{emptyMessage}</p>
          ) : (
            <>
              {previewArtifacts.length > 0 && (
                <div className="grid gap-2">
                  {previewArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifact_id}
                      type="button"
                      onClick={() => setSelectedPreviewId(artifact.artifact_id)}
                      className="block w-full bg-transparent p-0 text-left"
                      aria-label="Open large preview"
                    >
                      <Image
                        src={artifact.url ?? ''}
                        alt=""
                        width={1200}
                        height={1600}
                        unoptimized
                        className="h-auto w-full bg-white"
                      />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {selectedPreview && (
        <div className="fixed inset-0 z-50">
          <div
            className="fixed inset-0 bg-black/60"
            onClick={() => setSelectedPreviewId(null)}
            aria-hidden="true"
          />
          <div className="fixed inset-0 flex items-center justify-center p-4">
            <div
              className="relative flex max-h-[96vh] w-[96vw] max-w-6xl flex-col overflow-hidden bg-[#F0F0E8] p-3 shadow-lg"
              role="dialog"
              aria-modal="true"
              aria-label="Large Preview"
            >
              <button
                type="button"
                onClick={() => setSelectedPreviewId(null)}
                className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-none bg-white/95 text-black shadow-sm hover:bg-white"
                aria-label="Close large preview"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="max-h-[88vh] overflow-auto pr-9 pt-1">
                <Image
                  src={selectedPreview.url ?? ''}
                  alt=""
                  width={1800}
                  height={2400}
                  unoptimized
                  className="mx-auto h-auto w-full max-w-[1100px] bg-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
