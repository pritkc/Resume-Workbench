import * as React from 'react';
import { cn } from '@/lib/utils';
import { handlePasteWithMode, type PasteMode } from '@/lib/paste-plain-text';

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** Paste handling: plain text only; optional YAML-style line-wrap collapse. */
  pasteMode?: PasteMode;
};

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, pasteMode = 'native', onPaste, onChange, value, ...rest }, ref) => {
    const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (pasteMode !== 'native') {
        handlePasteWithMode(
          e,
          pasteMode,
          () => String(value ?? e.currentTarget.value),
          (next) => {
            onChange?.({
              target: { ...e.currentTarget, value: next },
              currentTarget: e.currentTarget,
            } as React.ChangeEvent<HTMLTextAreaElement>);
          }
        );
        onPaste?.(e);
        return;
      }
      onPaste?.(e);
    };

    return (
      <textarea
        className={cn(
          'flex min-h-[56px] w-full rounded-none border border-border bg-card px-2.5 py-1.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        {...rest}
        {...(value !== undefined ? { value } : {})}
        onChange={onChange}
        onPaste={handlePaste}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export { Textarea };
