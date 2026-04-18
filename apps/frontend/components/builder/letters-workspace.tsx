'use client';

import { CoverLetterEditor } from './cover-letter-editor';
import { OutreachEditor } from './outreach-editor';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

export interface LettersWorkspaceProps {
  coverLetter: string;
  outreachMessage: string;
  onCoverLetterChange: (value: string) => void;
  onOutreachChange: (value: string) => void;
  onSaveCoverLetter: () => void;
  onSaveOutreach: () => void;
  isCoverLetterSaving: boolean;
  isOutreachSaving: boolean;
  /** When true, show the LLM generate control (requires tailored job context server-side). */
  canGeneratePackage: boolean;
  isGenerating: boolean;
  onGeneratePackage: () => void;
}

/**
 * Single workspace for cover letter + outreach: always editable (paste or LLM).
 */
export function LettersWorkspace({
  coverLetter,
  outreachMessage,
  onCoverLetterChange,
  onOutreachChange,
  onSaveCoverLetter,
  onSaveOutreach,
  isCoverLetterSaving,
  isOutreachSaving,
  canGeneratePackage,
  isGenerating,
  onGeneratePackage,
}: LettersWorkspaceProps) {
  const { t } = useTranslations();

  return (
    <div className="flex min-h-0 flex-col border border-black/15 bg-white">
      {canGeneratePackage ? (
        <div className="flex flex-col gap-1.5 border-b border-black/10 bg-gray-50/90 px-2.5 py-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-snug text-gray-600">
            {t('builder.lettersWorkspace.hint')}
          </p>
          <Button
            type="button"
            variant="outline"
            size="xs"
            onClick={onGeneratePackage}
            disabled={isGenerating}
            aria-label={t('builder.generateClMessage.buttonAria')}
            title={t('builder.generateClMessage.buttonAria')}
            className="w-full shrink-0 gap-1.5 sm:w-auto"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {t('common.generating')}
              </>
            ) : (
              <>
                <Sparkles className="h-3.5 w-3.5" />
                {t('builder.generateClMessage.toolbarLabel')}
              </>
            )}
          </Button>
        </div>
      ) : null}

      <div className="grid min-h-[280px] flex-1 grid-cols-1 divide-y divide-black/10 md:grid-cols-2 md:divide-x md:divide-y-0">
        <div className="flex min-h-0 min-w-0 flex-col">
          <CoverLetterEditor
            content={coverLetter}
            onChange={onCoverLetterChange}
            onSave={onSaveCoverLetter}
            isSaving={isCoverLetterSaving}
            className="min-h-[240px] flex-1"
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <OutreachEditor
            content={outreachMessage}
            onChange={onOutreachChange}
            onSave={onSaveOutreach}
            isSaving={isOutreachSaving}
            className="min-h-[240px] flex-1"
          />
        </div>
      </div>
    </div>
  );
}
