'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Eye, EyeOff, Pencil, Check, X } from 'lucide-react';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  section: SectionMeta;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  canDelete: boolean;
  /** Optional “add entry” control (e.g. new job / school / project / skill group) — shown on the right. */
  addEntry?: { label: string; onClick: () => void };
  children?: React.ReactNode;
}

/**
 * SectionHeader: visibility (left), title (center), add + delete (right; delete fades in on row hover).
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  section,
  onRename,
  onDelete,
  onToggleVisibility,
  canDelete,
  addEntry,
  children,
}) => {
  const { t } = useTranslations();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(section.displayName);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleStartEdit = () => {
    setEditedName(section.displayName);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim()) {
      onRename(editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(section.displayName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDeleteClick = () => {
    if (section.isDefault) {
      onToggleVisibility();
    } else {
      setShowDeleteConfirm(true);
    }
  };

  const isPersonalInfo = section.id === 'personalInfo';
  const isHidden = !section.isVisible;

  return (
    <div className={cn('group/section space-y-0', isHidden ? 'opacity-60' : '')}>
      <div className="relative mb-1.5 flex items-center gap-2 border-b border-border pb-1.5">
        {!isPersonalInfo &&
          (isEditing ? (
            <span className="inline-block w-7 shrink-0" aria-hidden />
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
              className={cn(
                'h-7 w-7 shrink-0 border border-border',
                section.isVisible ? 'text-muted-foreground' : 'text-muted-foreground/50'
              )}
              onClick={onToggleVisibility}
              title={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
            >
              {section.isVisible ? (
                <Eye className="h-3.5 w-3.5" />
              ) : (
                <EyeOff className="h-3.5 w-3.5" />
              )}
            </Button>
          ))}

        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {isEditing ? (
            <div className="flex min-w-0 items-center gap-1">
              <Input
                pasteMode="plainTextSingleParagraph"
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-7 max-w-[min(100%,14rem)] rounded-none border border-border bg-card px-2 font-mono text-sm focus-visible:border-primary focus-visible:ring-0"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.save')}
                className="h-7 w-7 shrink-0 border border-border text-foreground hover:bg-accent"
                onClick={handleSaveEdit}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.cancel')}
                className="h-7 w-7 shrink-0 border border-border text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={handleCancelEdit}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <h3 className="truncate text-sm font-semibold text-foreground">{section.displayName}</h3>
              {!isPersonalInfo && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('builder.sectionHeader.renameSection')}
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleStartEdit}
                  title={t('builder.sectionHeader.renameSection')}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {!section.isDefault && (
                <span className="shrink-0 border border-border bg-muted px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t('builder.sectionHeader.customTag')}
                </span>
              )}
              {isHidden && (
                <span className="shrink-0 border border-border px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {t('builder.sectionHeader.hiddenFromPdfTag')}
                </span>
              )}
            </>
          )}
        </div>

        {!isEditing && addEntry ? (
          <button
            type="button"
            onClick={addEntry.onClick}
            className="builder-field-caption inline-flex shrink-0 items-center gap-0.5 underline decoration-black/20 underline-offset-2 hover:text-foreground"
          >
            <Plus className="h-3 w-3" aria-hidden />
            {addEntry.label}
          </button>
        ) : null}

        {!isEditing && canDelete ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('builder.sectionHeader.deleteSection')}
            className="h-7 w-7 shrink-0 border border-border bg-card/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-red-600/30 hover:bg-red-50/90 hover:text-red-700 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
            onClick={handleDeleteClick}
            title={
              section.isDefault
                ? section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
                : t('builder.sectionHeader.deleteSection')
            }
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        ) : null}
      </div>

      {children}

      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('builder.sectionHeader.deleteTitle')}
        description={t('builder.sectionHeader.deleteDescription', { name: section.displayName })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={onDelete}
      />
    </div>
  );
};
