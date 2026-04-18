'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Save, Loader2, Copy, Check, Mail } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface OutreachEditorProps {
  /** Outreach message content */
  content: string;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Callback when save is triggered */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Additional class names */
  className?: string;
}

export function OutreachEditor({
  content,
  onChange,
  onSave,
  isSaving,
  className,
}: OutreachEditorProps) {
  const { t } = useTranslations();
  const [isCopied, setIsCopied] = React.useState(false);

  const wordCount = content
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
  const charCount = content.length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-2.5 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0 text-gray-500" aria-hidden />
          <h2 className="truncate text-[13px] font-semibold text-gray-900">
            {t('outreach.title')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-gray-500">
            {t('builder.contentStats.wordsChars', { wordCount, charCount })}
          </span>
          <Button size="xs" variant="outline" onClick={onSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isSaving ? t('common.saving') : t('common.save')}
          </Button>
          <Button size="xs" onClick={handleCopy} disabled={!content}>
            {isCopied ? (
              <>
                <Check className="w-4 h-4" />
                {t('outreach.copied')}
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                {t('outreach.copy')}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-2">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('outreach.editor.placeholder')}
          className={cn(
            'h-full min-h-[200px] w-full p-2.5',
            'font-mono text-[13px] leading-relaxed',
            'border border-black/15 bg-white',
            'resize-none',
            'focus:outline-none focus:ring-1 focus:ring-blue-700',
            'placeholder:text-gray-400'
          )}
          aria-describedby="outreach-tip"
        />
        <p id="outreach-tip" className="mt-1.5 text-[10px] leading-snug text-gray-500">
          {t('outreach.editor.tip')}
        </p>
      </div>
    </div>
  );
}
