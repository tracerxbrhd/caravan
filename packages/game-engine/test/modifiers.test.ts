import { describe, expect, it } from 'vitest';
import { activeSuit, applyAction, routeValue, stateInvariantViolations } from '../src/index.js';
import { completeOpening, face, makeGame, passWithDiscard } from './fixtures.js';

describe('modifier cards', () => {
  it('stacks Kings multiplicatively', () => {
    let state = completeOpening(
      makeGame(
        [face(5), face(6), face(7), face('KING'), face('KING'), face(8), face(9), face(10)],
        [],
      ),
    );
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-3',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-0',
    }).state;
    expect(routeValue(state.players.A.routes[0], state.cards.byId)).toBe(10);
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-4',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-0',
    }).state;
    expect(routeValue(state.players.A.routes[0], state.cards.byId)).toBe(20);
  });

  it('reverses direction with Queen and uses the newest Queen suit', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5, 'CLUBS'),
          face(6),
          face(7),
          face(9, 'SPADES'),
          face('QUEEN', 'HEARTS'),
          face('QUEEN', 'DIAMONDS'),
          face(2),
          face(3),
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
    expect(activeSuit(state.players.A.routes[0], state.cards.byId)).toBe('HEARTS');
    state = passWithDiscard(state, 'B');
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-5',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-3',
    }).state;
    expect(state.players.A.routes[0].direction).toBe('ASCENDING');
    expect(activeSuit(state.players.A.routes[0], state.cards.byId)).toBe('DIAMONDS');
  });

  it('rejects Queen on a non-terminal value card', () => {
    let state = completeOpening(
      makeGame([face(5), face(6), face(7), face(9), face('QUEEN'), face(8), face(2), face(3)], []),
    );
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-3', route: 0 }).state;
    state = passWithDiscard(state, 'B');
    expect(() =>
      applyAction(state, 'A', {
        type: 'PLAY_MODIFIER_CARD',
        cardId: 'A-4',
        targetPlayer: 'A',
        route: 0,
        targetCardId: 'A-0',
      }),
    ).toThrowError(expect.objectContaining({ code: 'QUEEN_REQUIRES_TERMINAL' }));
  });

  it('routes Jack removals to original owners even across opposing routes', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5),
          face(6),
          face(7),
          face('KING', 'HEARTS'),
          face('JACK', 'SPADES'),
          face(8),
          face(9),
          face(10),
        ],
        [face(4), face(8), face(10), face(2), face(3), face(4), face(5), face(6)],
      ),
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
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-4',
      targetPlayer: 'B',
      route: 0,
      targetCardId: 'B-0',
    }).state;

    expect(state.players.B.routes[0].cards).toEqual([]);
    expect(state.players.A.discardPile).toEqual(expect.arrayContaining(['A-3', 'A-4']));
    expect(state.players.B.discardPile).toContain('B-0');
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('resolves Joker-on-Ace globally by printed suit and protects the target', () => {
    let state = completeOpening(
      makeGame(
        [
          face('ACE', 'CLUBS'),
          face(6, 'CLUBS'),
          face(7, 'HEARTS'),
          face('JOKER'),
          face(8),
          face(9),
          face(10),
          face(2),
        ],
        [
          face(4, 'CLUBS'),
          face(8, 'DIAMONDS'),
          face(10, 'CLUBS'),
          face(2),
          face(3),
          face(4),
          face(5),
          face(6),
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
    expect(state.players.A.routes[1].cards).toEqual([]);
    expect(state.players.B.routes[0].cards).toEqual([]);
    expect(state.players.B.routes[2].cards).toEqual([]);
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('enforces the three-modifier attachment limit', () => {
    let state = completeOpening(
      makeGame(
        [
          face(5),
          face(6),
          face(7),
          face('KING'),
          face('KING'),
          face('KING'),
          face('KING'),
          face(8),
        ],
        [],
      ),
    );
    for (const cardId of ['A-3', 'A-4', 'A-5']) {
      state = applyAction(state, 'A', {
        type: 'PLAY_MODIFIER_CARD',
        cardId,
        targetPlayer: 'A',
        route: 0,
        targetCardId: 'A-0',
      }).state;
      state = passWithDiscard(state, 'B');
    }
    expect(() =>
      applyAction(state, 'A', {
        type: 'PLAY_MODIFIER_CARD',
        cardId: 'A-6',
        targetPlayer: 'A',
        route: 0,
        targetCardId: 'A-0',
      }),
    ).toThrowError(expect.objectContaining({ code: 'MODIFIER_LIMIT_REACHED' }));
  });
});
