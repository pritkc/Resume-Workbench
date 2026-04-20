'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { SORTABLE_EASING, SORTABLE_TRANSITION_MS } from '@/lib/builder/drag-settings';

interface DraggableSectionWrapperProps {
  id: string;
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * DraggableSectionWrapper Component
 *
 * Wraps resume sections to make them draggable using @dnd-kit.
 * Provides:
 * - Drag handle (grip icon) for initiating drag operations
 * - Visual feedback during drag (opacity, cursor)
 * - Keyboard accessibility for drag operations
 * - Swiss International Style aesthetic (square corners, high contrast)
 */
export const DraggableSectionWrapper: React.FC<DraggableSectionWrapperProps> = ({
  id,
  children,
  disabled = false,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
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
      id={disabled ? undefined : `cv-section-${id}`}
      className="relative scroll-mt-[4.5rem]"
    >
      {/* Drag Handle */}
      {!disabled && (
        <div
          {...attributes}
          {...listeners}
          className="absolute left-0 top-0 z-10 flex h-full w-3 touch-none items-start justify-center pt-2 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical className="h-4 w-4 text-black/40 transition-colors hover:text-black/70" />
        </div>
      )}

      {/* Section Content - add left padding to make room for drag handle */}
      <div className={!disabled ? 'pl-3' : ''}>{children}</div>
    </div>
  );
};
