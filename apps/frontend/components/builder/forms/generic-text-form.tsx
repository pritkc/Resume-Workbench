'use client';

import React from 'react';
import { useTranslations } from '@/lib/i18n';
import { InlineResumeTextarea } from '../inline-resume-field';

interface GenericTextFormProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export const GenericTextForm: React.FC<GenericTextFormProps> = ({
  value,
  onChange,
  placeholder,
}) => {
  const { t } = useTranslations();
  const finalPlaceholder = placeholder ?? t('builder.customSections.defaultTextPlaceholder');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <InlineResumeTextarea
      pasteMode="plainTextMultiline"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={finalPlaceholder}
      rows={3}
      aria-label={t('builder.customSections.contentLabel')}
    />
  );
};
