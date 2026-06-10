'use client';

import React, { useState } from 'react';
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
    <div className="resume-canvas-rich group/summary relative">
      <div className="resume-canvas-section-actions absolute right-0 top-0 z-10">
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setShowAlignmentMenu((open) => !open)}
            aria-label={t('builder.summary.alignmentMenu')}
            className="h-6 w-6 border-0 bg-transparent text-muted-foreground hover:text-foreground"
          >
            <AlignLeft className="h-3 w-3" />
          </Button>
          {showAlignmentMenu ? (
            <div className="absolute right-0 top-full z-20 mt-1 flex gap-0.5 border border-border bg-card p-1">
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
                  className={cn(
                    'h-6 w-6',
                    alignment === tool.id &&
                      'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  <tool.icon className="h-3 w-3" />
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
        minHeight="24px"
        toolbarMode="none"
        surface="inline"
        plainTextPaste
      />
    </div>
  );
};
