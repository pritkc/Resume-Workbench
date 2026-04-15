'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, FileText, Mail, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface GeneratePromptProps {
  /** Type of content to generate */
  type: 'cover-letter' | 'outreach';
  /** Whether generation is in progress */
  isGenerating: boolean;
  /** Callback to trigger generation */
  onGenerate: () => void;
  /** Whether this is a tailored resume (has job context) */
  isTailoredResume: boolean;
  /** Optional override for the generate button label */
  buttonLabel?: string;
  /** Additional class names */
  className?: string;
}

export function GeneratePrompt({
  type,
  isGenerating,
  onGenerate,
  isTailoredResume,
  buttonLabel,
  className,
}: GeneratePromptProps) {
  const { t } = useTranslations();
  const isOutreach = type === 'outreach';
  const Icon = isOutreach ? Mail : FileText;
  const title = isOutreach ? t('outreach.title') : t('coverLetter.title');

  // Show a different message if resume is not tailored
  if (!isTailoredResume) {
    return (
      <div
        className={cn(
          'flex min-h-[260px] flex-col items-center justify-center p-6 text-center',
          className
        )}
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center border border-gray-300 bg-gray-100">
          <Icon className="h-6 w-6 text-gray-400" />
        </div>
        <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider text-gray-600">
          {t('builder.generatePrompt.notAvailableTitle', { title })}
        </h3>
        <p className="mb-4 max-w-md font-mono text-[11px] leading-relaxed text-gray-500">
          {t('builder.generatePrompt.notAvailableDescription', { title })}
        </p>
        <div className="flex items-center gap-2 font-mono text-[11px] text-blue-700">
          <span>{t('builder.generatePrompt.goToDashboard')}</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-[260px] flex-col items-center justify-center p-6 text-center',
        className
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center border border-blue-700 bg-blue-50">
        <Icon className="h-6 w-6 text-blue-700" />
      </div>
      <h3 className="mb-2 font-mono text-xs font-bold uppercase tracking-wider">
        {t('builder.generatePrompt.generateTitle', { title })}
      </h3>
      <p className="mb-4 max-w-md font-mono text-[11px] leading-relaxed text-gray-600">
        {isOutreach
          ? t('builder.generatePrompt.outreachDescription')
          : t('builder.generatePrompt.coverLetterDescription')}
      </p>
      <Button onClick={onGenerate} disabled={isGenerating} size="xs" className="gap-1.5">
        {isGenerating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('common.generating')}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            {buttonLabel || t('builder.generatePrompt.generateButton', { title })}
          </>
        )}
      </Button>
      <p className="mt-3 font-mono text-[10px] text-gray-400">
        {isOutreach
          ? t('builder.generatePrompt.outreachFooter')
          : t('builder.generatePrompt.coverLetterFooter')}
      </p>
    </div>
  );
}
