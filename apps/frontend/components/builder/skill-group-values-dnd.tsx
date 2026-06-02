'use client';

import React from 'react';
import { GripVertical, X } from 'lucide-react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useHighlightRowIds } from '@/hooks/use-highlight-row-ids';
import {
  DRAG_ACTIVATION_NESTED_PX,
  resumeSortableCollision,
  SORTABLE_EASING,
  SORTABLE_TRANSITION_MS,
} from '@/lib/builder/drag-settings';

function SortableValueRow({
  id,
  label,
  onRemove,
  removeAriaLabel,
  gripTitle,
}: {
  id: string;
  label: string;
  onRemove: () => void;
  removeAriaLabel: string;
  gripTitle: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    transition: {
      duration: SORTABLE_TRANSITION_MS,
      easing: SORTABLE_EASING,
    },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isDragging ? undefined : transition,
    opacity: isDragging ? 0.55 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/svrow flex min-h-[26px] items-center gap-1 rounded-none border border-border bg-card px-1 py-0.5"
    >
      <div
        {...attributes}
        {...listeners}
        className="flex shrink-0 cursor-grab touch-none items-center justify-center rounded-none px-0.5 py-0.5 text-muted-foreground opacity-70 transition-opacity hover:text-muted-foreground active:cursor-grabbing group-hover/svrow:opacity-100"
        title={gripTitle}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </div>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground">{label}</span>
      <button
        type="button"
        className="shrink-0 text-muted-foreground opacity-70 transition-opacity hover:text-red-600 group-hover/svrow:opacity-100"
        aria-label={removeAriaLabel}
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface SkillGroupValuesDndProps {
  scopeId: string;
  values: string[];
  onReorder: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  removeAriaLabel: string;
  gripTitle: string;
}

/**
 * Nested sortable list for skill tag values (order is preserved in resume / YAML).
 */
export const SkillGroupValuesDnd: React.FC<SkillGroupValuesDndProps> = ({
  scopeId,
  values,
  onReorder,
  onRemove,
  removeAriaLabel,
  gripTitle,
}) => {
  const instanceId = React.useId();
  const [rowIds, reorderRowIds] = useHighlightRowIds(values.length);

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

  if (values.length === 0) {
    return null;
  }

  return (
    <DndContext
      id={`skill-values-${scopeId}-${instanceId}`}
      sensors={sensors}
      collisionDetection={resumeSortableCollision}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
        <div className="flex flex-col gap-1">
          {values.map((val, idx) => (
            <SortableValueRow
              key={rowIds[idx] ?? `${scopeId}-v-${idx}`}
              id={rowIds[idx]!}
              label={val}
              onRemove={() => onRemove(idx)}
              removeAriaLabel={removeAriaLabel}
              gripTitle={gripTitle}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};
