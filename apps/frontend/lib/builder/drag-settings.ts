import { closestCorners } from '@dnd-kit/core';

/** Pointer must move this far before a drag starts — avoids accidental drags. */
export const DRAG_ACTIVATION_SECTION_PX = 12;
export const DRAG_ACTIVATION_LIST_PX = 10;
export const DRAG_ACTIVATION_NESTED_PX = 10;

/** Vertical sortables feel less “jumpy” than closestCenter on tall cards. */
export const resumeSortableCollision = closestCorners;

/** Easing for item transforms when not actively dragging (dnd-kit default can feel abrupt). */
export const SORTABLE_TRANSITION_MS = 220;
export const SORTABLE_EASING = 'cubic-bezier(0.25, 0.8, 0.25, 1)';
