import { describe, expect, it } from 'vitest';
import {
  applyAction,
  assertGameState,
  projectForPlayer,
  type CaravanGameState,
} from '../src/index.js';
import { completeOpening, exhaustDrawPile, face, makeGame } from './fixtures.js';

describe('results and hidden-information projection', () => {
  it('loses by deck exhaustion when a required replacement draw is unavailable', () => {
    let state = completeOpening(makeGame());
    state = exhaustDrawPile(state, 'A');
    assertGameState(state);
    const cardId = state.players.A.hand[0]!;
    state = applyAction(state, 'A', { type: 'DISCARD_HAND_CARD', cardId }).state;
    expect(state.phase).toBe('FINISHED');
    expect(state.result).toEqual({ winner: 'B', reason: 'DECK_EXHAUSTION', exhaustedPlayer: 'A' });
  });

  it('never exposes opponent hand identities or either future draw order', () => {
    const state = completeOpening(
      makeGame(
        [
          face(3),
          face(4),
          face(5),
          face('KING'),
          face('QUEEN'),
          face('JACK'),
          face('JOKER'),
          face(9),
        ],
        [face(6), face(7), face(8), face(2), face(3), face(4), face(5), face(9)],
      ),
    );
    const viewA = projectForPlayer(state, 'A');
    const serialized = JSON.stringify(viewA);
    for (const hiddenId of [
      ...state.players.B.hand,
      ...state.players.A.drawPile,
      ...state.players.B.drawPile,
    ]) {
      expect(serialized).not.toContain(`\"${hiddenId}\"`);
    }
    for (const ownHandId of state.players.A.hand) expect(serialized).toContain(`\"${ownHandId}\"`);
    expect(viewA.players.B.handSize).toBe(state.players.B.hand.length);
    expect(viewA.players.B.remainingDeckCount).toBe(state.players.B.drawPile.length);
  });

  it('does not mutate the input state while applying an action', () => {
    const state = completeOpening(makeGame());
    const snapshot = JSON.stringify(state);
    const action = { type: 'DISCARD_HAND_CARD', cardId: state.players.A.hand[0]! } as const;
    const next = applyAction(state, 'A', action).state;
    expect(JSON.stringify(state)).toBe(snapshot);
    expect(next).not.toBe(state);
  });
});

describe('normal route victory', () => {
  function winningSetup(): CaravanGameState {
    return completeOpening(
      makeGame(
        [
          face(10, 'CLUBS'),
          face(10, 'DIAMONDS'),
          face(10, 'HEARTS'),
          face('KING', 'SPADES'),
          face('ACE', 'CLUBS'),
          face('KING', 'HEARTS'),
          face('ACE', 'DIAMONDS'),
          face('KING', 'CLUBS'),
          face('ACE', 'SPADES'),
        ],
        [face(2), face(3), face(4), face(5), face(6), face(7), face(8), face(9)],
      ),
    );
  }

  function passB(state: CaravanGameState): CaravanGameState {
    const cardId = state.players.B.hand[0]!;
    return applyAction(state, 'B', { type: 'DISCARD_HAND_CARD', cardId }).state;
  }

  function advanceToFinalWinningCard(): CaravanGameState {
    let state = winningSetup();
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-3',
      targetPlayer: 'A',
      route: 0,
      targetCardId: 'A-0',
    }).state;
    state = passB(state);
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-4', route: 0 }).state;
    state = passB(state);
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-5',
      targetPlayer: 'A',
      route: 1,
      targetCardId: 'A-1',
    }).state;
    state = passB(state);
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-6', route: 1 }).state;
    state = passB(state);
    state = applyAction(state, 'A', {
      type: 'PLAY_MODIFIER_CARD',
      cardId: 'A-7',
      targetPlayer: 'A',
      route: 2,
      targetCardId: 'A-2',
    }).state;
    state = passB(state);
    return state;
  }

  it('finishes only after all three lanes have non-tied owners', () => {
    let state = advanceToFinalWinningCard();
    expect(state.phase).toBe('PLAYING');
    expect(state.activePlayer).toBe('A');
    expect(state.players.A.hand).toContain('A-8');
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-8', route: 2 }).state;
    expect(state.phase).toBe('FINISHED');
    expect(state.result).toEqual({ winner: 'A', reason: 'ROUTES' });
  });

  it('gives a board victory precedence when the winning action cannot draw a replacement', () => {
    let state = advanceToFinalWinningCard();
    state = exhaustDrawPile(state, 'A');
    assertGameState(state);
    state = applyAction(state, 'A', { type: 'PLAY_VALUE_CARD', cardId: 'A-8', route: 2 }).state;
    expect(state.result).toEqual({ winner: 'A', reason: 'ROUTES' });
  });
});
