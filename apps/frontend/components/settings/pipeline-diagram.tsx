'use client';

import React from 'react';

export function PipelineDiagram(): React.ReactElement {
  return (
    <div className="font-mono text-[11px] leading-relaxed text-slate-600">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Full</p>
      <p className="mt-0.5 border-l border-slate-200 pl-2">
        extract_jd_intel → tailor_resume_full → critique_resume → rewrite_resume → apply_diff
      </p>
      <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-slate-400">Lite</p>
      <p className="mt-0.5 border-l border-slate-200 pl-2">
        extract_jd_intel → tailor_resume_lite → apply_diff
      </p>
    </div>
  );
}
