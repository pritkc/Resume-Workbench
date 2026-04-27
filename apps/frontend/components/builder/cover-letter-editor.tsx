'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Save, Loader2, FileText, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';
import { handlePasteWithMode } from '@/lib/paste-plain-text';

export interface CoverLetterEditorProps {
  /** Cover letter content */
  content: string;
  /** Callback when content changes */
  onChange: (content: string) => void;
  /** Callback when save is triggered */
  onSave: () => void;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Additional class names */
  className?: string;
  /** Icon-only actions with tooltips (saves horizontal space). */
  actionStyle?: 'default' | 'icon';
  /** `letter`: narrow portrait column for long-form letter editing. */
  layout?: 'default' | 'letter';
}

export function CoverLetterEditor({
  content,
  onChange,
  onSave,
  isSaving,
  className,
  actionStyle = 'default',
  layout = 'default',
}: CoverLetterEditorProps) {
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
      window.setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const iconActions = actionStyle === 'icon';

  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-white px-2 py-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <FileText className="h-3.5 w-3.5 shrink-0 text-black/40" aria-hidden />
          <h2 className="truncate font-mono text-[11px] font-semibold uppercase tracking-widest text-black">
            {t('coverLetter.title')}
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
                onClick={() => void handleCopy()}
                disabled={!content}
                aria-label={isCopied ? t('coverLetter.copied') : t('outreach.copy')}
                title={isCopied ? t('coverLetter.copied') : t('outreach.copy')}
                className="h-8 w-8 shrink-0 rounded-none"
              >
                {isCopied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </>
          ) : (
            <>
              <Button size="xs" variant="builderOutline" onClick={onSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {isSaving ? t('common.saving') : t('common.save')}
              </Button>
              <Button
                size="xs"
                variant="builderOutline"
                onClick={() => void handleCopy()}
                disabled={!content}
              >
                {isCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    {t('coverLetter.copied')}
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

      <div
        className={cn(
          'flex min-h-0 flex-1 flex-col overflow-hidden',
          layout === 'letter' ? 'items-center px-2 py-2 md:px-3' : 'p-2'
        )}
      >
        <div
          className={cn(
            'flex min-h-0 w-full flex-1 flex-col',
            layout === 'letter' &&
              'max-w-[min(28rem,100%)] border border-black/15 bg-white shadow-[0_1px_0_0_rgba(0,0,0,0.04)] md:min-h-[min(72vh,820px)]'
          )}
        >
          <textarea
            value={content}
            onChange={(e) => onChange(e.target.value)}
            onPaste={(e) => handlePasteWithMode(e, 'plainTextMultiline', () => content, onChange)}
            placeholder={t('coverLetter.editor.placeholder')}
            className={cn(
              'min-h-[120px] w-full flex-1 p-2.5',
              'font-mono text-[13px] leading-relaxed',
              layout === 'letter' ? 'border-0 bg-transparent' : 'border border-black/20 bg-white',
              'resize-y',
              'focus:outline-none focus:ring-0',
              layout === 'letter'
                ? 'focus-visible:ring-1 focus-visible:ring-black/15'
                : 'focus:border-black',
              'placeholder:text-black/30'
            )}
          />
          <div className="flex shrink-0 justify-end border-t border-black/10 px-2 py-1">
            <span className="font-mono text-[10px] uppercase tracking-wide text-black/45">
              {t('builder.contentStats.wordsChars', { wordCount, charCount })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
