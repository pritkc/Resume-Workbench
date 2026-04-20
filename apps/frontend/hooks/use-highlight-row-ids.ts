'use client';

import { useCallback, useEffect, useState } from 'react';

function newHighlightRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `hl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Stable ids per highlight row so @dnd-kit sortables keep identity across reorders
 * (avoids remounting editors on every index change).
 */
export function useHighlightRowIds(length: number): [string[], (from: number, to: number) => void] {
  const [ids, setIds] = useState<string[]>(() =>
    Array.from({ length: Math.max(0, length) }, () => newHighlightRowId())
  );

  useEffect(() => {
    setIds((prev) => {
      if (prev.length === length) return prev;
      if (prev.length < length) {
        const add = Array.from({ length: length - prev.length }, () => newHighlightRowId());
        return [...prev, ...add];
      }
      return prev.slice(0, length);
    });
  }, [length]);

  const reorderIds = useCallback((from: number, to: number) => {
    setIds((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length || to >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [removed] = next.splice(from, 1);
      next.splice(to, 0, removed);
      return next;
    });
  }, []);

  return [ids, reorderIds];
}
