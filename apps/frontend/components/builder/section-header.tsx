'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Plus, Trash2, Eye, EyeOff, Pencil, Check, X } from 'lucide-react';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { ResumeCanvasAddLink } from './inline-resume-field';

interface SectionHeaderProps {
  section: SectionMeta;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onToggleVisibility: () => void;
  canDelete: boolean;
  addEntry?: { label: string; onClick: () => void };
  children?: React.ReactNode;
}

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

  const isHidden = !section.isVisible;

  return (
    <div className={cn('group/section', isHidden ? 'opacity-60' : '')}>
      <div className="resume-canvas-section-title relative mb-1 flex items-center gap-2">
        {isEditing ? (
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              pasteMode="plainTextSingleParagraph"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={handleKeyDown}
              className="h-7 max-w-[min(100%,14rem)] rounded-none border border-border bg-card px-2 text-sm focus-visible:border-primary focus-visible:ring-0"
              autoFocus
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('common.save')}
              className="h-7 w-7 shrink-0 border border-border"
              onClick={handleSaveEdit}
            >
              <Check className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('common.cancel')}
              className="h-7 w-7 shrink-0 border border-border"
              onClick={handleCancelEdit}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/80">
              {section.displayName}
            </h3>
            <div className="resume-canvas-section-actions">
              <button
                type="button"
                onClick={onToggleVisibility}
                className="inline-flex items-center gap-0.5 font-sans text-[10px] text-muted-foreground hover:text-foreground"
                aria-label={
                  section.isVisible
                    ? t('builder.sectionHeader.hideSection')
                    : t('builder.sectionHeader.showSection')
                }
              >
                {section.isVisible ? (
                  <Eye className="h-3 w-3" aria-hidden />
                ) : (
                  <EyeOff className="h-3 w-3" aria-hidden />
                )}
                {section.isVisible ? 'hide' : 'show'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditedName(section.displayName);
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-0.5 font-sans text-[10px] text-muted-foreground hover:text-foreground"
                aria-label={t('builder.sectionHeader.renameSection')}
              >
                <Pencil className="h-3 w-3" aria-hidden />
                rename
              </button>
              {addEntry ? (
                <ResumeCanvasAddLink onClick={addEntry.onClick}>
                  <Plus className="h-3 w-3" aria-hidden />
                  {addEntry.label}
                </ResumeCanvasAddLink>
              ) : null}
              {canDelete ? (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="inline-flex items-center gap-0.5 font-sans text-[10px] text-red-600/80 hover:text-red-600"
                  aria-label={t('builder.sectionHeader.deleteSection')}
                >
                  <Trash2 className="h-3 w-3" aria-hidden />
                  {section.isDefault ? (section.isVisible ? 'hide' : 'show') : 'delete'}
                </button>
              ) : null}
            </div>
          </>
        )}
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
