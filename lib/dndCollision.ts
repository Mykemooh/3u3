import { closestCenter, pointerWithin, rectIntersection, type CollisionDetection } from '@dnd-kit/core';

/**
 * Drop target for the team and schedule boards: whatever's under the
 * pointer; failing that (keyboard drags have no pointer), the target the
 * card overlaps most; failing that, the nearest one.
 */
export const boardCollision: CollisionDetection = (args) => {
  const underPointer = pointerWithin(args);
  if (underPointer.length) return underPointer;
  const overlapping = rectIntersection(args);
  return overlapping.length ? overlapping : closestCenter(args);
};
