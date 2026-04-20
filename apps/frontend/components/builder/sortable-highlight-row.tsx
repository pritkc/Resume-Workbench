'use client';

import React from 'react';
import type { UniqueIdentifier } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { SORTABLE_EASING, SORTABLE_TRANSITION_MS } from '@/lib/builder/drag-settings';

interface SortableHighlightRowProps {
  id: UniqueIdentifier;
  children: React.ReactNode;
}

export const SortableHighlightRow: React.FC<SortableHighlightRowProps> = ({ id, children }) => {
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
    <div ref={setNodeRef} style={style} className="group/hlrow relative">
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-0.5 top-0 z-[11] flex h-full w-2.5 cursor-grab touch-none items-start justify-center pt-1 opacity-0 transition-opacity active:cursor-grabbing group-hover/hlrow:opacity-100"
        title="Drag to reorder bullet"
      >
        <GripVertical className="h-3.5 w-3.5 text-black/35 transition-colors hover:text-black/65" />
      </div>
      <div className="pl-2">{children}</div>
    </div>
  );
};
