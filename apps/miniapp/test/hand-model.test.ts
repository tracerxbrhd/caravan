import { describe, expect, it } from 'vitest';
import {
  classifyHandGesture,
  cyclicHandOffset,
  stepHandIndex,
  wrapHandIndex,
} from '../src/hand-model.js';

describe('cyclic hand interaction model', () => {
  it('wraps navigation in both directions without duplicating cards', () => {
    expect(wrapHandIndex(0, 5)).toBe(0);
    expect(wrapHandIndex(5, 5)).toBe(0);
    expect(wrapHandIndex(-1, 5)).toBe(4);
    expect(stepHandIndex(4, 1, 5)).toBe(0);
    expect(stepHandIndex(0, -1, 5)).toBe(4);
  });

  it('chooses the shortest visual offset around the cyclic hand', () => {
    expect(cyclicHandOffset(0, 0, 5)).toBe(0);
    expect(cyclicHandOffset(1, 0, 5)).toBe(1);
    expect(cyclicHandOffset(4, 0, 5)).toBe(-1);
    expect(cyclicHandOffset(3, 0, 5)).toBe(-2);
  });

  it('distinguishes tap, horizontal swipe and upward drag', () => {
    expect(classifyHandGesture(4, 5, true)).toEqual({ kind: 'TAP' });
    expect(classifyHandGesture(-50, 8, true)).toEqual({ kind: 'SWIPE', step: 1 });
    expect(classifyHandGesture(52, 6, true)).toEqual({ kind: 'SWIPE', step: -1 });
    expect(classifyHandGesture(8, -48, true)).toEqual({ kind: 'DRAG' });
  });

  it('never turns an upward gesture into a gameplay drag when the card is not draggable', () => {
    expect(classifyHandGesture(6, -52, false)).toEqual({ kind: 'CANCEL' });
  });
});
