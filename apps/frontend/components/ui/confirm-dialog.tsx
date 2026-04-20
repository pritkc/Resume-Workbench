'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { useTranslations } from '@/lib/i18n';

/**
 * Swiss International Style Confirm Dialog Component
 *
 * A modal dialog for confirming user actions with semantic variants:
 * - danger: Destructive actions (delete, remove)
 * - warning: Caution actions (reset, overwrite)
 * - success: Positive confirmations
 * - default: Neutral confirmations
 */

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  errorMessage?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmDisabled?: boolean;
  variant?: 'danger' | 'warning' | 'success' | 'default';
  closeOnConfirm?: boolean;
  onConfirm: () => void;
  onCancel?: () => void;
  showCancelButton?: boolean;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  errorMessage,
  confirmLabel,
  cancelLabel,
  confirmDisabled = false,
  variant = 'default',
  closeOnConfirm = true,
  onConfirm,
  onCancel,
  showCancelButton = true,
}) => {
  const { t } = useTranslations();
  const finalConfirmLabel = confirmLabel ?? t('common.confirm');
  const finalCancelLabel = cancelLabel ?? t('common.cancel');

  const handleConfirm = () => {
    if (confirmDisabled) return;
    onConfirm();
    if (closeOnConfirm) {
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const variantStyles = {
    danger: {
      accent: 'border-l-4 border-l-red-600',
      buttonVariant: 'destructive' as const,
    },
    warning: {
      accent: 'border-l-4 border-l-black/40',
      buttonVariant: 'warning' as const,
    },
    success: {
      accent: 'border-l-4 border-l-black/40',
      buttonVariant: 'success' as const,
    },
    default: {
      accent: 'border-l-4 border-l-black/40',
      buttonVariant: 'default' as const,
    },
  };

  const { accent, buttonVariant } = variantStyles[variant];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[320px] gap-0 border-2 border-black bg-[#F0F0E8] p-0 shadow-[4px_4px_0_#000] sm:max-w-[320px]">
        <DialogHeader className={`p-4 pb-3 ${accent}`}>
          <DialogTitle className="pr-8 font-mono text-sm font-semibold uppercase tracking-wide text-black">
            {title}
          </DialogTitle>
          <DialogDescription className="mt-1.5 font-sans text-xs leading-snug text-black/50">
            {description}
          </DialogDescription>
        </DialogHeader>
        {errorMessage && (
          <div className="px-4 pb-3">
            <div className="border border-red-600 bg-red-50/90 p-2 font-mono text-[11px] text-red-700">
              {errorMessage}
            </div>
          </div>
        )}
        <DialogFooter className="flex flex-row justify-end gap-2 border-t border-black/20 bg-white/80 p-3">
          {showCancelButton && (
            <Button
              variant="builderOutline"
              size="xs"
              onClick={handleCancel}
              className="shadow-none"
            >
              {finalCancelLabel}
            </Button>
          )}
          <Button
            variant={buttonVariant}
            size="xs"
            onClick={handleConfirm}
            className="shadow-none"
            disabled={confirmDisabled}
          >
            {finalConfirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
