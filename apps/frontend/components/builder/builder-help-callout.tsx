'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

const STORAGE_PREFIX = 'builder_help_dismissed_';

export interface BuilderHelpCalloutProps {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function BuilderHelpCallout({ id, title, children, className }: BuilderHelpCalloutProps) {
  const { t } = useTranslations();
  const storageKey = `${STORAGE_PREFIX}${id}`;
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const wasDismissed = localStorage.getItem(storageKey) === '1';
      setDismissed(wasDismissed);
      setExpanded(!wasDismissed);
    } catch {
      setDismissed(false);
      setExpanded(true);
    }
  }, [storageKey]);

  const handleDismiss = () => {
    setDismissed(true);
    setExpanded(false);
    try {
      localStorage.setItem(storageKey, '1');
    } catch {
      // ignore storage errors
    }
  };

  if (!mounted) {
    return null;
  }

  if (dismissed && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'shrink-0 border border-border bg-card px-2 py-1 text-left font-sans text-[11px] text-muted-foreground hover:border-border hover:text-foreground',
          className
        )}
      >
        {t('builder.helpCallout.showTips')}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'builder-help-callout shrink-0 border border-border bg-card font-sans text-[12px] leading-snug text-foreground/90',
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-2 py-1.5">
        <h3 className="text-[11px] font-semibold text-foreground">{title}</h3>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={
              expanded ? t('builder.helpCallout.collapse') : t('builder.helpCallout.expand')
            }
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="inline-flex h-6 w-6 items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label={t('builder.helpCallout.dismiss')}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {expanded ? <div className="space-y-2 px-2 py-2">{children}</div> : null}
    </div>
  );
}
