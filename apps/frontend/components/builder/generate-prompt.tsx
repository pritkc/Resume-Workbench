'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Loader2, FileText, Mail, ArrowRight, Mails } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface GeneratePromptProps {
  /** Type of content to generate */
  type: 'cover-letter' | 'outreach' | 'letters';
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
  const isLetters = type === 'letters';
  const Icon = isLetters ? Mails : isOutreach ? Mail : FileText;
  const singleDocTitle = isOutreach ? t('outreach.title') : t('coverLetter.title');

  // Show a different message if resume is not tailored
  if (!isTailoredResume) {
    return (
      <div
        className={cn(
          'flex min-h-[180px] flex-col items-center justify-center px-4 py-6 text-center',
          className
        )}
      >
        <div className="mb-3 flex h-9 w-9 items-center justify-center border border-black/10 bg-gray-50">
          <Icon className="h-4 w-4 text-gray-400" aria-hidden />
        </div>
        <h3 className="mb-1 text-[13px] font-semibold text-gray-800">
          {isLetters
            ? t('builder.generatePrompt.lettersNotAvailableTitle')
            : t('builder.generatePrompt.notAvailableTitle', { title: singleDocTitle })}
        </h3>
        <p className="mb-3 max-w-md text-[12px] leading-snug text-gray-600">
          {isLetters
            ? t('builder.generatePrompt.lettersNotAvailableDescription')
            : t('builder.generatePrompt.notAvailableDescription', { title: singleDocTitle })}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-blue-800">
          <span>{t('builder.generatePrompt.goToDashboard')}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-[180px] flex-col items-center justify-center px-4 py-6 text-center',
        className
      )}
    >
      <div className="mb-3 flex h-9 w-9 items-center justify-center border border-blue-700/30 bg-blue-50/80">
        <Icon className="h-4 w-4 text-blue-800" aria-hidden />
      </div>
      <h3 className="mb-1 text-[13px] font-semibold text-gray-900">
        {isLetters
          ? t('builder.generatePrompt.lettersGenerateTitle')
          : t('builder.generatePrompt.generateTitle', { title: singleDocTitle })}
      </h3>
      <p className="mb-3 max-w-md text-[12px] leading-snug text-gray-600">
        {isLetters
          ? t('builder.generatePrompt.lettersDescription')
          : isOutreach
            ? t('builder.generatePrompt.outreachDescription')
            : t('builder.generatePrompt.coverLetterDescription')}
      </p>
      <Button onClick={onGenerate} disabled={isGenerating} size="xs" className="gap-1.5">
        {isGenerating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            {t('common.generating')}
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            {buttonLabel ||
              (isLetters
                ? t('builder.generateClMessage.toolbarLabel')
                : t('builder.generatePrompt.generateButton', { title: singleDocTitle }))}
          </>
        )}
      </Button>
      <p className="mt-2 text-[10px] text-gray-500">
        {isLetters
          ? t('builder.generatePrompt.lettersFooter')
          : isOutreach
            ? t('builder.generatePrompt.outreachFooter')
            : t('builder.generatePrompt.coverLetterFooter')}
      </p>
    </div>
  );
}
