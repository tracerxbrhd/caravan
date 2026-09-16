import { cardById, isValueRank, rankValue } from './cards.js';
import type {
  CaravanGameState,
  CardId,
  CardInstance,
  Direction,
  PlayerSeat,
  RouteIndex,
  RouteState,
  RouteStatus,
  Suit,
  ValueRank,
} from './types.js';

export interface RemovalContext {
  readonly direction: Direction | null;
  readonly terminalCardId: CardId | null;
}

type ValueCardInstance = CardInstance & {
  readonly face: { readonly rank: ValueRank; readonly suit: Suit };
};

function valueCardForNode(
  route: RouteState,
  index: number,
  cards: Readonly<Record<CardId, CardInstance>>,
): ValueCardInstance {
  const node = route.cards[index];
  if (node === undefined) {
    throw new Error(`Route card index ${index} is missing.`);
  }
  const card = cardById(cards, node.cardId);
  if (!isValueRank(card.face.rank)) {
    throw new Error(`Route value node ${node.cardId} is not a value card.`);
  }
  return card as ValueCardInstance;
}

export function routeValue(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): number {
  let total = 0;
  for (const node of route.cards) {
    const card = cardById(cards, node.cardId);
    if (!isValueRank(card.face.rank)) {
      throw new Error(`Route value node ${node.cardId} is not a value card.`);
    }
    const kingCount = node.modifiers.reduce((count, attachment) => {
      const modifier = cardById(cards, attachment.cardId);
      return modifier.face.rank === 'KING' ? count + 1 : count;
    }, 0);
    total += rankValue(card.face.rank) * 2 ** kingCount;
  }
  return total;
}

export function routeStatusFromValue(value: number): RouteStatus {
  if (value < 21) return 'LIGHT';
  if (value <= 26) return 'IN_RANGE';
  return 'OVERLOADED';
}

export function routeStatus(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): RouteStatus {
  return routeStatusFromValue(routeValue(route, cards));
}

export function activeSuit(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): Suit | null {
  const terminal = route.cards.at(-1);
  if (terminal === undefined) return null;

  let newestQueen: { readonly sequence: number; readonly suit: Suit } | null = null;
  for (const attachment of terminal.modifiers) {
    const modifier = cardById(cards, attachment.cardId);
    if (modifier.face.rank !== 'QUEEN') continue;
    const suit = modifier.face.suit;
    if (suit === null) {
      throw new Error(`Queen ${modifier.id} must have a suit.`);
    }
    if (newestQueen === null || attachment.playedSequence > newestQueen.sequence) {
      newestQueen = { sequence: attachment.playedSequence, suit };
    }
  }

  if (newestQueen !== null) return newestQueen.suit;

  const terminalCard = cardById(cards, terminal.cardId);
  if (terminalCard.face.suit === null) {
    throw new Error(`Value card ${terminalCard.id} must have a suit.`);
  }
  return terminalCard.face.suit;
}

export function compareDirection(previousValue: number, nextValue: number): Direction {
  if (nextValue > previousValue) return 'ASCENDING';
  if (nextValue < previousValue) return 'DESCENDING';
  throw new Error('Equal values do not establish a direction.');
}

export function reversedDirection(direction: Direction): Direction {
  return direction === 'ASCENDING' ? 'DESCENDING' : 'ASCENDING';
}

function terminalQueenCount(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): number {
  const terminal = route.cards.at(-1);
  if (terminal === undefined) return 0;
  return terminal.modifiers.reduce((count, attachment) => {
    const modifier = cardById(cards, attachment.cardId);
    return modifier.face.rank === 'QUEEN' ? count + 1 : count;
  }, 0);
}

function applyTerminalQueenToggles(
  direction: Direction,
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): Direction {
  return terminalQueenCount(route, cards) % 2 === 0 ? direction : reversedDirection(direction);
}

export function captureRemovalContext(route: RouteState): RemovalContext {
  return {
    direction: route.direction,
    terminalCardId: route.cards.at(-1)?.cardId ?? null,
  };
}

export function recomputeDirectionAfterRemoval(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
  before: RemovalContext,
): Direction | null {
  if (route.cards.length < 2) return null;

  const previous = valueCardForNode(route, route.cards.length - 2, cards);
  const terminal = valueCardForNode(route, route.cards.length - 1, cards);
  const previousValue = rankValue(previous.face.rank);
  const terminalValue = rankValue(terminal.face.rank);

  if (previousValue !== terminalValue) {
    const base = compareDirection(previousValue, terminalValue);
    return applyTerminalQueenToggles(base, route, cards);
  }

  let direction = before.direction;
  if (direction === null) {
    throw new Error('Equal terminal ranks after removal require a prior effective direction.');
  }

  const terminalChanged = before.terminalCardId !== terminal.id;
  if (terminalChanged) {
    direction = applyTerminalQueenToggles(direction, route, cards);
  }
  return direction;
}

export function canAppendValueCard(
  route: RouteState,
  card: CardInstance,
  cards: Readonly<Record<CardId, CardInstance>>,
): boolean {
  if (!isValueRank(card.face.rank)) return false;
  if (card.face.suit === null) return false;
  if (route.cards.length === 0) return true;

  const terminalNode = route.cards.at(-1);
  if (terminalNode === undefined) return true;
  const terminal = cardById(cards, terminalNode.cardId);
  if (!isValueRank(terminal.face.rank)) return false;

  const terminalValue = rankValue(terminal.face.rank);
  const nextValue = rankValue(card.face.rank);
  if (terminalValue === nextValue) return false;

  if (route.cards.length === 1 || route.direction === null) return true;

  const continuesDirection =
    (route.direction === 'ASCENDING' && nextValue > terminalValue) ||
    (route.direction === 'DESCENDING' && nextValue < terminalValue);
  return continuesDirection || card.face.suit === activeSuit(route, cards);
}

export function directionAfterAppend(
  route: RouteState,
  card: CardInstance,
  cards: Readonly<Record<CardId, CardInstance>>,
): Direction | null {
  if (route.cards.length === 0) return null;
  const terminalNode = route.cards.at(-1);
  if (terminalNode === undefined) return null;
  const terminal = cardById(cards, terminalNode.cardId);
  if (!isValueRank(terminal.face.rank) || !isValueRank(card.face.rank)) {
    throw new Error('Direction can only be derived from value cards.');
  }
  return compareDirection(rankValue(terminal.face.rank), rankValue(card.face.rank));
}

export function laneOwner(state: CaravanGameState, route: RouteIndex): PlayerSeat | null {
  const routeA = state.players.A.routes[route];
  const routeB = state.players.B.routes[route];
  const statusA = routeStatus(routeA, state.cards.byId);
  const statusB = routeStatus(routeB, state.cards.byId);

  const inRangeA = statusA === 'IN_RANGE';
  const inRangeB = statusB === 'IN_RANGE';
  if (!inRangeA && !inRangeB) return null;
  if (inRangeA && !inRangeB) return 'A';
  if (!inRangeA && inRangeB) return 'B';

  const valueA = routeValue(routeA, state.cards.byId);
  const valueB = routeValue(routeB, state.cards.byId);
  if (valueA === valueB) return null;
  return valueA > valueB ? 'A' : 'B';
}

export function normalRouteWinner(state: CaravanGameState): PlayerSeat | null {
  const owners = ([0, 1, 2] as const).map((route) => laneOwner(state, route));
  if (owners.some((owner) => owner === null)) return null;
  const aCount = owners.filter((owner) => owner === 'A').length;
  return aCount >= 2 ? 'A' : 'B';
}
