'use client';

import { CoverLetterEditor } from './cover-letter-editor';
import { OutreachEditor } from './outreach-editor';

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
}: UtilitiesWorkspaceProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-border bg-card">
      <div className="flex min-h-0 flex-1 flex-col divide-y divide-black/10 overflow-y-auto">
        <div className="flex min-h-[min(40vh,420px)] min-w-0 flex-col">
          <CoverLetterEditor
            content={coverLetter}
            onChange={onCoverLetterChange}
            onSave={onSaveCoverLetter}
            isSaving={isCoverLetterSaving}
            actionStyle="default"
            layout="default"
            className="min-h-0 flex-1"
          />
        </div>
        <div className="flex min-h-[min(28vh,320px)] min-w-0 flex-col">
          <OutreachEditor
            content={outreachMessage}
            onChange={onOutreachChange}
            onSave={onSaveOutreach}
            isSaving={isOutreachSaving}
            actionStyle="default"
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </div>
  );
}
