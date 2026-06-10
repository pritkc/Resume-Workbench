'use client';

import React, { useLayoutEffect, useRef } from 'react';

const DEFAULT_MIN = 220;
const DEFAULT_MAX = 5600;

export function AutosizePromptTextarea({
  value,
  onChange,
  className,
  spellCheck = false,
  'aria-label': ariaLabel,
  minHeightPx = DEFAULT_MIN,
  maxHeightPx = DEFAULT_MAX,
}: {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  spellCheck?: boolean;
  'aria-label'?: string;
  minHeightPx?: number;
  maxHeightPx?: number;
}): React.ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = Math.min(Math.max(el.scrollHeight + 2, minHeightPx), maxHeightPx);
    el.style.height = `${h}px`;
  }, [value, minHeightPx, maxHeightPx]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      spellCheck={spellCheck}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
