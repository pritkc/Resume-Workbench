'use client';

import React from 'react';
import type { PromptCatalogPolicy, PromptCatalogSection } from '@/lib/api/config';

const POLICY_BADGE_CLASS: Record<PromptCatalogPolicy, string> = {
  system: 'border-black/20 bg-gray-100 text-gray-800',
  user_editable_future: 'border-black/25 bg-black/[0.04] text-black/80',
  user_choice: 'border-amber-600/30 bg-amber-50 text-amber-950',
  runtime_injected: 'border-violet-600/30 bg-violet-50 text-violet-950',
};

function PolicyBadge({
  policy,
  label,
}: {
  policy: PromptCatalogPolicy | null | undefined;
  label: (key: string) => string;
}): React.ReactElement | null {
  if (!policy) return null;
  return (
    <span
      className={`inline-flex shrink-0 rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${POLICY_BADGE_CLASS[policy]}`}
      title={label(`settings.promptCatalog.policyTitle.${policy}`)}
    >
      {label(`settings.promptCatalog.policyLabels.${policy}`)}
    </span>
  );
}

export function PromptSectionTree({
  sections,
  depth = 0,
  label,
}: {
  sections: PromptCatalogSection[];
  depth?: number;
  label: (key: string) => string;
}): React.ReactElement {
  return (
    <ul className={depth === 0 ? 'space-y-2' : 'mt-2 space-y-2 border-l border-black/10 pl-3'}>
      {sections.map((node) => (
        <li key={node.id}>
          <div
            className={`rounded border border-black/15 bg-white ${depth === 0 ? 'p-3' : 'px-2 py-2'}`}
          >
            <div className="flex flex-wrap items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] font-bold text-gray-900">
                    {node.label}
                  </span>
                  <PolicyBadge policy={node.policy ?? null} label={label} />
                </div>
                {node.note ? (
                  <p className="mt-1 font-mono text-[11px] leading-snug text-gray-600">
                    {node.note}
                  </p>
                ) : null}
              </div>
            </div>
            {node.content ? (
              <pre className="mt-2 max-h-[min(420px,70vh)] overflow-auto whitespace-pre-wrap border border-black/10 bg-[#FAFAF7] p-2 font-mono text-[11px] leading-relaxed text-gray-800">
                {node.content}
              </pre>
            ) : null}
            {node.children?.length ? (
              <PromptSectionTree sections={node.children} depth={depth + 1} label={label} />
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
