import { describe, expect, it } from 'vitest';
import { applyAction, stateInvariantViolations } from '../src/index.js';
import { completeOpening, face, makeGame } from './fixtures.js';

describe('Joker numeric-rank effect', () => {
  it('removes every other matching rank across suits while protecting the target', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5, 'CLUBS'),
          face(6, 'DIAMONDS'),
          face(7, 'HEARTS'),
          face('JOKER'),
          face(8),
          face(9),
          face(10),
          face(2),
        ],
        [
          face(5, 'DIAMONDS'),
          face(8, 'SPADES'),
          face(5, 'HEARTS'),
          face(2),
          face(3),
          face(4),
          face(6),
          face(7),
        ],
      ),
    );

    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-3',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-0',
    }).state;

    expect(state.players.A.routes[0].cards[0]?.cardId).toBe('A-0');
    expect(state.players.A.routes[0].cards[0]?.modifiers[0]?.cardId).toBe('A-3');
    expect(state.players.B.routes[0].cards).toEqual([]);
    expect(state.players.B.routes[1].cards[0]?.cardId).toBe('B-1');
    expect(state.players.B.routes[2].cards).toEqual([]);
    expect(state.players.B.discardPile).toEqual(expect.arrayContaining(['B-0', 'B-2']));
    expect(stateInvariantViolations(state)).toEqual([]);
  });
});
