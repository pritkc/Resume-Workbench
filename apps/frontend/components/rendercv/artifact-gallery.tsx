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
  const pdfArtifact = artifacts.find((artifact) => artifact.kind === 'resume_pdf');
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
      <div className="border border-black/15 bg-white">
        {showHeader ? (
          <div className="border-b border-black/10 px-2.5 py-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-800">
              {title}
            </p>
          </div>
        ) : null}
        <div className="space-y-2 p-2">
          {previewArtifacts.length === 0 && !pdfArtifact ? (
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
                      className="block w-full border border-black/15 bg-gray-50/80 p-1.5 text-left hover:bg-gray-100"
                      aria-label={`Open large preview for ${artifact.file_name}`}
                    >
                      <Image
                        src={artifact.url ?? ''}
                        alt={artifact.file_name}
                        width={1200}
                        height={1600}
                        unoptimized
                        className="h-auto w-full border border-gray-300 bg-white"
                      />
                      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-wider text-gray-600">
                        {artifact.file_name}
                      </p>
                    </button>
                  ))}
                </div>
              )}
              {pdfArtifact && (
                <a
                  href={pdfArtifact.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center border border-black px-2.5 py-1.5 font-mono text-[11px] font-bold uppercase tracking-wider hover:bg-[#F0F0E8]"
                >
                  Open PDF Artifact
                </a>
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
              className="relative max-w-6xl w-[96vw] max-h-[96vh] overflow-hidden flex flex-col p-4 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]"
              role="dialog"
              aria-modal="true"
              aria-label="Large Preview"
            >
              <button
                type="button"
                onClick={() => setSelectedPreviewId(null)}
                className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center border border-black bg-white hover:bg-[#F0F0E8]"
                aria-label="Close large preview"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="space-y-3 pr-10">
                <p className="font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
                  Large Preview
                </p>
                <div className="max-h-[82vh] overflow-auto border border-black bg-white p-2">
                  <Image
                    src={selectedPreview.url ?? ''}
                    alt={`${selectedPreview.file_name} large preview`}
                    width={1800}
                    height={2400}
                    unoptimized
                    className="mx-auto h-auto w-full max-w-[1100px] border border-gray-300 bg-white"
                  />
                </div>
                <p className="font-mono text-[11px] text-gray-600">{selectedPreview.file_name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
