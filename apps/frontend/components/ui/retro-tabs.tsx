'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Tabs Component
 *
 * Design Principles:
 * - Square corners (rounded-none) - Brutalist aesthetic
 * - Hard shadows on active tab
 * - Black borders for high contrast
 * - Monospace uppercase text
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
  const sizeClasses =
    size === 'compact'
      ? 'px-2.5 py-1.5 text-[11px] tracking-[0.18em]'
      : 'px-4 py-2 text-xs tracking-wider';

  return (
    <div className={cn('flex flex-wrap gap-0 border-b border-black/15', className)}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        const isDisabled = tab.disabled;

        return (
          <button
            key={tab.id}
            onClick={() => !isDisabled && onTabChange(tab.id)}
            disabled={isDisabled}
            aria-label={tab.ariaLabel ?? tab.label}
            className={cn(
              'inline-flex items-center gap-1.5 font-mono uppercase transition-all',
              sizeClasses,
              'border border-b-0 border-black/15 -mb-px',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2',
              isActive && [
                'bg-white text-black font-semibold',
                'shadow-[1px_-1px_0_0_rgba(0,0,0,0.06)]',
                'border-b-white',
              ],
              !isActive &&
                !isDisabled && [
                  'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                ],
              isDisabled && ['cursor-not-allowed bg-gray-50 text-gray-300 opacity-50']
            )}
          >
            {tab.icon}
            <span>{size === 'compact' && tab.shortLabel ? tab.shortLabel : tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
