import type {
  CardFace,
  CardId,
  CardInstance,
  ModifierRank,
  PlayerSeat,
  SuitedModifierRank,
  Suit,
  ValueRank,
} from './types.js';

export function otherSeat(seat: PlayerSeat): PlayerSeat {
  return seat === 'A' ? 'B' : 'A';
}

export function isValueRank(rank: CardFace['rank']): rank is ValueRank {
  return rank === 'ACE' || (typeof rank === 'number' && rank >= 2 && rank <= 10);
}

export function isSuitedModifierRank(rank: CardFace['rank']): rank is SuitedModifierRank {
  return rank === 'JACK' || rank === 'QUEEN' || rank === 'KING';
}

export function isModifierRank(rank: CardFace['rank']): rank is ModifierRank {
  return isSuitedModifierRank(rank) || rank === 'JOKER';
}

export function isValueCard(card: CardInstance): boolean {
  return isValueRank(card.face.rank);
}

export function isModifierCard(card: CardInstance): boolean {
  return isModifierRank(card.face.rank);
}

export function rankValue(rank: ValueRank): number {
  return rank === 'ACE' ? 1 : rank;
}

export function faceSuit(face: CardFace): Suit | null {
  return face.suit;
}

export function cardById(
  cards: Readonly<Record<CardId, CardInstance>>,
  cardId: CardId,
): CardInstance {
  const card = cards[cardId];
  if (card === undefined) {
    throw new Error(`Unknown card id: ${cardId}`);
  }
  return card;
}
