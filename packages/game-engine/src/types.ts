export const GAME_STATE_SCHEMA_VERSION = 1 as const;

export const PLAYER_SEATS = ['A', 'B'] as const;
export type PlayerSeat = (typeof PLAYER_SEATS)[number];

export const SUITS = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'] as const;
export type Suit = (typeof SUITS)[number];

export type ValueRank = 'ACE' | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type SuitedModifierRank = 'JACK' | 'QUEEN' | 'KING';
export type ModifierRank = SuitedModifierRank | 'JOKER';

export type CardFace =
  | {
      readonly rank: ValueRank | SuitedModifierRank;
      readonly suit: Suit;
    }
  | {
      readonly rank: 'JOKER';
      readonly suit: null;
    };

export type CardId = string;
export type DeckCardId = string;
export type CardSetId = string;

export interface CardInstance {
  readonly id: CardId;
  readonly owner: PlayerSeat;
  readonly deckCardId: DeckCardId;
  readonly face: CardFace;
  readonly sourceSetId: CardSetId;
}

export interface InitialDeck {
  /** Cards are ordered first-to-draw. The first eight cards form the accepted opening hand. */
  readonly cards: readonly CardInstance[];
}

export type RouteIndex = 0 | 1 | 2;
export const ROUTE_INDICES = [0, 1, 2] as const satisfies readonly RouteIndex[];

export type Direction = 'ASCENDING' | 'DESCENDING';
export type RouteStatus = 'LIGHT' | 'IN_RANGE' | 'OVERLOADED';

export interface ModifierAttachment {
  readonly cardId: CardId;
  readonly playedSequence: number;
}

export interface RouteCard {
  readonly cardId: CardId;
  readonly modifiers: readonly ModifierAttachment[];
}

export interface RouteState {
  readonly cards: readonly RouteCard[];
  /** Effective direction, including active terminal Queen toggles. */
  readonly direction: Direction | null;
}

export interface PlayerGameState {
  readonly seat: PlayerSeat;
  readonly drawPile: readonly CardId[];
  readonly hand: readonly CardId[];
  readonly discardPile: readonly CardId[];
  readonly routes: readonly [RouteState, RouteState, RouteState];
}

export interface MatchCardRegistry {
  readonly byId: Readonly<Record<CardId, CardInstance>>;
}

export type MatchPhase = 'OPENING' | 'PLAYING' | 'FINISHED';

export type GameResult =
  | {
      readonly winner: PlayerSeat;
      readonly reason: 'ROUTES';
    }
  | {
      readonly winner: PlayerSeat;
      readonly reason: 'DECK_EXHAUSTION';
      readonly exhaustedPlayer: PlayerSeat;
    };

export interface CaravanGameState {
  readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  readonly phase: MatchPhase;
  readonly startingPlayer: PlayerSeat;
  readonly activePlayer: PlayerSeat;
  readonly cards: MatchCardRegistry;
  readonly players: Readonly<Record<PlayerSeat, PlayerGameState>>;
  readonly openingPlacements: Readonly<Record<PlayerSeat, number>>;
  readonly result: GameResult | null;
  readonly actionSequence: number;
}

export interface CreateGameInput {
  readonly startingPlayer: PlayerSeat;
  readonly decks: Readonly<Record<PlayerSeat, InitialDeck>>;
}

export type GameAction =
  | {
      readonly type: 'PLAY_VALUE_CARD';
      readonly cardId: CardId;
      readonly route: RouteIndex;
    }
  | {
      readonly type: 'PLAY_MODIFIER_CARD';
      readonly cardId: CardId;
      readonly targetPlayer: PlayerSeat;
      readonly route: RouteIndex;
      readonly targetCardId: CardId;
    }
  | {
      readonly type: 'DISCARD_HAND_CARD';
      readonly cardId: CardId;
    }
  | {
      readonly type: 'DISBAND_ROUTE';
      readonly route: RouteIndex;
    };

export type EventVisibility =
  | { readonly type: 'PUBLIC' }
  | { readonly type: 'PRIVATE'; readonly seat: PlayerSeat };

export type GameEvent =
  | {
      readonly type: 'CARD_PLAYED';
      readonly visibility: EventVisibility;
      readonly actor: PlayerSeat;
      readonly cardId: CardId;
      readonly routeOwner: PlayerSeat;
      readonly route: RouteIndex;
    }
  | {
      readonly type: 'MODIFIER_ATTACHED';
      readonly visibility: EventVisibility;
      readonly actor: PlayerSeat;
      readonly cardId: CardId;
      readonly targetPlayer: PlayerSeat;
      readonly route: RouteIndex;
      readonly targetCardId: CardId;
    }
  | {
      readonly type: 'CARD_DRAWN';
      readonly visibility: EventVisibility;
      readonly player: PlayerSeat;
      readonly cardId: CardId;
    }
  | {
      readonly type: 'CARD_DISCARDED';
      readonly visibility: EventVisibility;
      readonly player: PlayerSeat;
      readonly cardId: CardId;
      readonly source: 'HAND';
    }
  | {
      readonly type: 'CARDS_REMOVED';
      readonly visibility: EventVisibility;
      readonly cause: 'JACK' | 'JOKER';
      readonly cardIds: readonly CardId[];
    }
  | {
      readonly type: 'ROUTE_DISBANDED';
      readonly visibility: EventVisibility;
      readonly player: PlayerSeat;
      readonly route: RouteIndex;
      readonly cardIds: readonly CardId[];
    }
  | {
      readonly type: 'TURN_CHANGED';
      readonly visibility: EventVisibility;
      readonly activePlayer: PlayerSeat;
      readonly phase: Exclude<MatchPhase, 'FINISHED'>;
    }
  | {
      readonly type: 'GAME_FINISHED';
      readonly visibility: EventVisibility;
      readonly result: GameResult;
    };

export interface TransitionResult {
  readonly state: CaravanGameState;
  readonly events: readonly GameEvent[];
}

export interface PublicCard {
  readonly id: CardId;
  readonly owner: PlayerSeat;
  readonly face: CardFace;
}

export interface RouteCardView {
  readonly card: PublicCard;
  readonly modifiers: readonly PublicCard[];
}

export interface RouteView {
  readonly cards: readonly RouteCardView[];
  readonly direction: Direction | null;
  readonly activeSuit: Suit | null;
  readonly value: number;
  readonly status: RouteStatus;
}

export interface PlayerPublicView {
  readonly seat: PlayerSeat;
  readonly handSize: number;
  readonly remainingDeckCount: number;
  readonly discardPile: readonly PublicCard[];
  readonly routes: readonly [RouteView, RouteView, RouteView];
}

export interface PlayerView {
  readonly schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  readonly viewer: PlayerSeat;
  readonly phase: MatchPhase;
  readonly startingPlayer: PlayerSeat;
  readonly activePlayer: PlayerSeat;
  readonly hand: readonly PublicCard[];
  readonly players: Readonly<Record<PlayerSeat, PlayerPublicView>>;
  readonly laneOwners: readonly [PlayerSeat | null, PlayerSeat | null, PlayerSeat | null];
  readonly result: GameResult | null;
  readonly actionSequence: number;
  readonly legalActions: readonly GameAction[];
}
