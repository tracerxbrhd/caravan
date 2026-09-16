import { describe, expect, it } from 'vitest';
import { applyAction, legalActions } from '../src/index.js';
import { completeOpening, face, makeGame, passWithDiscard } from './fixtures.js';

describe('opening and value-card placement', () => {
  it('alternates six setup placements and returns the first normal turn to the starter', () => {
    const initial = makeGame([], [], 'B');
    const state = completeOpening(initial);
    expect(state.phase).toBe('PLAYING');
    expect(state.activePlayer).toBe('B');
    expect(state.openingPlacements).toEqual({ A: 3, B: 3 });
    expect(state.players.A.hand).toHaveLength(5);
    expect(state.players.B.hand).toHaveLength(5);
    expect(state.actionSequence).toBe(6);
  });

  it('forbids discard, disband and modifiers during opening', () => {
    const state = makeGame(
      [face(3), face(4), face(5), face('KING'), face(6), face(7), face(8), face(9)],
      [],
    );
    expect(() =>
      applyAction(state, 'A', { type: 'DISCARD_HAND_CARD', cardId: 'A-0' }),
    ).toThrowError(expect.objectContaining({ code: 'WRONG_PHASE' }));
    expect(() => applyAction(state, 'A', { type: 'DISBAND_ROUTE', route: 0 })).toThrowError(
      expect.objectContaining({ code: 'WRONG_PHASE' }),
    );
    expect(() =>
      applyAction(state, 'A', {
        type: 'PLAY_MODIFIER_CARD',
        cardId: 'A-3',
        targetPlayer: 'A',
        route: 0,
        targetCardId: 'A-0',
      }),
    ).toThrowError(expect.objectContaining({ code: 'WRONG_PHASE' }));
  });

  it('establishes direction, rejects equal adjacent ranks, and allows same-suit reversal', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5, 'CLUBS'),
          face(6),
          face(7),
          face(9, 'HEARTS'),
          face(4, 'HEARTS'),
          face(4, 'HEARTS'),
          face(3),
          face(2),
        ],
        [],
      ),
    );

    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-3', route: 0 }).state;
    expect(state.players.A.routes[0].direction).toBe('ASCENDING');
    state = passWithDiscard(state, 'B');

    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-4', route: 0 }).state;
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    state = passWithDiscard(state, 'B');

    expect(() =>
      applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-5', route: 0 }),
    ).toThrowError(expect.objectContaining({ code: 'ILLEGAL_VALUE_PLAY' }));
    expect(legalActions(state, 'A')).not.toContainEqual({
      type: 'PLAY_VALUE_CARD',
      cardId: 'A-5',
      route: 0,
    });
  });
});
