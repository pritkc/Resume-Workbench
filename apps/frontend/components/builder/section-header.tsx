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
      <div className="relative mb-1.5 flex items-center gap-2 border-b border-black/15 pb-1.5">
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
                'h-7 w-7 shrink-0 border border-black/15',
                section.isVisible ? 'text-black/50' : 'text-black/25'
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
                className="h-7 max-w-[min(100%,14rem)] rounded-none border border-black/30 bg-white px-2 font-mono text-sm focus-visible:border-black focus-visible:ring-0"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.save')}
                className="h-7 w-7 shrink-0 border border-black/20 text-black hover:bg-black/[0.04]"
                onClick={handleSaveEdit}
              >
                <Check className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.cancel')}
                className="h-7 w-7 shrink-0 border border-black/20 text-black/50 hover:bg-black/[0.04] hover:text-black"
                onClick={handleCancelEdit}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <>
              <h3 className="truncate font-mono text-[12px] font-semibold uppercase tracking-wide text-black">
                {section.displayName}
              </h3>
              {!isPersonalInfo && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('builder.sectionHeader.renameSection')}
                  className="h-7 w-7 shrink-0 text-black/35 hover:text-black"
                  onClick={handleStartEdit}
                  title={t('builder.sectionHeader.renameSection')}
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {!section.isDefault && (
                <span className="shrink-0 border border-black/15 bg-black/[0.03] px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-black/45">
                  {t('builder.sectionHeader.customTag')}
                </span>
              )}
              {isHidden && (
                <span className="shrink-0 border border-black/20 px-1 py-0.5 font-mono text-[9px] uppercase tracking-wider text-black/50">
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
            className="inline-flex shrink-0 items-center gap-0.5 font-mono text-[10px] uppercase tracking-wide text-black/45 underline decoration-black/15 underline-offset-2 hover:text-black"
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
            className="h-7 w-7 shrink-0 border border-black/15 bg-white/95 text-black/45 opacity-0 shadow-sm transition-opacity hover:border-red-600/30 hover:bg-red-50/90 hover:text-red-700 group-hover/section:opacity-100 group-focus-within/section:opacity-100"
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
