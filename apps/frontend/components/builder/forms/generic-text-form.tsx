'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { BuilderFormField } from '../builder-form-field';
import { useTranslations } from '@/lib/i18n';

interface GenericTextFormProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Generic Text Form Component
 *
 * Used for TEXT type sections (like Summary).
 * Renders a single textarea for text content.
 */
export const GenericTextForm: React.FC<GenericTextFormProps> = ({
  value,
  onChange,
  label,
  placeholder,
}) => {
  const { t } = useTranslations();
  const finalLabel = label ?? t('builder.customSections.contentLabel');
  const finalPlaceholder = placeholder ?? t('builder.customSections.defaultTextPlaceholder');

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <BuilderFormField label={finalLabel}>
      <Textarea
        pasteMode="plainTextMultiline"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={finalPlaceholder}
        className="builder-field-textarea min-h-[100px]"
      />
    </BuilderFormField>
  );
};
