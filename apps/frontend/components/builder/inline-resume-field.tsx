'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { handlePasteWithMode, type PasteMode } from '@/lib/paste-plain-text';

type FieldSize = 'default' | 'hero' | 'small' | 'muted';
type FieldAlign = 'left' | 'center' | 'right';

const sizeClass: Record<FieldSize, string> = {
  default: '',
  hero: 'resume-canvas-field-hero',
  small: 'resume-canvas-field-small',
  muted: 'resume-canvas-field-muted',
};

const alignClass: Record<FieldAlign, string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

type InlineResumeFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'className' | 'size'
> & {
  className?: string;
  fieldSize?: FieldSize;
  align?: FieldAlign;
  pasteMode?: PasteMode;
};

export function InlineResumeField({
  className,
  fieldSize = 'default',
  align = 'left',
  pasteMode = 'native',
  onPaste,
  onChange,
  value,
  ...props
}: InlineResumeFieldProps) {
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
      {...props}
      {...(value !== undefined ? { value } : {})}
      onChange={onChange}
      onPaste={handlePaste}
      className={cn(
        'resume-canvas-field',
        sizeClass[fieldSize],
        alignClass[align],
        className
      )}
    />
  );
}

type InlineResumeTextareaProps = Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  'className' | 'size'
> & {
  className?: string;
  fieldSize?: FieldSize;
  align?: FieldAlign;
  pasteMode?: PasteMode;
};

export function InlineResumeTextarea({
  className,
  fieldSize = 'default',
  align = 'left',
  pasteMode = 'native',
  onPaste,
  onChange,
  value,
  ...props
}: InlineResumeTextareaProps) {
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
      {...props}
      {...(value !== undefined ? { value } : {})}
      onChange={onChange}
      onPaste={handlePaste}
      className={cn(
        'resume-canvas-field resume-canvas-textarea',
        sizeClass[fieldSize],
        alignClass[align],
        className
      )}
    />
  );
}

export function ResumeCanvasAddLink({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn('resume-canvas-add-link', className)} {...props}>
      {children}
    </button>
  );
}
