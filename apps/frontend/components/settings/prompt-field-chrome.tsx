'use client';

import React, { useCallback, useState } from 'react';
import { Clipboard, Check } from 'lucide-react';

/** Character count + minimal copy control for prompt fields. */
export function CopyCharBar({
  text,
  t,
}: {
  text: string;
  t: (key: string, params?: Record<string, string | number>) => string;
}): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const n = text.length;

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  }, [text]);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <span className="font-mono text-[10px] tabular-nums text-slate-400">{n}</span>
      <button
        type="button"
        onClick={() => void copy()}
        title={t('settings.promptCatalog.copyField')}
        aria-label={t('settings.promptCatalog.copyField')}
        className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-300"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" strokeWidth={1.75} aria-hidden />
        ) : (
          <Clipboard className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
        )}
      </button>
    </div>
  );
}
