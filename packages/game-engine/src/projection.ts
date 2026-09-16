import { legalActions } from './actions.js';
import { cardById } from './cards.js';
import { activeSuit, laneOwner, routeStatus, routeValue } from './routes.js';
import {
  PLAYER_SEATS,
  ROUTE_INDICES,
  type CaravanGameState,
  type PlayerPublicView,
  type PlayerSeat,
  type PlayerView,
  type PublicCard,
  type RouteIndex,
  type RouteView,
} from './types.js';

function publicCard(state: CaravanGameState, cardId: string): PublicCard {
  const card = cardById(state.cards.byId, cardId);
  return { id: card.id, owner: card.owner, face: card.face };
}

function routeView(state: CaravanGameState, owner: PlayerSeat, routeIndex: RouteIndex): RouteView {
  const route = state.players[owner].routes[routeIndex];
  return {
    cards: route.cards.map((node) => ({
      card: publicCard(state, node.cardId),
      modifiers: node.modifiers.map((attachment) => publicCard(state, attachment.cardId)),
    })),
    direction: route.direction,
    activeSuit: activeSuit(route, state.cards.byId),
    value: routeValue(route, state.cards.byId),
    status: routeStatus(route, state.cards.byId),
  };
}

function playerPublicView(state: CaravanGameState, seat: PlayerSeat): PlayerPublicView {
  const player = state.players[seat];
  return {
    seat,
    handSize: player.hand.length,
    remainingDeckCount: player.drawPile.length,
    discardPile: player.discardPile.map((cardId) => publicCard(state, cardId)),
    routes: [routeView(state, seat, 0), routeView(state, seat, 1), routeView(state, seat, 2)],
  };
}

export function projectForPlayer(state: CaravanGameState, viewer: PlayerSeat): PlayerView {
  if (!PLAYER_SEATS.includes(viewer)) throw new Error(`Invalid viewer seat ${String(viewer)}.`);
  return {
    schemaVersion: state.schemaVersion,
    viewer,
    phase: state.phase,
    startingPlayer: state.startingPlayer,
    activePlayer: state.activePlayer,
    hand: state.players[viewer].hand.map((cardId) => publicCard(state, cardId)),
    players: {
      A: playerPublicView(state, 'A'),
      B: playerPublicView(state, 'B'),
    },
    laneOwners: ROUTE_INDICES.map((route) => laneOwner(state, route)) as [
      PlayerSeat | null,
      PlayerSeat | null,
      PlayerSeat | null,
    ],
    result: state.result,
    actionSequence: state.actionSequence,
    legalActions: legalActions(state, viewer),
  };
}
