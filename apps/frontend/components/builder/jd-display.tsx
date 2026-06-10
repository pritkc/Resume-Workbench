'use client';

import { FileText } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDDisplayProps {
  content: string;
}

/**
 * Read-only display of the job description.
 * Shows the original JD text in a scrollable container.
 */
export function JDDisplay({ content }: JDDisplayProps) {
  const { t } = useTranslations();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b border-border bg-card px-2.5 py-1.5">
        <FileText className="h-3.5 w-3.5 text-gray-500" aria-hidden />
        <h3 className="text-[12px] font-semibold text-gray-800">
          {t('builder.jdMatch.jobDescriptionTitle')}
        </h3>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
        <div className="whitespace-pre-wrap text-[13px] leading-snug text-gray-800">{content}</div>
      </div>
    </div>
  );
}
