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
  /** Icon-only actions with tooltips. */
  actionStyle?: 'default' | 'icon';
}

export function OutreachEditor({
  content,
  onChange,
  onSave,
  isSaving,
  className,
  actionStyle = 'default',
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

  const iconActions = actionStyle === 'icon';

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <Mail className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
          <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-widest text-black">
            {t('outreach.title')}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {iconActions ? (
            <>
              <Button
                size="icon-sm"
                variant="builderOutline"
                onClick={onSave}
                disabled={isSaving}
                aria-label={isSaving ? t('common.saving') : t('common.save')}
                title={isSaving ? t('common.saving') : t('common.save')}
                className="h-8 w-8 shrink-0 rounded-none"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                size="icon-sm"
                variant="builderOutline"
                onClick={handleCopy}
                disabled={!content}
                aria-label={isCopied ? t('outreach.copied') : t('outreach.copy')}
                title={isCopied ? t('outreach.copied') : t('outreach.copy')}
                className="h-8 w-8 shrink-0 rounded-none"
              >
                {isCopied ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="builderOutline" onClick={onSave} disabled={isSaving}>
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                {isSaving ? t('common.saving') : t('common.save')}
              </Button>
              <Button size="xs" variant="builderOutline" onClick={handleCopy} disabled={!content}>
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {t('outreach.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    {t('outreach.copy')}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
        <textarea
          value={content}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('outreach.editor.placeholder')}
          className={cn(
            'min-h-[100px] w-full flex-1 p-2',
            'font-mono text-[13px] leading-relaxed',
            'border border-black/20 bg-white',
            'resize-y',
            'focus:border-black focus:outline-none focus:ring-0',
            'placeholder:text-black/30'
          )}
        />
        <div className="mt-1 flex shrink-0 justify-end pt-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-black/45">
            {t('builder.contentStats.wordsChars', { wordCount, charCount })}
          </span>
        </div>
      </div>
    </div>
  );
}
