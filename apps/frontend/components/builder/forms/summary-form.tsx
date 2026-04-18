'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';

interface SummaryFormProps {
  value: string;
  onChange: (value: string) => void;
}

export const SummaryForm: React.FC<SummaryFormProps> = ({ value, onChange }) => {
  const { t } = useTranslations();

  // Explicitly allow Enter key to create newlines
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1.5">
        <Label htmlFor="summary" className="text-[11px] font-medium text-gray-700">
          {t('resume.sections.summary')}
        </Label>
        <Textarea
          id="summary"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('builder.placeholders.summary')}
          className="min-h-[100px] rounded-none border-black/15 bg-white text-[13px] text-gray-900 focus-visible:border-blue-700 focus-visible:ring-0 focus-visible:ring-offset-0"
        />
      </div>
    </div>
  );
};
