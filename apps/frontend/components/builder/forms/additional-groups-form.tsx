'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { SkillGroup, SkillsSection } from '@/components/dashboard/resume-component';
import {
  newSkillGroupId,
  normalizeAdditionalGroups,
  normalizeAdditionalInfo,
} from '@/lib/utils/additional-groups';
import { useTranslations } from '@/lib/i18n';
import {
  DndContext,
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
import { SkillGroupValuesDnd } from '../skill-group-values-dnd';
import { BuilderFormField } from '../builder-form-field';
import { DRAG_ACTIVATION_LIST_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';

/** Split pasted or typed draft text into individual skill tags (comma, semicolon, or line break). */
function parseSkillDraftTokens(raw: string): string[] {
  return raw
    .split(/[,;\n\r]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

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

export const AdditionalGroupsForm: React.FC<AdditionalGroupsFormProps> = ({
  data,
  onChange,
  hideFooterAdd = false,
}) => {
  const { t } = useTranslations();
  const listDndId = React.useId();
  const groups = React.useMemo(() => normalizeAdditionalGroups(data), [data]);
  const [draftByGroupId, setDraftByGroupId] = React.useState<Record<string, string>>({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_LIST_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleLabelChange = (groupId: string, label: string) => {
    updateGroups(
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              label,
            }
          : group
      ),
      onChange
    );
  };

  const handleItemsReplace = (groupId: string, values: string[]) => {
    updateGroups(
      groups.map((group) =>
        group.id === groupId
          ? {
              ...group,
              values,
            }
          : group
      ),
      onChange
    );
  };

  const handleRemoveValue = (groupId: string, valueIndex: number) => {
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const next = [...(g.values || [])];
    next.splice(valueIndex, 1);
    handleItemsReplace(groupId, next);
  };

  const handleAddDraft = (groupId: string) => {
    const raw = (draftByGroupId[groupId] ?? '').trim();
    if (!raw) return;
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const tokens = parseSkillDraftTokens(raw);
    if (tokens.length === 0) return;
    const next = [...(g.values || []), ...tokens];
    handleItemsReplace(groupId, next);
    setDraftByGroupId((d) => ({ ...d, [groupId]: '' }));
  };

  const handleDraftPaste = (groupId: string, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData?.getData('text/plain') ?? '';
    const fromClipboard = parseSkillDraftTokens(pasted);
    if (fromClipboard.length < 2) {
      return;
    }
    e.preventDefault();
    const el = e.currentTarget;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;
    const cur = draftByGroupId[groupId] ?? '';
    const merged = cur.slice(0, start) + pasted + cur.slice(end);
    const allTokens = parseSkillDraftTokens(merged);
    if (allTokens.length === 0) {
      return;
    }
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const next = [...(g.values || []), ...allTokens];
    handleItemsReplace(groupId, next);
    setDraftByGroupId((d) => ({ ...d, [groupId]: '' }));
  };

  const handleRemove = (groupId: string) => {
    updateGroups(
      groups.filter((g) => g.id !== groupId),
      onChange
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= groups.length || newIndex >= groups.length) {
      return;
    }
    updateGroups(arrayMove(groups, oldIndex, newIndex), onChange);
  };

  const handleReorderValues = (groupId: string, from: number, to: number) => {
    if (from === to) return;
    const g = groups.find((x) => x.id === groupId);
    if (!g) return;
    const next = arrayMove([...(g.values || [])], from, to);
    handleItemsReplace(groupId, next);
  };

  return (
    <div className="space-y-2">
      <DndContext
        id={listDndId}
        sensors={sensors}
        collisionDetection={resumeSortableCollision}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {groups.map((group) => {
              const values = group.values ?? [];

              return (
                <DraggableListItem key={group.id} id={group.id}>
                  <div className="group/skill entry-card-editor relative">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(group.id)}
                      aria-label={t('builder.additionalForm.removeGroup')}
                      className="absolute right-1 top-1 z-10 h-7 w-7 border border-border bg-card/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-red-600/30 hover:bg-red-50/90 hover:text-red-700 group-hover/skill:opacity-100 group-focus-within/skill:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>

                    <div className="mb-2 flex flex-wrap items-end gap-2 border-b border-border pb-2 pr-8">
                      <BuilderFormField
                        label={t('builder.additionalForm.groupLabel')}
                        className="min-w-0 flex-1"
                      >
                        <Input
                          pasteMode="plainTextSingleParagraph"
                          value={group.label}
                          onChange={(event) => handleLabelChange(group.id, event.target.value)}
                          placeholder={t('builder.additionalForm.groupLabelPlaceholder')}
                          className="builder-field-input w-full"
                        />
                      </BuilderFormField>
                    </div>

                    <div className="space-y-1">
                      <div className="mb-0.5 flex items-baseline justify-between gap-2">
                        <span className="builder-field-label">
                          {t('builder.additionalForm.groupValues')}
                        </span>
                        <span className="builder-form-hint max-w-[min(100%,14rem)] text-right">
                          {t('builder.additionalForm.valuesReorderHint')}
                        </span>
                      </div>
                      <SkillGroupValuesDnd
                        scopeId={group.id}
                        values={values}
                        onReorder={(from, to) => handleReorderValues(group.id, from, to)}
                        onRemove={(vi) => handleRemoveValue(group.id, vi)}
                        removeAriaLabel={t('common.delete')}
                        gripTitle={t('builder.additionalForm.reorderGripTitle')}
                      />
                      <input
                        type="text"
                        value={draftByGroupId[group.id] ?? ''}
                        onChange={(e) =>
                          setDraftByGroupId((d) => ({ ...d, [group.id]: e.target.value }))
                        }
                        onPaste={(e) => handleDraftPaste(group.id, e)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddDraft(group.id);
                          }
                        }}
                        placeholder={t('builder.additionalForm.addValuePlaceholder')}
                        className="builder-field-input w-full min-w-0 font-mono"
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
        <div className="border border-dashed border-border bg-card px-2 py-3 text-center">
          <p className="builder-form-hint">{t('builder.additionalForm.emptyState')}</p>
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
                  id: newSkillGroupId(),
                  label: t('builder.additionalForm.newGroupLabel'),
                  values: [],
                },
              ],
              onChange
            );
          }}
          className="builder-field-caption inline-flex items-center underline decoration-black/20 underline-offset-2 hover:text-foreground"
        >
          <Plus className="mr-0.5 inline h-3 w-3 align-middle" />
          {t('builder.additionalForm.addGroup')}
        </button>
      ) : null}
    </div>
  );
};

export default AdditionalGroupsForm;
