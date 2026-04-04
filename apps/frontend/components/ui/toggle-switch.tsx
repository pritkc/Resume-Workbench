'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Toggle Switch Component
 *
 * Design Principles:
 * - Square corners (rounded-none on container, pill shape for toggle)
 * - High contrast states
 * - Clear label and description
 */

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
  density?: 'default' | 'compact';
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
  density = 'default',
}) => {
  const labelId = React.useId();
  const isCompact = density === 'compact';

  const handleToggle = () => {
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between border border-black bg-white',
        'shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]',
        isCompact ? 'gap-3 px-3 py-2' : 'p-4',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className={cn('flex-1', isCompact ? 'mr-2' : 'mr-4')}>
        <div
          id={labelId}
          className={cn(
            'font-mono font-bold uppercase tracking-wider',
            isCompact ? 'text-[11px]' : 'text-sm'
          )}
        >
          {label}
        </div>
        {description && (
          <div
            className={cn(
              'font-sans text-gray-500',
              isCompact ? 'mt-0.5 text-[11px]' : 'mt-1 text-xs'
            )}
          >
            {description}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={labelId}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          'relative inline-flex shrink-0 cursor-pointer items-center',
          'border-2 border-black transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          isCompact ? 'h-5 w-10' : 'h-6 w-12',
          checked ? 'bg-blue-700' : 'bg-gray-200'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block bg-white border border-black shadow-sm',
            'transition-transform duration-200',
            isCompact ? 'h-3.5 w-3.5' : 'h-4 w-4',
            checked ? (isCompact ? 'translate-x-5' : 'translate-x-6') : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
};
