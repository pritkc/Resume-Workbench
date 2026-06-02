'use client';

import React, { useState } from 'react';
import { AlignCenter, AlignJustify, AlignLeft, MoreHorizontal } from 'lucide-react';
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
  const [showAlignmentMenu, setShowAlignmentMenu] = useState(false);

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
      <div className="flex items-center justify-end">
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowAlignmentMenu((open) => !open)}
            aria-label={t('builder.summary.alignmentMenu')}
            title={t('builder.summary.alignmentMenu')}
            className="h-7 w-7 rounded-none border border-border bg-card"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
          {showAlignmentMenu ? (
            <div className="absolute right-0 top-full z-20 mt-1 flex gap-0.5 border border-border bg-card p-1 shadow-sm">
              {alignmentTools.map((tool) => (
                <Button
                  key={tool.id}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    updateSummary(html, tool.id);
                    setShowAlignmentMenu(false);
                  }}
                  aria-label={tool.label}
                  title={tool.label}
                  className={cn(
                    'rounded-none border border-border bg-card',
                    alignment === tool.id &&
                      'bg-primary text-white hover:bg-primary/90 hover:text-white'
                  )}
                >
                  <tool.icon className="h-3.5 w-3.5" />
                </Button>
              ))}
            </div>
          ) : null}
        </div>
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
