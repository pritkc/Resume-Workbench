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
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useHighlightRowIds } from '@/hooks/use-highlight-row-ids';
import { DRAG_ACTIVATION_NESTED_PX, resumeSortableCollision } from '@/lib/builder/drag-settings';
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

  if (highlights.length === 0) {
    return null;
  }

  return (
    <DndContext
      id={`highlight-dnd-${scopeId}-${instanceId}`}
      sensors={sensors}
      collisionDetection={resumeSortableCollision}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="resume-canvas-bullets">
          {highlights.map((highlight, idx) => (
            <SortableHighlightRow key={rowIds[idx] ?? idx} id={rowIds[idx]!}>
              <div className="resume-canvas-bullet-row group/hl">
                <RichTextEditor
                  value={highlight}
                  onChange={(html) => onChangeLine(idx, html)}
                  placeholder={placeholder}
                  minHeight="24px"
                  toolbarMode="none"
                  surface="inline"
                  className="min-w-0 flex-1 [&_.ProseMirror]:pr-7"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={deleteAriaLabel}
                  onClick={() => onRemoveLine(idx)}
                  className="absolute right-0 top-0 z-10 h-6 w-6 text-muted-foreground opacity-0 hover:text-red-600 group-hover/hl:opacity-100 group-focus-within/hl:opacity-100"
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
