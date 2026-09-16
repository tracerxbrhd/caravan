import { describe, expect, it } from 'vitest';
import { createGame, legalActions, stateInvariantViolations } from '../src/index.js';
import { face, makeDeck, makeGame } from './fixtures.js';

describe('game initialization and opening', () => {
  it('deals eight cards without mutating injected order and exposes only opening placements', () => {
    const state = makeGame(
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
    );

    expect(state.phase).toBe('OPENING');
    expect(state.activePlayer).toBe('A');
    expect(state.players.A.hand).toEqual(['A-0', 'A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'A-7']);
    expect(state.players.A.drawPile[0]).toBe('A-8');
    expect(legalActions(state, 'B')).toEqual([]);
    expect(legalActions(state, 'A')).toHaveLength(9);
    expect(stateInvariantViolations(state)).toEqual([]);
  });

  it('rejects an accepted opening order without three value cards', () => {
    const deckA = makeDeck('A', [
      face('KING'),
      face('QUEEN'),
      face('JACK'),
      face('JOKER'),
      face('KING'),
      face('QUEEN'),
      face(2),
      face(3),
    ]);
    const deckB = makeDeck('B');
    expect(() => createGame({ startingPlayer: 'A', decks: { A: deckA, B: deckB } })).toThrowError(
      expect.objectContaining({ code: 'INVALID_INITIAL_STATE' }),
    );
  });

  it('rejects duplicate live card identities across both decks', () => {
    const deckA = makeDeck('A');
    const deckB = makeDeck('B');
    const duplicate = { ...deckB.cards[0]!, id: deckA.cards[0]!.id };
    expect(() =>
      createGame({
        startingPlayer: 'A',
        decks: { A: deckA, B: { cards: [duplicate, ...deckB.cards.slice(1)] } },
      }),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_INITIAL_STATE' }));
  });
});
