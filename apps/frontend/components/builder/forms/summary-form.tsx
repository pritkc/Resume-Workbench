'use client';

import React from 'react';
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
    <div>
      <Textarea
        id="summary"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('builder.placeholders.summary')}
        className="summary-auto-field min-h-[80px] rounded-none border border-black/30 bg-white px-2 py-1.5 text-sm focus-visible:border-black focus-visible:ring-0"
      />
    </div>
  );
};
