import {
  SUITS,
  isValueRank,
  type CardFace,
  type CardInstance,
  type InitialDeck,
  type PlayerSeat,
} from '@caravan/game-engine';
import { fisherYatesShuffle, type MatchRandomSource } from './random.js';

export const STARTER_DECK_SOURCE_SET_ID = 'starter-standard-v1' as const;
export const STARTER_DECK_CARD_COUNT = 54 as const;

const STANDARD_RANKS = ['ACE', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'JACK', 'QUEEN', 'KING'] as const;

interface StarterCardTemplate {
  readonly deckCardId: string;
  readonly face: CardFace;
}

function starterCardTemplates(): readonly StarterCardTemplate[] {
  const cards: StarterCardTemplate[] = [];

  for (const suit of SUITS) {
    for (const rank of STANDARD_RANKS) {
      cards.push({
        deckCardId: `${STARTER_DECK_SOURCE_SET_ID}:${suit}:${String(rank)}`,
        face: { rank, suit },
      });
    }
  }

  cards.push(
    {
      deckCardId: `${STARTER_DECK_SOURCE_SET_ID}:JOKER:1`,
      face: { rank: 'JOKER', suit: null },
    },
    {
      deckCardId: `${STARTER_DECK_SOURCE_SET_ID}:JOKER:2`,
      face: { rank: 'JOKER', suit: null },
    },
  );

  return cards;
}

export function createStarterDeckInstances(
  matchId: string,
  owner: PlayerSeat,
): readonly CardInstance[] {
  const templates = starterCardTemplates();
  if (templates.length !== STARTER_DECK_CARD_COUNT) {
    throw new Error('Starter deck template has an unexpected card count.');
  }

  return templates.map((template, index) => ({
    id: `${matchId}:${owner}:${String(index).padStart(2, '0')}`,
    owner,
    deckCardId: template.deckCardId,
    face: template.face,
    sourceSetId: STARTER_DECK_SOURCE_SET_ID,
  }));
}

export function openingHandIsAccepted(cards: readonly CardInstance[]): boolean {
  return cards.slice(0, 8).filter((card) => isValueRank(card.face.rank)).length >= 3;
}

export function createAcceptedShuffledStarterDeck(
  matchId: string,
  owner: PlayerSeat,
  random: MatchRandomSource,
): InitialDeck {
  const unshuffled = createStarterDeckInstances(matchId, owner);

  for (;;) {
    const shuffled = fisherYatesShuffle(unshuffled, random);
    if (openingHandIsAccepted(shuffled)) return { cards: shuffled };
  }
}
