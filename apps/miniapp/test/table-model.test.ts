import type { WireGameAction } from '@caravan/protocol';
import { describe, expect, it } from 'vitest';
import {
  cardInteraction,
  discardAction,
  disbandAction,
  handDropAction,
  isModifierTarget,
  modifierPlayAction,
  selectableCardIds,
  valuePlayAction,
} from '../src/table-model.js';

const actions: readonly WireGameAction[] = [
  { type: 'PLAY_VALUE_CARD', cardId: 'value-5h', route: 0 },
  { type: 'PLAY_VALUE_CARD', cardId: 'value-5h', route: 2 },
  {
    type: 'PLAY_MODIFIER_CARD',
    cardId: 'king-s',
    targetPlayer: 'A',
    route: 1,
    targetCardId: 'a-route-1-card',
  },
  {
    type: 'PLAY_MODIFIER_CARD',
    cardId: 'king-s',
    targetPlayer: 'B',
    route: 2,
    targetCardId: 'b-route-2-card',
  },
  { type: 'DISCARD_HAND_CARD', cardId: 'king-s' },
  { type: 'DISCARD_HAND_CARD', cardId: 'dead-card' },
  { type: 'DISBAND_ROUTE', route: 1 },
];

describe('card table interaction model', () => {
  it('derives selectable cards and exact legal targets from server actions', () => {
    expect(selectableCardIds(actions)).toEqual(['value-5h', 'king-s', 'dead-card']);

    const value = cardInteraction(actions, 'value-5h');
    expect(value.valueRoutes).toEqual([0, 2]);
    expect(value.modifierTargets).toEqual([]);
    expect(value.canDiscard).toBe(false);

    const modifier = cardInteraction(actions, 'king-s');
    expect(modifier.valueRoutes).toEqual([]);
    expect(modifier.canDiscard).toBe(true);
    expect(modifier.modifierTargets).toEqual([
      { targetPlayer: 'A', route: 1, targetCardId: 'a-route-1-card' },
      { targetPlayer: 'B', route: 2, targetCardId: 'b-route-2-card' },
    ]);
    expect(isModifierTarget(modifier, 'A', 1, 'a-route-1-card')).toBe(true);
    expect(isModifierTarget(modifier, 'B', 1, 'a-route-1-card')).toBe(false);
  });

  it('returns the exact authoritative action for each UI intent', () => {
    expect(valuePlayAction(actions, 'value-5h', 2)).toEqual({
      type: 'PLAY_VALUE_CARD',
      cardId: 'value-5h',
      route: 2,
    });
    expect(modifierPlayAction(actions, 'king-s', 'B', 2, 'b-route-2-card')).toEqual({
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'king-s',
      targetPlayer: 'B',
      route: 2,
      targetCardId: 'b-route-2-card',
    });
    expect(discardAction(actions, 'king-s')).toEqual({
      type: 'DISCARD_HAND_CARD',
      cardId: 'king-s',
    });
    expect(disbandAction(actions, 1)).toEqual({ type: 'DISBAND_ROUTE', route: 1 });
    expect(handDropAction(actions, 'value-5h', { kind: 'ROUTE', route: 2 })).toEqual({
      type: 'PLAY_VALUE_CARD',
      cardId: 'value-5h',
      route: 2,
    });
    expect(
      handDropAction(actions, 'king-s', {
        kind: 'CARD',
        targetPlayer: 'B',
        route: 2,
        targetCardId: 'b-route-2-card',
      }),
    ).toEqual({
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'king-s',
      targetPlayer: 'B',
      route: 2,
      targetCardId: 'b-route-2-card',
    });
  });

  it('fails closed when the requested UI intent is not in legalActions', () => {
    expect(valuePlayAction(actions, 'value-5h', 1)).toBeNull();
    expect(modifierPlayAction(actions, 'king-s', 'B', 0, 'missing')).toBeNull();
    expect(discardAction(actions, 'value-5h')).toBeNull();
    expect(disbandAction(actions, 0)).toBeNull();
    expect(handDropAction(actions, 'value-5h', { kind: 'ROUTE', route: 1 })).toBeNull();
    expect(
      handDropAction(actions, 'king-s', {
        kind: 'CARD',
        targetPlayer: 'A',
        route: 0,
        targetCardId: 'missing',
      }),
    ).toBeNull();
  });
});
