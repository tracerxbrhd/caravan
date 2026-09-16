import { cardById, isModifierRank, isValueRank, otherSeat } from './cards.js';
import { GameRuleError, ruleError } from './errors.js';
import {
  canAppendValueCard,
  captureRemovalContext,
  directionAfterAppend,
  normalRouteWinner,
  recomputeDirectionAfterRemoval,
  reversedDirection,
} from './routes.js';
import { assertGameState } from './state.js';
import {
  PLAYER_SEATS,
  ROUTE_INDICES,
  type CardId,
  type CaravanGameState,
  type Direction,
  type GameAction,
  type GameEvent,
  type GameResult,
  type ModifierAttachment,
  type PlayerGameState,
  type PlayerSeat,
  type RouteCard,
  type RouteIndex,
  type RouteState,
  type TransitionResult,
} from './types.js';

interface MutableRouteCard {
  cardId: CardId;
  modifiers: ModifierAttachment[];
}

interface MutableRoute {
  cards: MutableRouteCard[];
  direction: Direction | null;
}

interface MutablePlayerState {
  seat: PlayerSeat;
  drawPile: CardId[];
  hand: CardId[];
  discardPile: CardId[];
  routes: [MutableRoute, MutableRoute, MutableRoute];
}

interface MutableGameState {
  schemaVersion: CaravanGameState['schemaVersion'];
  phase: CaravanGameState['phase'];
  startingPlayer: PlayerSeat;
  activePlayer: PlayerSeat;
  cards: CaravanGameState['cards'];
  players: Record<PlayerSeat, MutablePlayerState>;
  openingPlacements: Record<PlayerSeat, number>;
  result: GameResult | null;
  actionSequence: number;
}

const PUBLIC = { type: 'PUBLIC' } as const;

function cloneRoute(route: RouteState): MutableRoute {
  return {
    direction: route.direction,
    cards: route.cards.map((node) => ({
      cardId: node.cardId,
      modifiers: node.modifiers.map((attachment) => ({ ...attachment })),
    })),
  };
}

function clonePlayer(player: PlayerGameState): MutablePlayerState {
  return {
    seat: player.seat,
    drawPile: [...player.drawPile],
    hand: [...player.hand],
    discardPile: [...player.discardPile],
    routes: [
      cloneRoute(player.routes[0]),
      cloneRoute(player.routes[1]),
      cloneRoute(player.routes[2]),
    ],
  };
}

function cloneState(state: CaravanGameState): MutableGameState {
  return {
    schemaVersion: state.schemaVersion,
    phase: state.phase,
    startingPlayer: state.startingPlayer,
    activePlayer: state.activePlayer,
    cards: state.cards,
    players: { A: clonePlayer(state.players.A), B: clonePlayer(state.players.B) },
    openingPlacements: { ...state.openingPlacements },
    result: state.result === null ? null : { ...state.result },
    actionSequence: state.actionSequence,
  };
}

function readonlyState(state: MutableGameState): CaravanGameState {
  return state;
}

function routeAt(state: MutableGameState, seat: PlayerSeat, route: RouteIndex): MutableRoute {
  return state.players[seat].routes[route];
}

function assertRouteIndex(route: RouteIndex): void {
  if (!ROUTE_INDICES.includes(route))
    ruleError('INVALID_ROUTE', `Invalid route index ${String(route)}.`);
}

function assertSeat(seat: PlayerSeat): void {
  if (!PLAYER_SEATS.includes(seat))
    ruleError('INVALID_MODIFIER_TARGET', `Invalid player seat ${String(seat)}.`);
}

function handCard(state: MutableGameState, actor: PlayerSeat, cardId: CardId) {
  if (!state.players[actor].hand.includes(cardId)) {
    ruleError('CARD_NOT_IN_HAND', `Card ${cardId} is not in player ${actor}'s hand.`);
  }
  return cardById(state.cards.byId, cardId);
}

function consumeHandCard(state: MutableGameState, actor: PlayerSeat, cardId: CardId): void {
  const hand = state.players[actor].hand;
  const index = hand.indexOf(cardId);
  if (index < 0) ruleError('CARD_NOT_IN_HAND', `Card ${cardId} is not in player ${actor}'s hand.`);
  hand.splice(index, 1);
}

function discardByOriginalOwner(state: MutableGameState, cardIds: readonly CardId[]): void {
  for (const cardId of cardIds) {
    const card = cardById(state.cards.byId, cardId);
    state.players[card.owner].discardPile.push(cardId);
  }
}

function cardIdsFromNode(node: RouteCard | MutableRouteCard): CardId[] {
  return [node.cardId, ...node.modifiers.map((attachment) => attachment.cardId)];
}

function drawReplacement(state: MutableGameState, actor: PlayerSeat, events: GameEvent[]): boolean {
  const cardId = state.players[actor].drawPile.shift();
  if (cardId === undefined) return false;
  state.players[actor].hand.push(cardId);
  events.push({
    type: 'CARD_DRAWN',
    visibility: { type: 'PRIVATE', seat: actor },
    player: actor,
    cardId,
  });
  return true;
}

function finish(
  state: MutableGameState,
  result: GameResult,
  events: GameEvent[],
): TransitionResult {
  state.phase = 'FINISHED';
  state.result = result;
  events.push({ type: 'GAME_FINISHED', visibility: PUBLIC, result });
  const next = readonlyState(state);
  assertGameState(next);
  return { state: next, events };
}

function finishIfNormalWinner(
  state: MutableGameState,
  events: GameEvent[],
): TransitionResult | null {
  const winner = normalRouteWinner(readonlyState(state));
  if (winner === null) return null;
  return finish(state, { winner, reason: 'ROUTES' }, events);
}

function finishOrAdvanceNormalTurn(
  state: MutableGameState,
  actor: PlayerSeat,
  events: GameEvent[],
  requiresReplacementDraw: boolean,
): TransitionResult {
  if (requiresReplacementDraw) {
    const drew = drawReplacement(state, actor, events);
    if (!drew) {
      const routeWinner = normalRouteWinner(readonlyState(state));
      if (routeWinner === actor) {
        return finish(state, { winner: actor, reason: 'ROUTES' }, events);
      }
      return finish(
        state,
        { winner: otherSeat(actor), reason: 'DECK_EXHAUSTION', exhaustedPlayer: actor },
        events,
      );
    }
  }

  const normalFinish = finishIfNormalWinner(state, events);
  if (normalFinish !== null) return normalFinish;

  state.activePlayer = otherSeat(actor);
  events.push({
    type: 'TURN_CHANGED',
    visibility: PUBLIC,
    activePlayer: state.activePlayer,
    phase: 'PLAYING',
  });
  const next = readonlyState(state);
  assertGameState(next);
  return { state: next, events };
}

function applyOpeningValuePlay(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'PLAY_VALUE_CARD' }>,
  events: GameEvent[],
): TransitionResult {
  assertRouteIndex(action.route);
  const card = handCard(state, actor, action.cardId);
  if (!isValueRank(card.face.rank)) {
    ruleError('INVALID_CARD_TYPE', 'Opening setup requires a value card.');
  }
  const route = routeAt(state, actor, action.route);
  if (route.cards.length !== 0) {
    ruleError('ROUTE_NOT_EMPTY', 'Opening cards must seed an empty route.');
  }

  consumeHandCard(state, actor, action.cardId);
  route.cards.push({ cardId: action.cardId, modifiers: [] });
  route.direction = null;
  state.openingPlacements[actor] += 1;
  state.actionSequence += 1;
  events.push({
    type: 'CARD_PLAYED',
    visibility: PUBLIC,
    actor,
    cardId: action.cardId,
    routeOwner: actor,
    route: action.route,
  });

  if (state.openingPlacements.A === 3 && state.openingPlacements.B === 3) {
    state.phase = 'PLAYING';
    state.activePlayer = state.startingPlayer;
    events.push({
      type: 'TURN_CHANGED',
      visibility: PUBLIC,
      activePlayer: state.activePlayer,
      phase: 'PLAYING',
    });
  } else {
    state.activePlayer = otherSeat(actor);
    events.push({
      type: 'TURN_CHANGED',
      visibility: PUBLIC,
      activePlayer: state.activePlayer,
      phase: 'OPENING',
    });
  }

  const next = readonlyState(state);
  assertGameState(next);
  return { state: next, events };
}

function playValueCard(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'PLAY_VALUE_CARD' }>,
  events: GameEvent[],
): TransitionResult {
  assertRouteIndex(action.route);
  const card = handCard(state, actor, action.cardId);
  if (!isValueRank(card.face.rank))
    ruleError('INVALID_CARD_TYPE', 'Selected card is not a value card.');
  const route = routeAt(state, actor, action.route);
  if (!canAppendValueCard(route, card, state.cards.byId)) {
    ruleError(
      'ILLEGAL_VALUE_PLAY',
      `Card ${action.cardId} cannot be appended to route ${action.route}.`,
    );
  }

  const direction = directionAfterAppend(route, card, state.cards.byId);
  consumeHandCard(state, actor, action.cardId);
  route.cards.push({ cardId: action.cardId, modifiers: [] });
  route.direction = direction;
  state.actionSequence += 1;
  events.push({
    type: 'CARD_PLAYED',
    visibility: PUBLIC,
    actor,
    cardId: action.cardId,
    routeOwner: actor,
    route: action.route,
  });
  return finishOrAdvanceNormalTurn(state, actor, events, true);
}

function findTargetNode(
  state: MutableGameState,
  targetPlayer: PlayerSeat,
  routeIndex: RouteIndex,
  targetCardId: CardId,
): { readonly route: MutableRoute; readonly index: number; readonly node: MutableRouteCard } {
  assertSeat(targetPlayer);
  assertRouteIndex(routeIndex);
  const route = routeAt(state, targetPlayer, routeIndex);
  const index = route.cards.findIndex((node) => node.cardId === targetCardId);
  if (index < 0) {
    ruleError(
      'INVALID_MODIFIER_TARGET',
      `Card ${targetCardId} is not a value card on the target route.`,
    );
  }
  const node = route.cards[index];
  if (node === undefined) throw new Error('Target route node disappeared during validation.');
  if (node.modifiers.length >= 3) {
    ruleError('MODIFIER_LIMIT_REACHED', `Card ${targetCardId} already has three modifiers.`);
  }
  return { route, index, node };
}

function playJack(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'PLAY_MODIFIER_CARD' }>,
  events: GameEvent[],
): TransitionResult {
  const target = findTargetNode(state, action.targetPlayer, action.route, action.targetCardId);
  const before = captureRemovalContext(target.route);
  const removedNode = target.route.cards.splice(target.index, 1)[0];
  if (removedNode === undefined) throw new Error('Jack target disappeared during resolution.');
  const removedIds = [...cardIdsFromNode(removedNode), action.cardId];
  target.route.direction = recomputeDirectionAfterRemoval(target.route, state.cards.byId, before);
  discardByOriginalOwner(state, removedIds);
  events.push({ type: 'CARDS_REMOVED', visibility: PUBLIC, cause: 'JACK', cardIds: removedIds });
  return finishOrAdvanceNormalTurn(state, actor, events, true);
}

function jokerMatches(
  targetCardId: CardId,
  candidateCardId: CardId,
  state: MutableGameState,
): boolean {
  if (candidateCardId === targetCardId) return false;
  const target = cardById(state.cards.byId, targetCardId);
  const candidate = cardById(state.cards.byId, candidateCardId);
  if (!isValueRank(target.face.rank) || !isValueRank(candidate.face.rank)) return false;
  if (target.face.rank === 'ACE') return candidate.face.suit === target.face.suit;
  return candidate.face.rank === target.face.rank;
}

function resolveJoker(state: MutableGameState, targetCardId: CardId, events: GameEvent[]): void {
  const contexts: Record<
    PlayerSeat,
    readonly [
      ReturnType<typeof captureRemovalContext>,
      ReturnType<typeof captureRemovalContext>,
      ReturnType<typeof captureRemovalContext>,
    ]
  > = {
    A: [
      captureRemovalContext(state.players.A.routes[0]),
      captureRemovalContext(state.players.A.routes[1]),
      captureRemovalContext(state.players.A.routes[2]),
    ],
    B: [
      captureRemovalContext(state.players.B.routes[0]),
      captureRemovalContext(state.players.B.routes[1]),
      captureRemovalContext(state.players.B.routes[2]),
    ],
  };
  const removedIds: CardId[] = [];

  for (const seat of PLAYER_SEATS) {
    for (const routeIndex of ROUTE_INDICES) {
      const route = routeAt(state, seat, routeIndex);
      const survivors: MutableRouteCard[] = [];
      let changed = false;
      for (const node of route.cards) {
        if (jokerMatches(targetCardId, node.cardId, state)) {
          removedIds.push(...cardIdsFromNode(node));
          changed = true;
        } else {
          survivors.push(node);
        }
      }
      if (changed) {
        route.cards = survivors;
        route.direction = recomputeDirectionAfterRemoval(
          route,
          state.cards.byId,
          contexts[seat][routeIndex],
        );
      }
    }
  }

  if (removedIds.length > 0) {
    discardByOriginalOwner(state, removedIds);
    events.push({ type: 'CARDS_REMOVED', visibility: PUBLIC, cause: 'JOKER', cardIds: removedIds });
  }
}

function playPersistentModifier(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'PLAY_MODIFIER_CARD' }>,
  events: GameEvent[],
  rank: 'KING' | 'QUEEN' | 'JOKER',
): TransitionResult {
  const target = findTargetNode(state, action.targetPlayer, action.route, action.targetCardId);
  if (rank === 'QUEEN' && target.index !== target.route.cards.length - 1) {
    ruleError(
      'QUEEN_REQUIRES_TERMINAL',
      'Queen may only target the terminal value card of a route.',
    );
  }

  target.node.modifiers.push({ cardId: action.cardId, playedSequence: state.actionSequence });
  if (rank === 'QUEEN' && target.route.direction !== null) {
    target.route.direction = reversedDirection(target.route.direction);
  }
  events.push({
    type: 'MODIFIER_ATTACHED',
    visibility: PUBLIC,
    actor,
    cardId: action.cardId,
    targetPlayer: action.targetPlayer,
    route: action.route,
    targetCardId: action.targetCardId,
  });

  if (rank === 'JOKER') resolveJoker(state, action.targetCardId, events);
  return finishOrAdvanceNormalTurn(state, actor, events, true);
}

function playModifierCard(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'PLAY_MODIFIER_CARD' }>,
  events: GameEvent[],
): TransitionResult {
  const card = handCard(state, actor, action.cardId);
  if (!isModifierRank(card.face.rank)) {
    ruleError('INVALID_CARD_TYPE', 'Selected card is not a modifier card.');
  }
  findTargetNode(state, action.targetPlayer, action.route, action.targetCardId);

  consumeHandCard(state, actor, action.cardId);
  state.actionSequence += 1;
  events.push({
    type: 'CARD_PLAYED',
    visibility: PUBLIC,
    actor,
    cardId: action.cardId,
    routeOwner: action.targetPlayer,
    route: action.route,
  });

  if (card.face.rank === 'JACK') return playJack(state, actor, action, events);
  return playPersistentModifier(state, actor, action, events, card.face.rank);
}

function discardHandCard(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'DISCARD_HAND_CARD' }>,
  events: GameEvent[],
): TransitionResult {
  handCard(state, actor, action.cardId);
  consumeHandCard(state, actor, action.cardId);
  state.players[actor].discardPile.push(action.cardId);
  state.actionSequence += 1;
  events.push({
    type: 'CARD_DISCARDED',
    visibility: PUBLIC,
    player: actor,
    cardId: action.cardId,
    source: 'HAND',
  });
  return finishOrAdvanceNormalTurn(state, actor, events, true);
}

function disbandRoute(
  state: MutableGameState,
  actor: PlayerSeat,
  action: Extract<GameAction, { type: 'DISBAND_ROUTE' }>,
  events: GameEvent[],
): TransitionResult {
  assertRouteIndex(action.route);
  const route = routeAt(state, actor, action.route);
  if (route.cards.length === 0) ruleError('EMPTY_ROUTE', 'Cannot disband an empty route.');
  const removedIds = route.cards.flatMap((node) => cardIdsFromNode(node));
  route.cards = [];
  route.direction = null;
  discardByOriginalOwner(state, removedIds);
  state.actionSequence += 1;
  events.push({
    type: 'ROUTE_DISBANDED',
    visibility: PUBLIC,
    player: actor,
    route: action.route,
    cardIds: removedIds,
  });
  return finishOrAdvanceNormalTurn(state, actor, events, false);
}

export function applyAction(
  state: CaravanGameState,
  actor: PlayerSeat,
  action: GameAction,
): TransitionResult {
  assertGameState(state);
  if (state.phase === 'FINISHED')
    ruleError('GAME_FINISHED', 'Cannot act after the game has finished.');
  if (actor !== state.activePlayer)
    ruleError('NOT_ACTIVE_PLAYER', `Player ${actor} is not the active player.`);

  const next = cloneState(state);
  const events: GameEvent[] = [];

  if (next.phase === 'OPENING') {
    if (action.type !== 'PLAY_VALUE_CARD') {
      ruleError('WRONG_PHASE', 'Opening setup only permits value-card placement.');
    }
    return applyOpeningValuePlay(next, actor, action, events);
  }

  switch (action.type) {
    case 'PLAY_VALUE_CARD':
      return playValueCard(next, actor, action, events);
    case 'PLAY_MODIFIER_CARD':
      return playModifierCard(next, actor, action, events);
    case 'DISCARD_HAND_CARD':
      return discardHandCard(next, actor, action, events);
    case 'DISBAND_ROUTE':
      return disbandRoute(next, actor, action, events);
  }
}

function actionEquals(left: GameAction, right: GameAction): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case 'PLAY_VALUE_CARD':
      return (
        right.type === 'PLAY_VALUE_CARD' &&
        left.cardId === right.cardId &&
        left.route === right.route
      );
    case 'PLAY_MODIFIER_CARD':
      return (
        right.type === 'PLAY_MODIFIER_CARD' &&
        left.cardId === right.cardId &&
        left.targetPlayer === right.targetPlayer &&
        left.route === right.route &&
        left.targetCardId === right.targetCardId
      );
    case 'DISCARD_HAND_CARD':
      return right.type === 'DISCARD_HAND_CARD' && left.cardId === right.cardId;
    case 'DISBAND_ROUTE':
      return right.type === 'DISBAND_ROUTE' && left.route === right.route;
  }
}

export function legalActions(state: CaravanGameState, actor: PlayerSeat): readonly GameAction[] {
  assertGameState(state);
  if (state.phase === 'FINISHED' || actor !== state.activePlayer) return [];
  const actions: GameAction[] = [];
  const player = state.players[actor];

  if (state.phase === 'OPENING') {
    for (const cardId of player.hand) {
      const card = cardById(state.cards.byId, cardId);
      if (!isValueRank(card.face.rank)) continue;
      for (const route of ROUTE_INDICES) {
        if (player.routes[route].cards.length === 0) {
          actions.push({ type: 'PLAY_VALUE_CARD', cardId, route });
        }
      }
    }
    return actions;
  }

  for (const cardId of player.hand) {
    const card = cardById(state.cards.byId, cardId);
    if (isValueRank(card.face.rank)) {
      for (const route of ROUTE_INDICES) {
        if (canAppendValueCard(player.routes[route], card, state.cards.byId)) {
          actions.push({ type: 'PLAY_VALUE_CARD', cardId, route });
        }
      }
    } else if (isModifierRank(card.face.rank)) {
      for (const targetPlayer of PLAYER_SEATS) {
        for (const route of ROUTE_INDICES) {
          const targetRoute = state.players[targetPlayer].routes[route];
          targetRoute.cards.forEach((node, index) => {
            if (node.modifiers.length >= 3) return;
            if (card.face.rank === 'QUEEN' && index !== targetRoute.cards.length - 1) return;
            actions.push({
              type: 'PLAY_MODIFIER_CARD',
              cardId,
              targetPlayer,
              route,
              targetCardId: node.cardId,
            });
          });
        }
      }
    }
    actions.push({ type: 'DISCARD_HAND_CARD', cardId });
  }

  for (const route of ROUTE_INDICES) {
    if (player.routes[route].cards.length > 0) actions.push({ type: 'DISBAND_ROUTE', route });
  }
  return actions;
}

export function isLegalAction(
  state: CaravanGameState,
  actor: PlayerSeat,
  action: GameAction,
): boolean {
  try {
    return legalActions(state, actor).some((candidate) => actionEquals(candidate, action));
  } catch (error) {
    if (error instanceof GameRuleError) return false;
    throw error;
  }
}
