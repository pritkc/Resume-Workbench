'use client';

import type { ReactNode } from 'react';
import { Moon, Sun, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

type ThemeChoice = 'light' | 'dark' | 'system';

export interface ThemeToggleProps {
  /** Compact icon cycle (header). Full shows Light / Dark / System buttons. */
  variant?: 'icon' | 'segmented';
  className?: string;
}

export function ThemeToggle({ variant = 'segmented', className }: ThemeToggleProps) {
  const { t } = useTranslations();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return variant === 'icon' ? (
      <span className={cn('inline-flex h-7 w-7 shrink-0', className)} aria-hidden />
    ) : (
      <span className={cn('inline-flex h-7 gap-1', className)} aria-hidden />
    );
  }

  const active = (theme ?? 'system') as ThemeChoice;

  if (variant === 'icon') {
    const isDark = resolvedTheme === 'dark';
    const next: ThemeChoice = isDark ? 'light' : 'dark';
    return (
      <button
        type="button"
        onClick={() => setTheme(next)}
        className={cn(
          'inline-flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-foreground',
          className
        )}
        aria-label={isDark ? t('settings.lightMode') : t('settings.darkMode')}
        title={isDark ? t('settings.lightMode') : t('settings.darkMode')}
      >
        {isDark ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
      </button>
    );
  }

  const options: { id: ThemeChoice; label: string; icon: ReactNode }[] = [
    { id: 'light', label: t('settings.lightMode'), icon: <Sun className="h-3 w-3" /> },
    { id: 'dark', label: t('settings.darkMode'), icon: <Moon className="h-3 w-3" /> },
    { id: 'system', label: t('settings.systemMode'), icon: <Monitor className="h-3 w-3" /> },
  ];

  return (
    <div
      className={cn('flex flex-wrap gap-1', className)}
      role="group"
      aria-label={t('settings.theme')}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setTheme(option.id)}
          className={cn(
            'inline-flex items-center gap-1 border border-border bg-card px-2 py-1 font-sans text-[11px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground',
            active === option.id && 'border-primary bg-accent font-semibold text-accent-foreground'
          )}
          aria-pressed={active === option.id}
        >
          {option.icon}
          {option.label}
        </button>
      ))}
    </div>
  );
}
