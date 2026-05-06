'use client';

import React from 'react';
import { AlignCenter, AlignJustify, AlignLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { useTranslations } from '@/lib/i18n';
import {
  type SummaryAlignment,
  formatSummaryValue,
  parseSummaryFormatting,
} from '@/lib/utils/summary-format';
import { cn } from '@/lib/utils';

interface SummaryFormProps {
  value: string;
  onChange: (value: string) => void;
}

export const SummaryForm: React.FC<SummaryFormProps> = ({ value, onChange }) => {
  const { t } = useTranslations();
  const { html, alignment } = parseSummaryFormatting(value);

  const updateSummary = (nextHtml: string, nextAlignment: SummaryAlignment = alignment) => {
    onChange(formatSummaryValue(nextHtml, nextAlignment));
  };

  const alignmentTools = [
    { id: 'left' as const, label: 'Align left', icon: AlignLeft },
    { id: 'center' as const, label: 'Align center', icon: AlignCenter },
    { id: 'justify' as const, label: 'Justify', icon: AlignJustify },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {alignmentTools.map((tool) => (
          <Button
            key={tool.id}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => updateSummary(html, tool.id)}
            aria-label={tool.label}
            title={tool.label}
            className={cn(
              'rounded-none border border-black/15 bg-white',
              alignment === tool.id && 'bg-blue-700 text-white hover:bg-blue-800 hover:text-white'
            )}
          >
            <tool.icon className="h-3.5 w-3.5" />
          </Button>
        ))}
      </div>
      <RichTextEditor
        value={html}
        onChange={(nextHtml) => updateSummary(nextHtml)}
        placeholder={t('builder.placeholders.summary')}
        minHeight="96px"
        toolbarMode="none"
        plainTextPaste
      />
    </div>
  );
};
