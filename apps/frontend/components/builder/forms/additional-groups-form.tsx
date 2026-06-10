'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
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
import { InlineResumeField, ResumeCanvasAddLink } from '../inline-resume-field';
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
        id="additional-groups-list"
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
                  <div className="group/skill resume-canvas-entry pr-6">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRemove(group.id)}
                      aria-label={t('builder.additionalForm.removeGroup')}
                      className="resume-canvas-entry-actions h-6 w-6 text-red-600/80 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>

                    <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                      <InlineResumeField
                        pasteMode="plainTextSingleParagraph"
                        value={group.label}
                        onChange={(event) => handleLabelChange(group.id, event.target.value)}
                        placeholder={t('builder.additionalForm.groupLabelPlaceholder')}
                        className="resume-canvas-field-title w-auto min-w-[5rem] max-w-[10rem] shrink-0"
                        aria-label={t('builder.additionalForm.groupLabel')}
                      />
                      <span className="pt-1 text-muted-foreground/50">:</span>
                      <div className="min-w-0 flex-1 space-y-1">
                        <SkillGroupValuesDnd
                          scopeId={group.id}
                          values={values}
                          onReorder={(from, to) => handleReorderValues(group.id, from, to)}
                          onRemove={(vi) => handleRemoveValue(group.id, vi)}
                          removeAriaLabel={t('common.delete')}
                          gripTitle={t('builder.additionalForm.reorderGripTitle')}
                        />
                        <InlineResumeField
                          pasteMode="plainTextSingleParagraph"
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
                          fieldSize="small"
                          className="min-w-[8rem]"
                          aria-label={t('builder.additionalForm.groupValues')}
                        />
                      </div>
                    </div>
                  </div>
                </DraggableListItem>
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      {groups.length === 0 && (
        <p className="py-1 text-[11px] text-muted-foreground">
          {t('builder.additionalForm.emptyState')}
        </p>
      )}

      {!hideFooterAdd ? (
        <ResumeCanvasAddLink
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
        >
          <Plus className="inline h-3 w-3" aria-hidden />
          {t('builder.additionalForm.addGroup')}
        </ResumeCanvasAddLink>
      ) : null}
    </div>
  );
};

export default AdditionalGroupsForm;
