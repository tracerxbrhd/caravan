import {
  createGame,
  projectForPlayer,
  type CardFace,
  type CardInstance,
  type InitialDeck,
  type PlayerSeat,
} from '@caravan/game-engine';
import type { MatchSnapshot } from '../src/index.js';

export const MATCH_ID = '00000000-0000-4000-8000-000000000001';
export const COMMAND_ID = '00000000-0000-4000-8000-000000000002';

const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const;

function face(index: number): CardFace {
  const value = (index % 10) + 1;
  return {
    rank: value === 1 ? 'ACE' : (value as 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10),
    suit: SUITS[index % SUITS.length]!,
  };
}

export function makeDeck(seat: PlayerSeat): InitialDeck {
  const cards: CardInstance[] = Array.from({ length: 30 }, (_, index) => ({
    id: `${seat}-${index}`,
    owner: seat,
    deckCardId: `${seat}-deck-${index}`,
    sourceSetId: 'starter',
    face: face(index),
  }));
  return { cards };
}

export function makeState() {
  return createGame({
    startingPlayer: 'A',
    decks: {
      A: makeDeck('A'),
      B: makeDeck('B'),
    },
  });
}

export function makeSnapshot(): MatchSnapshot {
  return {
    matchId: MATCH_ID,
    stateVersion: 0,
    status: 'ACTIVE',
    game: projectForPlayer(makeState(), 'A'),
    connected: { A: true, B: true },
    turnDeadlineAtMs: null,
    reconnectDeadlineAtMs: { A: null, B: null },
    result: null,
  };
}
