import * as React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | 'default'
    | 'destructive'
    | 'success'
    | 'warning'
    | 'outline'
    | 'secondary'
    | 'ghost'
    | 'link'
    | 'builderCta'
    | 'builderOutline';
  size?: 'default' | 'sm' | 'xs' | 'lg' | 'icon' | 'icon-sm';
}

export type ButtonVariant = NonNullable<ButtonProps['variant']>;
export type ButtonSize = NonNullable<ButtonProps['size']>;

export function buttonClassNames({
  className,
  variant = 'default',
  size = 'default',
}: {
  className?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const baseStyles = cn(
    'inline-flex items-center justify-center gap-2',
    'whitespace-nowrap text-sm font-medium font-mono uppercase tracking-wide',
    'transition-colors duration-150 ease-out',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
    'rounded-none'
  );

  const variants = {
    default: cn('border border-primary bg-primary text-primary-foreground', 'hover:bg-primary/90'),
    destructive: cn(
      'border border-destructive bg-destructive text-destructive-foreground',
      'hover:bg-destructive/90'
    ),
    success: cn(
      'border border-green-700 bg-green-700 text-white',
      'hover:bg-green-800 dark:border-green-600 dark:bg-green-600 dark:hover:bg-green-500'
    ),
    warning: cn('border border-orange-500 bg-orange-500 text-white', 'hover:bg-orange-600'),
    outline: cn(
      'border border-border bg-background text-foreground',
      'hover:bg-accent hover:text-accent-foreground'
    ),
    secondary: cn(
      'border border-border bg-secondary text-secondary-foreground',
      'hover:bg-secondary/80'
    ),
    ghost: cn(
      'border-none bg-transparent text-foreground shadow-none',
      'hover:bg-accent hover:text-accent-foreground'
    ),
    link: cn(
      'border-none bg-transparent text-primary shadow-none',
      'underline-offset-4 hover:underline',
      'p-0 h-auto'
    ),
    builderCta: cn(
      'border border-primary bg-primary text-primary-foreground',
      'text-[11px] font-mono uppercase tracking-wider',
      'hover:bg-primary/90'
    ),
    builderOutline: cn(
      'border border-border bg-card text-foreground',
      'text-[11px] font-mono uppercase tracking-wider',
      'shadow-none hover:bg-accent'
    ),
  };

  const sizes = {
    default: 'h-9 px-4 py-2',
    sm: 'h-8 px-3 py-1 text-xs',
    xs: 'h-7 px-2.5 py-1 text-[11px]',
    lg: 'h-12 px-8 py-3 text-base',
    icon: 'h-9 w-9 p-0',
    'icon-sm': 'h-7 w-7 p-0',
  };

  return cn(baseStyles, variants[variant], sizes[size], className);
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button ref={ref} className={buttonClassNames({ variant, size, className })} {...props} />
    );
  }
);
Button.displayName = 'Button';

export { Button };
