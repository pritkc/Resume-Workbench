'use client';

import Image from 'next/image';
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
  const previewArtifacts = artifacts.filter((artifact) => artifact.kind === 'resume_preview_png');
  const pdfArtifact = artifacts.find((artifact) => artifact.kind === 'resume_pdf');

  return (
    <div className="border border-black bg-white">
      {showHeader ? (
        <div className="border-b border-black px-3 py-2">
          <p className="font-mono text-xs font-bold uppercase tracking-wider">{title}</p>
        </div>
      ) : null}
      <div className="space-y-3 p-3">
        {previewArtifacts.length === 0 && !pdfArtifact ? (
          <p className="font-mono text-xs text-gray-600">{emptyMessage}</p>
        ) : (
          <>
            {previewArtifacts.length > 0 && (
              <div className="grid gap-2.5">
                {previewArtifacts.map((artifact) => (
                  <a
                    key={artifact.artifact_id}
                    href={artifact.url ?? '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="block border border-black bg-[#F8F7F1] p-2 hover:bg-[#F0F0E8]"
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
                  </a>
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
  );
}
