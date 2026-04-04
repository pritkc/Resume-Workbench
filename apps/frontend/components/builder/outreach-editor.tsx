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
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-black bg-[#F5F5F0] px-3 py-2.5">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4" />
          <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
            {t('outreach.title')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-gray-500">
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

      {/* Editor Area */}
      <div className="flex-1 overflow-hidden p-3">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('outreach.editor.placeholder')}
          className={cn(
            'h-full min-h-[220px] w-full p-3',
            'font-mono text-sm leading-relaxed',
            'border border-black bg-white',
            'resize-none',
            'focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2',
            'placeholder:text-gray-400'
          )}
        />
      </div>

      {/* Footer Tips */}
      <div className="border-t border-gray-200 bg-[#F5F5F0] px-3 py-2">
        <p className="font-mono text-[11px] text-gray-500">{t('outreach.editor.tip')}</p>
      </div>
    </div>
  );
}
