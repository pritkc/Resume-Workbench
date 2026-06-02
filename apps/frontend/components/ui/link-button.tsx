'use client';

import Link from 'next/link';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { buttonClassNames, type ButtonSize, type ButtonVariant } from '@/components/ui/button';

interface LinkButtonProps extends Omit<
  ComponentPropsWithoutRef<typeof Link>,
  'className' | 'children'
> {
  children: ReactNode;
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function LinkButton({
  children,
  className,
  variant = 'default',
  size = 'default',
  ...props
}: LinkButtonProps) {
  return (
    <Link className={buttonClassNames({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
