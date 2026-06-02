import * as React from 'react';
import { cn } from '@/lib/utils';
import { handlePasteWithMode, type PasteMode } from '@/lib/paste-plain-text';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  /** Paste handling: YAML wrapped lines → one line; ignores rich clipboard HTML when not native. */
  pasteMode?: PasteMode;
};

/**
 * Swiss International Style Input Component
 *
 * Design Principles:
 * - Square corners (rounded-none) - Brutalist aesthetic
 * - Black border for high contrast
 * - Focus ring in Hyper Blue
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, pasteMode = 'native', onPaste, onChange, value, ...rest }, ref) => {
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      if (pasteMode !== 'native') {
        handlePasteWithMode(
          e,
          pasteMode,
          () => String(value ?? e.currentTarget.value),
          (next) => {
            onChange?.({
              target: { ...e.currentTarget, value: next },
              currentTarget: e.currentTarget,
            } as React.ChangeEvent<HTMLInputElement>);
          }
        );
        onPaste?.(e);
        return;
      }
      onPaste?.(e);
    };

    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-none border border-border bg-card px-2.5 py-1.5 text-sm text-foreground',
          'shadow-sm placeholder:text-muted-foreground',
          'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:border-primary',
          'disabled:cursor-not-allowed disabled:opacity-50',
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
Input.displayName = 'Input';

export { Input };
