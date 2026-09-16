import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  applyAction,
  isLegalAction,
  legalActions,
  projectForPlayer,
  stateInvariantViolations,
} from '../src/index.js';
import { face, makeGame } from './fixtures.js';

const propertyDeckA = [
  face(2, 'CLUBS'),
  face(3, 'DIAMONDS'),
  face(4, 'HEARTS'),
  face(5, 'SPADES'),
  face('KING', 'CLUBS'),
  face('QUEEN', 'DIAMONDS'),
  face('JACK', 'HEARTS'),
  face('JOKER'),
];
const propertyDeckB = [
  face(6, 'CLUBS'),
  face(7, 'DIAMONDS'),
  face(8, 'HEARTS'),
  face(9, 'SPADES'),
  face('KING', 'HEARTS'),
  face('QUEEN', 'SPADES'),
  face('JACK', 'CLUBS'),
  face('JOKER'),
];

describe('engine properties', () => {
  it('preserves invariants for arbitrary generated legal action sequences', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 1, maxLength: 80 }), (choices) => {
        let state = makeGame(propertyDeckA, propertyDeckB);
        for (const choice of choices) {
          if (state.phase === 'FINISHED') break;
          const actions = legalActions(state, state.activePlayer);
          expect(actions.length).toBeGreaterThan(0);
          const action = actions[choice % actions.length]!;
          expect(isLegalAction(state, state.activePlayer, action)).toBe(true);
          const previous = JSON.stringify(state);
          const transition = applyAction(state, state.activePlayer, action);
          expect(JSON.stringify(state)).toBe(previous);
          expect(stateInvariantViolations(transition.state)).toEqual([]);
          state = transition.state;
        }
      }),
      { numRuns: 100 },
    );
  });

  it('never projects hidden card ids for either viewer across generated play', () => {
    fc.assert(
      fc.property(fc.array(fc.nat(), { minLength: 0, maxLength: 40 }), (choices) => {
        let state = makeGame(propertyDeckA, propertyDeckB);
        for (const choice of choices) {
          if (state.phase === 'FINISHED') break;
          const actions = legalActions(state, state.activePlayer);
          if (actions.length === 0) break;
          state = applyAction(state, state.activePlayer, actions[choice % actions.length]!).state;
        }
        for (const viewer of ['A', 'B'] as const) {
          const opponent = viewer === 'A' ? 'B' : 'A';
          const serialized = JSON.stringify(projectForPlayer(state, viewer));
          for (const hiddenId of [
            ...state.players[opponent].hand,
            ...state.players.A.drawPile,
            ...state.players.B.drawPile,
          ]) {
            expect(serialized).not.toContain(`\"${hiddenId}\"`);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});
