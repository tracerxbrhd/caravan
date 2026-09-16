import { cardById, isModifierRank, isValueRank } from './cards.js';
import { GameRuleError } from './errors.js';
import { activeSuit, compareDirection, reversedDirection } from './routes.js';
import {
  GAME_STATE_SCHEMA_VERSION,
  PLAYER_SEATS,
  ROUTE_INDICES,
  SUITS,
  type CardFace,
  type CardId,
  type CardInstance,
  type CaravanGameState,
  type CreateGameInput,
  type Direction,
  type PlayerGameState,
  type PlayerSeat,
  type RouteState,
} from './types.js';

function emptyRoute(): RouteState {
  return { cards: [], direction: null };
}

function initialPlayerState(
  seat: PlayerSeat,
  orderedCards: readonly CardInstance[],
): PlayerGameState {
  return {
    seat,
    hand: orderedCards.slice(0, 8).map((card) => card.id),
    drawPile: orderedCards.slice(8).map((card) => card.id),
    discardPile: [],
    routes: [emptyRoute(), emptyRoute(), emptyRoute()],
  };
}

function isValidFace(face: CardFace): boolean {
  if (face.rank === 'JOKER') return face.suit === null;
  if (!SUITS.includes(face.suit)) return false;
  if (typeof face.rank === 'number') return Number.isInteger(face.rank) && face.rank >= 2 && face.rank <= 10;
  return ['ACE', 'JACK', 'QUEEN', 'KING'].includes(face.rank);
}

function validateInitialDeck(seat: PlayerSeat, cards: readonly CardInstance[]): string[] {
  const violations: string[] = [];
  if (cards.length < 30) {
    violations.push(`Player ${seat} deck must contain at least 30 cards.`);
  }

  const cardIds = new Set<CardId>();
  const deckCardIds = new Set<string>();
  let valueCount = 0;
  let openingValueCount = 0;

  cards.forEach((card, index) => {
    if (card.owner !== seat) violations.push(`Card ${card.id} has owner ${card.owner}, expected ${seat}.`);
    if (cardIds.has(card.id)) violations.push(`Duplicate live card id ${card.id} in player ${seat} deck.`);
    cardIds.add(card.id);
    if (deckCardIds.has(card.deckCardId)) {
      violations.push(`Duplicate deckCardId ${card.deckCardId} in player ${seat} deck.`);
    }
    deckCardIds.add(card.deckCardId);
    if (!isValidFace(card.face)) violations.push(`Card ${card.id} has an invalid face.`);
    if (isValueRank(card.face.rank)) {
      valueCount += 1;
      if (index < 8) openingValueCount += 1;
    }
  });

  if (valueCount < 3) violations.push(`Player ${seat} deck must contain at least three value cards.`);
  if (cards.length >= 8 && openingValueCount < 3) {
    violations.push(`Player ${seat} accepted opening hand must contain at least three value cards.`);
  }
  return violations;
}

export function createGame(input: CreateGameInput): CaravanGameState {
  if (!PLAYER_SEATS.includes(input.startingPlayer)) {
    throw new GameRuleError('INVALID_INITIAL_STATE', 'Starting player must be A or B.');
  }

  const violations = [
    ...validateInitialDeck('A', input.decks.A.cards),
    ...validateInitialDeck('B', input.decks.B.cards),
  ];

  const globalIds = new Set<CardId>();
  for (const seat of PLAYER_SEATS) {
    for (const card of input.decks[seat].cards) {
      if (globalIds.has(card.id)) violations.push(`Duplicate live card id ${card.id} across match decks.`);
      globalIds.add(card.id);
    }
  }

  if (violations.length > 0) {
    throw new GameRuleError('INVALID_INITIAL_STATE', violations.join(' '));
  }

  const registry: Record<CardId, CardInstance> = {};
  for (const seat of PLAYER_SEATS) {
    for (const card of input.decks[seat].cards) registry[card.id] = card;
  }

  const state: CaravanGameState = {
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    phase: 'OPENING',
    startingPlayer: input.startingPlayer,
    activePlayer: input.startingPlayer,
    cards: { byId: registry },
    players: {
      A: initialPlayerState('A', input.decks.A.cards),
      B: initialPlayerState('B', input.decks.B.cards),
    },
    openingPlacements: { A: 0, B: 0 },
    result: null,
    actionSequence: 0,
  };

  assertGameState(state);
  return state;
}

function collectLocation(
  locations: Map<CardId, string[]>,
  cardId: CardId,
  location: string,
): void {
  const existing = locations.get(cardId);
  if (existing === undefined) locations.set(cardId, [location]);
  else existing.push(location);
}

function expectedDirectionForDistinctTerminalRanks(
  route: RouteState,
  cards: Readonly<Record<CardId, CardInstance>>,
): Direction | null {
  if (route.cards.length < 2) return null;
  const previousNode = route.cards[route.cards.length - 2];
  const terminalNode = route.cards[route.cards.length - 1];
  if (previousNode === undefined || terminalNode === undefined) return null;
  const previous = cardById(cards, previousNode.cardId);
  const terminal = cardById(cards, terminalNode.cardId);
  if (!isValueRank(previous.face.rank) || !isValueRank(terminal.face.rank)) return null;
  const previousValue = previous.face.rank === 'ACE' ? 1 : previous.face.rank;
  const terminalValue = terminal.face.rank === 'ACE' ? 1 : terminal.face.rank;
  if (previousValue === terminalValue) return null;
  let direction = compareDirection(previousValue, terminalValue);
  const queenCount = terminalNode.modifiers.reduce((count, attachment) => {
    const modifier = cardById(cards, attachment.cardId);
    return modifier.face.rank === 'QUEEN' ? count + 1 : count;
  }, 0);
  if (queenCount % 2 === 1) direction = reversedDirection(direction);
  return direction;
}

export function stateInvariantViolations(state: CaravanGameState): readonly string[] {
  const violations: string[] = [];
  const registry = state.cards.byId;
  const locations = new Map<CardId, string[]>();

  if (state.schemaVersion !== GAME_STATE_SCHEMA_VERSION) {
    violations.push(`Unsupported schema version ${String(state.schemaVersion)}.`);
  }
  if (!PLAYER_SEATS.includes(state.startingPlayer)) violations.push('Invalid starting player.');
  if (!PLAYER_SEATS.includes(state.activePlayer)) violations.push('Invalid active player.');
  if (!Number.isInteger(state.actionSequence) || state.actionSequence < 0) {
    violations.push('actionSequence must be a non-negative integer.');
  }
  if (state.phase === 'FINISHED' && state.result === null) violations.push('Finished state requires a result.');
  if (state.phase !== 'FINISHED' && state.result !== null) violations.push('Non-finished state cannot contain a result.');

  for (const seat of PLAYER_SEATS) {
    const player = state.players[seat];
    if (player.seat !== seat) violations.push(`Player state ${seat} has mismatched seat ${player.seat}.`);

    for (const cardId of player.drawPile) {
      collectLocation(locations, cardId, `${seat}.drawPile`);
      const card = registry[cardId];
      if (card === undefined) violations.push(`Unknown card ${cardId} in ${seat} draw pile.`);
      else if (card.owner !== seat) violations.push(`Opponent card ${cardId} in ${seat} draw pile.`);
    }
    for (const cardId of player.hand) {
      collectLocation(locations, cardId, `${seat}.hand`);
      const card = registry[cardId];
      if (card === undefined) violations.push(`Unknown card ${cardId} in ${seat} hand.`);
      else if (card.owner !== seat) violations.push(`Opponent card ${cardId} in ${seat} hand.`);
    }
    for (const cardId of player.discardPile) {
      collectLocation(locations, cardId, `${seat}.discardPile`);
      const card = registry[cardId];
      if (card === undefined) violations.push(`Unknown card ${cardId} in ${seat} discard pile.`);
      else if (card.owner !== seat) violations.push(`Opponent card ${cardId} in ${seat} discard pile.`);
    }

    for (const routeIndex of ROUTE_INDICES) {
      const route = player.routes[routeIndex];
      if (route.cards.length < 2 && route.direction !== null) {
        violations.push(`${seat} route ${routeIndex} cannot have direction with fewer than two value cards.`);
      }
      if (route.cards.length >= 2 && route.direction === null) {
        violations.push(`${seat} route ${routeIndex} requires an effective direction with two or more value cards.`);
      }
      const expected = expectedDirectionForDistinctTerminalRanks(route, registry);
      if (expected !== null && route.direction !== expected) {
        violations.push(`${seat} route ${routeIndex} has inconsistent effective direction.`);
      }

      for (const node of route.cards) {
        collectLocation(locations, node.cardId, `${seat}.route.${routeIndex}.value`);
        const valueCard = registry[node.cardId];
        if (valueCard === undefined) violations.push(`Unknown route value card ${node.cardId}.`);
        else {
          if (valueCard.owner !== seat) violations.push(`Route value card ${node.cardId} is not owned by route owner ${seat}.`);
          if (!isValueRank(valueCard.face.rank)) violations.push(`Route value node ${node.cardId} is not a value card.`);
        }
        if (node.modifiers.length > 3) violations.push(`Value card ${node.cardId} has more than three modifiers.`);

        const modifierIds = new Set<CardId>();
        for (const attachment of node.modifiers) {
          if (modifierIds.has(attachment.cardId)) violations.push(`Modifier ${attachment.cardId} is attached more than once.`);
          modifierIds.add(attachment.cardId);
          collectLocation(locations, attachment.cardId, `${seat}.route.${routeIndex}.modifier`);
          const modifier = registry[attachment.cardId];
          if (modifier === undefined) violations.push(`Unknown modifier ${attachment.cardId}.`);
          else if (!isModifierRank(modifier.face.rank) || modifier.face.rank === 'JACK') {
            violations.push(`Attached card ${attachment.cardId} is not a persistent modifier.`);
          }
          if (!Number.isInteger(attachment.playedSequence) || attachment.playedSequence <= 0) {
            violations.push(`Modifier ${attachment.cardId} has invalid playedSequence.`);
          }
        }
      }

      try {
        activeSuit(route, registry);
      } catch (error) {
        violations.push(error instanceof Error ? error.message : String(error));
      }
    }

    const placementCount = state.openingPlacements[seat];
    if (!Number.isInteger(placementCount) || placementCount < 0 || placementCount > 3) {
      violations.push(`Opening placement count for ${seat} is invalid.`);
    }
    if (state.phase === 'OPENING') {
      const nonEmptyRoutes = player.routes.filter((route) => route.cards.length > 0).length;
      if (nonEmptyRoutes !== placementCount) {
        violations.push(`Opening placement count for ${seat} does not match seeded routes.`);
      }
    }
  }

  for (const cardId of Object.keys(registry)) {
    const cardLocations = locations.get(cardId) ?? [];
    if (cardLocations.length !== 1) {
      violations.push(`Card ${cardId} occupies ${cardLocations.length} gameplay locations.`);
    }
  }
  for (const cardId of locations.keys()) {
    if (registry[cardId] === undefined) violations.push(`Location references unknown card ${cardId}.`);
  }

  return violations;
}

export function assertGameState(state: CaravanGameState): void {
  const violations = stateInvariantViolations(state);
  if (violations.length > 0) {
    throw new GameRuleError('INVALID_GAME_STATE', violations.join(' '));
  }
}
