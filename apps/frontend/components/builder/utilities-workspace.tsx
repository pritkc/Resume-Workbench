'use client';

import Link from 'next/link';
import { Sparkles, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CoverLetterEditor } from './cover-letter-editor';
import { OutreachEditor } from './outreach-editor';
import { useTranslations } from '@/lib/i18n';

export interface UtilitiesWorkspaceProps {
  coverLetter: string;
  outreachMessage: string;
  onCoverLetterChange: (value: string) => void;
  onOutreachChange: (value: string) => void;
  onSaveCoverLetter: () => void;
  onSaveOutreach: () => void;
  isCoverLetterSaving: boolean;
  isOutreachSaving: boolean;
  canGeneratePackage: boolean;
  isGenerating: boolean;
  onGeneratePackage: () => void;
  resumeId: string | null;
}

export function UtilitiesWorkspace({
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
  resumeId,
}: UtilitiesWorkspaceProps) {
  const { t } = useTranslations();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-black/10 bg-white">
      <div className="flex shrink-0 items-center justify-end gap-1 border-b border-black/10 bg-black/[0.02] px-1.5 py-1 md:px-2">
        {canGeneratePackage ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onGeneratePackage}
            disabled={isGenerating || !resumeId}
            aria-label={t('builder.generateClMessage.buttonAria')}
            title={t('builder.generateClMessage.buttonAria')}
            className="h-8 w-8 rounded-none border border-black/15 text-black/60 hover:border-black/30 hover:text-black"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Link
            href="/tailor"
            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-black/15 text-black/50 hover:border-black/30 hover:text-black"
            aria-label={t('builder.lettersWorkspace.goToTailor')}
            title={t('builder.lettersWorkspace.goToTailor')}
          >
            <ExternalLink className="h-4 w-4" />
          </Link>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:divide-x lg:divide-black/10">
        <div className="flex min-h-[min(52vh,560px)] min-w-0 flex-[1.15] flex-col border-b border-black/10 lg:min-h-0 lg:border-b-0">
          <CoverLetterEditor
            content={coverLetter}
            onChange={onCoverLetterChange}
            onSave={onSaveCoverLetter}
            isSaving={isCoverLetterSaving}
            actionStyle="icon"
            layout="letter"
            className="min-h-0 flex-1"
          />
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <OutreachEditor
            content={outreachMessage}
            onChange={onOutreachChange}
            onSave={onSaveOutreach}
            isSaving={isOutreachSaving}
            actionStyle="icon"
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </div>
  );
}
