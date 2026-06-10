'use client';

import React from 'react';

export type PromptCatalogNavItem = { id: string; label: string };

function scrollToId(id: string): void {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function PromptCatalogNav({
  items,
  title,
  onJumped,
}: {
  items: PromptCatalogNavItem[];
  title: string;
  onJumped?: () => void;
}): React.ReactElement {
  return (
    <nav aria-label={title} className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{title}</p>
      <ul className="m-0 flex list-none flex-col gap-0 p-0">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="w-full rounded-md px-1.5 py-1 text-left text-xs text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
              onClick={() => {
                scrollToId(item.id);
                onJumped?.();
              }}
            >
              {item.label}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
