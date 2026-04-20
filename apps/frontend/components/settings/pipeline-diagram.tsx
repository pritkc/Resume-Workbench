'use client';

import React from 'react';

export function PipelineDiagram(): React.ReactElement {
  return (
    <div className="entry-card-editor grid gap-2 font-mono text-black/80 sm:grid-cols-2">
      <div className="min-w-0 border border-black/10 bg-white/80 p-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-black/45">Full</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre text-[9px] leading-snug">
          extract_jd_intel → tailor_resume_full → critique_resume → rewrite_resume → apply_diff
        </pre>
      </div>
      <div className="min-w-0 border border-black/10 bg-white/80 p-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-black/45">Lite</p>
        <pre className="mt-1 overflow-x-auto whitespace-pre text-[9px] leading-snug">
          extract_jd_intel → tailor_resume_lite → apply_diff
        </pre>
      </div>
    </div>
  );
}
