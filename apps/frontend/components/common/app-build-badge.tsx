'use client';

import { useStatusCache } from '@/lib/context/status-cache';

function shortCommit(commit: string): string {
  return commit === 'development' ? 'local' : commit.slice(0, 7);
}

export function AppBuildBadge() {
  const { status } = useStatusCache();

  if (!status) return null;

  const label = `v${status.version} · ${shortCommit(status.commit)}`;
  return (
    <div
      className="pointer-events-none fixed bottom-1 left-1 z-[70] border border-border/70 bg-card/90 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground shadow-sm no-print"
      title={`Resume Workbench ${label}`}
      aria-label={`Application version ${label}`}
    >
      {label}
    </div>
  );
}
