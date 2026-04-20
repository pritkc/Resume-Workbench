'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { SkillGroup, SkillsSection } from '@/components/dashboard/resume-component';
import {
  getAdditionalGroupDisplayLabel,
  normalizeAdditionalGroups,
  normalizeAdditionalInfo,
} from '@/lib/utils/additional-groups';
import { useTranslations } from '@/lib/i18n';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { DraggableListItem } from '../draggable-list-item';

interface AdditionalGroupsFormProps {
  data: SkillsSection;
  onChange: (data: SkillsSection) => void;
  /** When true, hide the footer “add group” link (e.g. header add is used). */
  hideFooterAdd?: boolean;
}

function updateGroups(groups: SkillGroup[], onChange: (data: SkillsSection) => void): void {
  onChange(
    normalizeAdditionalInfo(
      {
        groups,
      },
      { seedDefaultsIfEmpty: false }
    )
  );
}

const chipClass =
  'group inline-flex h-5 max-w-full items-center gap-0.5 border border-black/30 bg-white px-1.5 font-mono text-[11px] text-black hover:border-black';

export const AdditionalGroupsForm: React.FC<AdditionalGroupsFormProps> = ({
  data,
  onChange,
  hideFooterAdd = false,
}) => {
  const { t } = useTranslations();
  const groups = React.useMemo(() => normalizeAdditionalGroups(data), [data]);
  const [draftByIndex, setDraftByIndex] = React.useState<Record<number, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleLabelChange = (index: number, label: string) => {
    updateGroups(
      groups.map((group, currentIndex) =>
        currentIndex === index
          ? {
              ...group,
              label,
            }
          : group
      ),
      onChange
    );
  };

  const handleItemsReplace = (index: number, values: string[]) => {
    updateGroups(
      groups.map((group, currentIndex) =>
        currentIndex === index
          ? {
              ...group,
              values,
            }
          : group
      ),
      onChange
    );
  };

  const handleRemoveValue = (groupIndex: number, valueIndex: number) => {
    const g = groups[groupIndex];
    if (!g) return;
    const next = [...(g.values || [])];
    next.splice(valueIndex, 1);
    handleItemsReplace(groupIndex, next);
  };

  const handleAddDraft = (groupIndex: number) => {
    const raw = (draftByIndex[groupIndex] ?? '').trim();
    if (!raw) return;
    const g = groups[groupIndex];
    if (!g) return;
    const next = [...(g.values || []), raw];
    handleItemsReplace(groupIndex, next);
    setDraftByIndex((d) => ({ ...d, [groupIndex]: '' }));
  };

  const handleRemove = (index: number) => {
    updateGroups(
      groups.filter((_, currentIndex) => currentIndex !== index),
      onChange
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = Number(active.id);
    const newIndex = Number(over.id);
    if (
      Number.isNaN(oldIndex) ||
      Number.isNaN(newIndex) ||
      oldIndex < 0 ||
      newIndex < 0 ||
      oldIndex >= groups.length ||
      newIndex >= groups.length
    ) {
      return;
    }
    updateGroups(arrayMove(groups, oldIndex, newIndex), onChange);
  };

  return (
    <div className="space-y-2">
      <p className="font-sans text-[11px] leading-snug text-black/40">
        {t('builder.additionalForm.instructions')}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={groups.map((_, index) => index)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {groups.map((group, index) => {
              const displayLabel = getAdditionalGroupDisplayLabel(group, t);
              const values = group.values ?? [];

              return (
                <DraggableListItem key={`${index}-${displayLabel}`} id={index}>
                  <div className="group/skill entry-card-editor relative border border-black/20 bg-white">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(index)}
                      aria-label={t('builder.additionalForm.removeGroup')}
                      className="absolute right-1 top-1 z-10 h-7 w-7 border border-black/15 bg-white/95 text-black/45 opacity-0 shadow-sm transition-opacity hover:border-red-600/30 hover:bg-red-50/90 hover:text-red-700 group-hover/skill:opacity-100 group-focus-within/skill:opacity-100"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>

                    <div className="mb-2 flex flex-wrap items-end gap-2 border-b border-black/10 pb-2 pr-8">
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-black/50">
                          {t('builder.additionalForm.groupLabel')}
                        </span>
                        <Input
                          value={displayLabel}
                          onChange={(event) => handleLabelChange(index, event.target.value)}
                          placeholder={t('builder.additionalForm.groupLabelPlaceholder')}
                          className="mt-0.5 h-7 rounded-none border border-black/30 bg-white px-2 text-sm focus-visible:border-black focus-visible:ring-0"
                        />
                      </div>
                    </div>

                    <div className="flex min-h-[28px] flex-wrap items-center gap-1">
                      {values.map((val, vi) => (
                        <span key={`${val}-${vi}`} className={chipClass}>
                          <span className="max-w-[200px] truncate">{val}</span>
                          <button
                            type="button"
                            className="ml-0.5 text-black/30 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                            aria-label={t('common.delete')}
                            onClick={() => handleRemoveValue(index, vi)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ))}
                      <input
                        type="text"
                        value={draftByIndex[index] ?? ''}
                        onChange={(e) => setDraftByIndex((d) => ({ ...d, [index]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDraft(index);
                          }
                        }}
                        placeholder="+ tag"
                        className="h-5 min-w-[4rem] flex-1 rounded-none border-0 border-b border-dashed border-black/20 bg-transparent px-1 font-mono text-[11px] placeholder:text-black/30 focus:border-black focus:outline-none sm:max-w-[140px] sm:flex-none"
                      />
                    </div>
                  </div>
                </DraggableListItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {groups.length === 0 && (
        <div className="border border-dashed border-black/25 bg-white px-2 py-3 text-center">
          <p className="font-mono text-[11px] text-black/50">{t('builder.additionalForm.emptyState')}</p>
        </div>
      )}

      {!hideFooterAdd ? (
        <button
          type="button"
          onClick={() => {
            updateGroups(
              [
                ...groups,
                {
                  label: t('builder.additionalForm.newGroupLabel'),
                  values: [],
                },
              ],
              onChange
            );
          }}
          className="font-mono text-[11px] uppercase tracking-wide text-black/50 underline decoration-black/20 underline-offset-2 hover:text-black"
        >
          <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
          {t('builder.additionalForm.addGroup')}
        </button>
      ) : null}
    </div>
  );
};

export default AdditionalGroupsForm;
