export type HandGesture =
  | { readonly kind: 'TAP' }
  | { readonly kind: 'SWIPE'; readonly step: -1 | 1 }
  | { readonly kind: 'DRAG' }
  | { readonly kind: 'CANCEL' };

export const HAND_TAP_SLOP_PX = 10;
export const HAND_SWIPE_THRESHOLD_PX = 34;
export const HAND_DRAG_THRESHOLD_PX = 28;

export function wrapHandIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  return ((index % count) + count) % count;
}

export function stepHandIndex(index: number, step: -1 | 1, count: number): number {
  return wrapHandIndex(index + step, count);
}

export function cyclicHandOffset(index: number, activeIndex: number, count: number): number {
  if (count <= 1) return 0;

  const forward = wrapHandIndex(index - activeIndex, count);
  const backward = forward - count;
  return Math.abs(backward) < Math.abs(forward) ? backward : forward;
}

export function classifyHandGesture(deltaX: number, deltaY: number, canDrag: boolean): HandGesture {
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (canDrag && deltaY <= -HAND_DRAG_THRESHOLD_PX && absY > absX * 0.8) {
    return { kind: 'DRAG' };
  }

  if (absX >= HAND_SWIPE_THRESHOLD_PX && absX > absY) {
    return { kind: 'SWIPE', step: deltaX < 0 ? 1 : -1 };
  }

  if (absX <= HAND_TAP_SLOP_PX && absY <= HAND_TAP_SLOP_PX) {
    return { kind: 'TAP' };
  }

  return { kind: 'CANCEL' };
}
