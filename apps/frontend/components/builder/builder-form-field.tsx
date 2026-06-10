'use client';

import { cn } from '@/lib/utils';

export interface BuilderFormFieldProps {
  label: React.ReactNode;
  hint?: string;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

export function BuilderFormField({
  label,
  hint,
  htmlFor,
  className,
  children,
}: BuilderFormFieldProps) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <label htmlFor={htmlFor} className="builder-field-label block">
        {label}
      </label>
      {children}
      {hint ? <p className="builder-form-hint">{hint}</p> : null}
    </div>
  );
}
