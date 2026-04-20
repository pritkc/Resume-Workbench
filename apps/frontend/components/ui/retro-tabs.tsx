'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Builder tab bar — bottom-border active state, h-7, no fill (phase 3.11.1).
 */
export interface Tab {
  id: string;
  label: string;
  shortLabel?: string;
  ariaLabel?: string;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface RetroTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  size?: 'default' | 'compact';
}

export const RetroTabs: React.FC<RetroTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  size = 'default',
}) => {
  const isCompact = size === 'compact';
  const tabClass = cn(
    'inline-flex cursor-pointer items-center justify-center gap-1.5 font-mono uppercase transition-colors',
    isCompact ? 'h-7 px-3 text-[11px] tracking-widest' : 'h-8 px-4 text-xs tracking-wider',
    '-mb-px border-b-2 border-transparent bg-transparent',
    'text-black/50 hover:text-black',
    'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-black focus-visible:ring-offset-1'
  );

  return (
    <div className={cn('editor-tabs tab-container flex flex-wrap gap-0', className)}>
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
            className={cn(
              tabClass,
              isActive && 'border-black font-bold text-black',
              isDisabled && 'cursor-not-allowed text-black/25 hover:text-black/25'
            )}
          >
            {tab.icon}
            <span>{isCompact && tab.shortLabel ? tab.shortLabel : tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
