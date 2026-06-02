'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface CvSectionNavProps {
  sections: Array<{ id: string; label: string }>;
  className?: string;
}

function scrollToSection(id: string) {
  document.getElementById(`cv-section-${id}`)?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

export function CvSectionNav({ sections, className }: CvSectionNavProps) {
  const { t } = useTranslations();
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '');

  useEffect(() => {
    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        const top = visible[0]?.target.id.replace('cv-section-', '');
        if (top) {
          setActiveId(top);
        }
      },
      { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.25, 0.5] }
    );

    sections.forEach(({ id }) => {
      const element = document.getElementById(`cv-section-${id}`);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [sections]);

  const activeIndex = sections.findIndex((section) => section.id === activeId);
  const safeIndex = activeIndex >= 0 ? activeIndex : 0;

  const goToIndex = useCallback(
    (index: number) => {
      const section = sections[index];
      if (!section) return;
      setActiveId(section.id);
      scrollToSection(section.id);
    },
    [sections]
  );

  if (sections.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'sticky top-0 z-[12] flex items-center gap-1 border-b border-border bg-background/95 px-2 py-1 shadow-sw-sm backdrop-blur-sm',
        className
      )}
    >
      <span className="sr-only">{t('builder.sectionNav.jumpLabel')}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={safeIndex <= 0}
        onClick={() => goToIndex(safeIndex - 1)}
        aria-label={t('builder.sectionNav.previous')}
        className="h-7 w-7 shrink-0 border border-border"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </Button>
      <select
        value={activeId}
        onChange={(event) => {
          const nextId = event.target.value;
          setActiveId(nextId);
          scrollToSection(nextId);
        }}
        className="builder-field-label h-7 min-w-0 flex-1 truncate rounded-none border border-border bg-card px-2 text-[12px] font-medium text-foreground focus:border-primary focus:outline-none"
        aria-label={t('builder.sectionNav.jumpLabel')}
      >
        {sections.map(({ id, label }) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={safeIndex >= sections.length - 1}
        onClick={() => goToIndex(safeIndex + 1)}
        aria-label={t('builder.sectionNav.next')}
        className="h-7 w-7 shrink-0 border border-border"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
