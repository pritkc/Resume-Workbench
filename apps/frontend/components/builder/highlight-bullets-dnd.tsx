'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { RichTextEditor } from '@/components/ui/rich-text-editor';
import { Trash2 } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useHighlightRowIds } from '@/hooks/use-highlight-row-ids';
import {
  DRAG_ACTIVATION_NESTED_PX,
  resumeSortableCollision,
} from '@/lib/builder/drag-settings';
import { SortableHighlightRow } from './sortable-highlight-row';

interface HighlightBulletsRichTextDndProps {
  /** Unique among nested DnD contexts (e.g. experience id). */
  scopeId: string;
  highlights: string[];
  onReorder: (from: number, to: number) => void;
  onChangeLine: (index: number, html: string) => void;
  onRemoveLine: (index: number) => void;
  placeholder: string;
  deleteAriaLabel: string;
}

/**
 * Nested sortable list for experience/project bullet rows (RichTextEditor).
 * Uses its own DndContext so job/card drags stay independent.
 */
export const HighlightBulletsRichTextDnd: React.FC<HighlightBulletsRichTextDndProps> = ({
  scopeId,
  highlights,
  onReorder,
  onChangeLine,
  onRemoveLine,
  placeholder,
  deleteAriaLabel,
}) => {
  const instanceId = React.useId();
  const [rowIds, reorderRowIds] = useHighlightRowIds(highlights.length);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: DRAG_ACTIVATION_NESTED_PX } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    reorderRowIds(oldIndex, newIndex);
    onReorder(oldIndex, newIndex);
  };

  return (
    <DndContext
      id={`highlight-dnd-${scopeId}-${instanceId}`}
      sensors={sensors}
      collisionDetection={resumeSortableCollision}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0">
          {highlights.map((highlight, idx) => (
            <SortableHighlightRow key={rowIds[idx] ?? idx} id={rowIds[idx]!}>
              <div className="group/hl relative mb-1.5 last:mb-0">
                <RichTextEditor
                  value={highlight}
                  onChange={(html) => onChangeLine(idx, html)}
                  placeholder={placeholder}
                  minHeight="36px"
                  toolbarMode="none"
                  className="[&_.ProseMirror]:pr-8"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={deleteAriaLabel}
                  onClick={() => onRemoveLine(idx)}
                  className="absolute right-1 top-1 z-10 h-7 w-7 border border-border bg-card/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:border-red-600/30 hover:bg-red-50/90 hover:text-red-700 group-hover/hl:opacity-100 group-focus-within/hl:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </SortableHighlightRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
