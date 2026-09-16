import { describe, expect, it } from 'vitest';
import { activeSuit, applyAction, stateInvariantViolations } from '../src/index.js';
import { completeOpening, face, makeGame, passWithDiscard } from './fixtures.js';

describe('destructive effects and disband', () => {
  it('recomputes direction when a Jack removes an internal card', () => {
    let state = completeOpening(
      makeGame([face(10), face(6), face(7), face(8), face(5), face('JACK'), face(2), face(3)], []),
    );
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-3', route: 0 }).state;
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-4', route: 0 }).state;
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-5',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-3',
    }).state;
    expect(state.players.A.routes[0].cards.map((node) => node.cardId)).toEqual(['A-0', 'A-4']);
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('reapplies terminal Queen control when a Queen-bearing internal card is exposed', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5, 'CLUBS'),
          face(6),
          face(7),
          face(8, 'HEARTS'),
          face('QUEEN', 'DIAMONDS'),
          face(6, 'SPADES'),
          face('JACK'),
          face(2),
        ],
        [],
      ),
    );
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-3', route: 0 }).state;
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-4',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-3',
    }).state;
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-5', route: 0 }).state;
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    expect(activeSuit(state.players.A.routes[0], state.cards.byId)).toBe('SPADES');
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-6',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-5',
    }).state;
    expect(state.players.A.routes[0].cards.map((node) => node.cardId)).toEqual(['A-0', 'A-3']);
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    expect(activeSuit(state.players.A.routes[0], state.cards.byId)).toBe('DIAMONDS');
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('preserves effective direction when removal leaves equal terminal ranks', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5, 'CLUBS'),
          face(6),
          face(7),
          face(7, 'HEARTS'),
          face(5, 'HEARTS'),
          face('JACK'),
          face(2),
          face(3),
        ],
        [],
      ),
    );
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-3', route: 0 }).state;
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-4', route: 0 }).state;
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-5',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-3',
    }).state;
    expect(state.players.A.routes[0].cards.map((node) => node.cardId)).toEqual(['A-0', 'A-4']);
    expect(state.players.A.routes[0].direction).toBe('DESCENDING');
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('disbands a route and sends cross-owned modifiers to their original owners', () => {
    let state = completeOpening(
      makeGame([face(5), face(6), face(7), face('KING'), face(8), face(9), face(10), face(2)], []),
    );
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-3',
      targetPlayer: 'B',
      route: 0,
      targetCardId: 'B-0',
    }).state;
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'DISCARD_HAND_CARD',
      cardId: state.players.A.hand[0]!,
    }).state;
    state = applyAction(state, 'B', { type: 'DISBAND_ROUTE', route: 0 }).state;
    expect(state.players.B.routes[0].cards).toEqual([]);
    expect(state.players.A.discardPile).toContain('A-3');
    expect(state.players.B.discardPile).toContain('B-0');
  });
});
