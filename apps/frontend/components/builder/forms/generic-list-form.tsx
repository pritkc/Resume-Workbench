'use client';

import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useTranslations } from '@/lib/i18n';

interface GenericListFormProps {
  items: string[];
  onChange: (items: string[]) => void;
  label?: string;
  placeholder?: string;
}

/**
 * Generic List Form Component
 *
 * Used for STRING_LIST type sections (like Skills).
 * Renders a textarea where items are separated by newlines.
 */
export const GenericListForm: React.FC<GenericListFormProps> = ({
  items,
  onChange,
  label,
  placeholder,
}) => {
  const { t } = useTranslations();
  const finalLabel = label ?? t('builder.customSections.itemsLabel');
  const finalPlaceholder = placeholder ?? t('builder.customSections.itemsPlaceholder');

  const handleChange = (value: string) => {
    // Split by newlines, filter empty lines
    const newItems = value.split('\n').filter((item) => item.trim() !== '');
    onChange(newItems);
  };

  const formatItems = (arr?: string[]) => {
    return arr?.join('\n') || '';
  };

  // Explicitly allow Enter key to create newlines
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
    }
  };

  return (
    <div>
      <div className="panel-section-header">{finalLabel}</div>
      <Textarea
        value={formatItems(items)}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={finalPlaceholder}
        className="min-h-[80px] rounded-none border border-black/30 bg-white px-2 py-1.5 text-sm focus-visible:border-black focus-visible:ring-0"
      />
    </div>
  );
};
