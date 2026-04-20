'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface DraggableListItemProps {
  id: number;
  children: React.ReactNode;
}

/**
 * DraggableListItem Component
 *
 * Generic wrapper for list items (experience, education, projects, etc.) to make them draggable using @dnd-kit.
 * Provides:
 * - Drag handle (grip icon) for initiating drag operations
 * - Visual feedback during drag (opacity, cursor)
 * - Keyboard accessibility for drag operations
 * - Swiss International Style aesthetic (square corners, high contrast)
 */
export const DraggableListItem: React.FC<DraggableListItemProps> = ({ id, children }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div
        {...attributes}
        {...listeners}
        className="absolute -left-0.5 top-0 z-10 flex h-full w-2.5 cursor-grab items-start justify-center pt-1 opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-black/40 transition-colors hover:text-black/70" />
      </div>

      <div className="pl-1">{children}</div>
    </div>
  );
};
