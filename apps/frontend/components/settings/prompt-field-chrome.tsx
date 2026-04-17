'use client';

import React, { useCallback, useState } from 'react';
import { Clipboard, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Character count + copy for monospace prompt fields (composer, shared rules, etc.). */
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
      <span className="font-mono text-[9px] tabular-nums text-gray-500">
        {t('settings.promptCatalog.composerCharCount', { count: n })}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        className="h-6 px-1.5 font-mono text-[9px]"
        onClick={() => void copy()}
        title={t('settings.promptCatalog.copyField')}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-700" aria-hidden />
        ) : (
          <Clipboard className="h-3.5 w-3.5" aria-hidden />
        )}
      </Button>
    </div>
  );
}
