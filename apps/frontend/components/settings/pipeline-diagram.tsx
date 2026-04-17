'use client';

import React from 'react';

export function PipelineDiagram(): React.ReactElement {
  return (
    <div className="rounded border border-black/15 bg-[#FAFAF7] p-4 font-mono text-[11px] text-gray-800 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.08)]">
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600">Full pipeline</p>
      <pre className="mt-2 overflow-x-auto whitespace-pre text-[10px] leading-snug">
        extract_jd_intel → tailor_resume_full → critique_resume → rewrite_resume → apply_diff
      </pre>
      <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-gray-600">
        Lite pipeline
      </p>
      <pre className="mt-2 overflow-x-auto whitespace-pre text-[10px] leading-snug">
        extract_jd_intel → tailor_resume_lite → apply_diff
      </pre>
    </div>
  );
}
