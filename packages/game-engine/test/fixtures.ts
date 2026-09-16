import {
  applyAction,
  createGame,
  type CardFace,
  type CardInstance,
  type CaravanGameState,
  type PlayerSeat,
  type Suit,
  type ValueRank,
} from '../src/index.js';

const SUITS: readonly Suit[] = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
const FILLER_RANKS: readonly ValueRank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 'ACE'];

export function face(rank: CardFace['rank'], suit: Suit = 'CLUBS'): CardFace {
  return rank === 'JOKER' ? { rank, suit: null } : { rank, suit };
}

export function makeDeck(seat: PlayerSeat, firstFaces: readonly CardFace[] = []) {
  const faces = [...firstFaces];
  while (faces.length < 30) {
    faces.push(face(FILLER_RANKS[faces.length % FILLER_RANKS.length]!, SUITS[faces.length % 4]!));
  }
  return {
    cards: faces.map(
      (cardFace, index): CardInstance => ({
        id: `${seat}-${index}`,
        owner: seat,
        deckCardId: `${seat}-deck-${index}`,
        sourceSetId: 'standard-test-set',
        face: cardFace,
      }),
    ),
  };
}

export function makeGame(
  firstA: readonly CardFace[] = [],
  firstB: readonly CardFace[] = [],
  startingPlayer: PlayerSeat = 'A',
): CaravanGameState {
  return createGame({
    startingPlayer,
    decks: { A: makeDeck('A', firstA), B: makeDeck('B', firstB) },
  });
}

export function completeOpening(state: CaravanGameState): CaravanGameState {
  let current = state;
  const starter = state.startingPlayer;
  const follower: PlayerSeat = starter === 'A' ? 'B' : 'A';
  const turns = [
    [starter, `${starter}-0`, 0],
    [follower, `${follower}-0`, 0],
    [starter, `${starter}-1`, 1],
    [follower, `${follower}-1`, 1],
    [starter, `${starter}-2`, 2],
    [follower, `${follower}-2`, 2],
  ] as const;

  for (const [seat, cardId, route] of turns) {
    current = applyAction(current, seat, { type: 'PLAY_VALUE_CARD', cardId, route }).state;
  }
  return current;
}

export function passWithDiscard(state: CaravanGameState, seat: PlayerSeat): CaravanGameState {
  const cardId = state.players[seat].hand[0];
  if (cardId === undefined) throw new Error(`Player ${seat} has no card to discard.`);
  return applyAction(state, seat, { type: 'DISCARD_HAND_CARD', cardId }).state;
}

export function exhaustDrawPile(state: CaravanGameState, seat: PlayerSeat): CaravanGameState {
  const player = state.players[seat];
  return {
    ...state,
    players: {
      ...state.players,
      [seat]: {
        ...player,
        drawPile: [],
        discardPile: [...player.discardPile, ...player.drawPile],
      },
    },
  };
}
