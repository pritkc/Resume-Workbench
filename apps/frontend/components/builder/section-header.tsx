'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronUp, ChevronDown, Trash2, Eye, EyeOff, Pencil, Check, X } from 'lucide-react';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface SectionHeaderProps {
  section: SectionMeta;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  children?: React.ReactNode;
}

/**
 * SectionHeader Component
 *
 * Provides controls for section management:
 * - Editable display name
 * - Move up/down buttons for reordering
 * - Delete button with confirmation
 * - Visibility toggle
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  section,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  isFirst,
  isLast,
  canDelete,
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
      // For default sections, just toggle visibility
      onToggleVisibility();
    } else {
      // For custom sections, show confirmation
      setShowDeleteConfirm(true);
    }
  };

  const isPersonalInfo = section.id === 'personalInfo';
  const isHidden = !section.isVisible;

  return (
    <div
      className={`space-y-0 border bg-white px-2.5 py-2 ${
        isHidden ? 'border-dashed border-gray-300 opacity-60' : 'border-black/15'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between border-b border-black/10 pb-1">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 w-48 rounded-none border-black font-serif text-base font-bold"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.save')}
                className="text-green-700 hover:bg-green-50 hover:text-green-800"
                onClick={handleSaveEdit}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t('common.cancel')}
                className="text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                onClick={handleCancelEdit}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h3 className="font-serif text-[15px] font-bold leading-snug text-gray-900">
                {section.displayName}
              </h3>
              {!isPersonalInfo && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('builder.sectionHeader.renameSection')}
                  className="text-gray-400 hover:text-gray-600"
                  onClick={handleStartEdit}
                  title={t('builder.sectionHeader.renameSection')}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
              {!section.isDefault && (
                <span className="border border-gray-200 bg-gray-100 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-gray-400">
                  {t('builder.sectionHeader.customTag')}
                </span>
              )}
              {isHidden && (
                <span className="border border-orange-500 bg-white px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-orange-600">
                  {t('builder.sectionHeader.hiddenFromPdfTag')}
                </span>
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
              className={section.isVisible ? 'text-gray-500' : 'text-gray-300'}
              onClick={onToggleVisibility}
              title={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
            >
              {section.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          )}

          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('builder.sectionHeader.moveUp')}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
              onClick={onMoveUp}
              disabled={isFirst}
              title={t('builder.sectionHeader.moveUp')}
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}

          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('builder.sectionHeader.moveDown')}
              className="text-gray-500 hover:text-gray-700 disabled:opacity-30"
              onClick={onMoveDown}
              disabled={isLast}
              title={t('builder.sectionHeader.moveDown')}
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          )}

          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('builder.sectionHeader.deleteSection')}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={handleDeleteClick}
              title={
                section.isDefault
                  ? section.isVisible
                    ? t('builder.sectionHeader.hideSection')
                    : t('builder.sectionHeader.showSection')
                  : t('builder.sectionHeader.deleteSection')
              }
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Section Content */}
      {children}

      {/* Delete Confirmation Dialog */}
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
