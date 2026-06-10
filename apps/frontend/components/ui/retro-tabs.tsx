'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface Tab {
  id: string;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  iconOnly?: boolean;
  disabled?: boolean;
}

export interface RetroTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  size?: 'default' | 'compact' | 'dense';
  variant?: 'default' | 'secondary';
  sentenceCase?: boolean;
}

export const RetroTabs: React.FC<RetroTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  size = 'default',
  variant = 'default',
  sentenceCase = false,
}) => {
  const isCompact = size === 'compact' || size === 'dense';
  const isDense = size === 'dense';
  const isSecondary = variant === 'secondary';
  const tabClass = cn(
    'inline-flex cursor-pointer items-center justify-center gap-1.5 transition-colors',
    !sentenceCase && 'font-mono uppercase',
    sentenceCase && 'font-sans normal-case',
    isDense
      ? 'h-6 px-2 text-[11px] tracking-wide'
      : isCompact
        ? 'h-7 px-3 text-[11px] tracking-widest'
        : 'h-8 px-4 text-xs tracking-wider',
    '-mb-px border-b-2 border-transparent bg-transparent',
    isSecondary
      ? 'text-muted-foreground hover:text-foreground/80'
      : 'text-muted-foreground hover:text-foreground',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1'
  );

  return (
    <div
      className={cn(
        'editor-tabs tab-container flex flex-wrap gap-0',
        isSecondary && 'border-l border-border pl-1',
        className
      )}
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isDisabled = tab.disabled;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => !isDisabled && onTabChange(tab.id)}
            disabled={isDisabled}
            aria-label={tab.ariaLabel ?? tab.label}
            title={tab.ariaLabel ?? tab.label}
            className={cn(
              tabClass,
              tab.iconOnly && 'w-7 px-0',
              isActive &&
                (isSecondary || tab.iconOnly
                  ? 'border-primary font-semibold text-primary'
                  : 'border-primary font-bold text-foreground'),
              isDisabled &&
                'cursor-not-allowed text-muted-foreground/50 hover:text-muted-foreground/50'
            )}
          >
            {tab.icon}
            {!tab.iconOnly ? (
              <span>{isCompact && tab.shortLabel ? tab.shortLabel : tab.label}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};
