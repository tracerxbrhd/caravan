# 04. Game Domain Model

## Status

Accepted as the CARAVAN game-domain contract and implemented in `packages/game-engine` for the deterministic rule surface described here.

The canonical gameplay behavior remains defined by `docs/product/05-game-rules.md`. Domain types make those rules explicit without embedding UI, transport, persistence, or server-lifecycle concerns.

The current implemented engine surface includes:

- deterministic `createGame(...)` initialization from server-supplied card order and starting seat;
- discriminated `GameAction` types plus `legalActions(...)` / `isLegalAction(...)`;
- immutable `applyAction(...)` transitions with stable rule-domain errors and explicit events;
- route value/status, active suit, lane ownership, direction and destructive-removal helpers;
- rule results for normal lane victory and deck exhaustion;
- `stateInvariantViolations(...)` / `assertGameState(...)`;
- explicit `projectForPlayer(...)` hidden-information projection;
- schema-versioned in-memory engine state.

Snapshot persistence/restore validation and migration are not implemented by this engine PR; those remain requirements for the persistence/server layer when durable matches are introduced.

## Goals

The model should make it difficult to represent illegal or ambiguous gameplay accidentally.

It must support:

- deterministic state transitions;
- server-injected shuffled deck order and starting seat;
- hidden hands/decks;
- three opposing route pairs;
- modifier attachment and destructive effects;
- stable original card ownership even when modifiers cross to an opponent's route;
- deterministic route direction/suit recomputation;
- legal-action generation/validation;
- player-specific projections;
- snapshot persistence and schema evolution;
- precise regression/property tests.

## Engine-local player identity

Gameplay uses a small engine-local seat identifier rather than account/provider identity:

```ts
type PlayerSeat = 'A' | 'B';
```

Telegram IDs, account IDs, usernames, avatars, ratings, and sockets do not belong in engine state.

The server maps authenticated domain accounts to seats.

## Card faces, deck cards, and live card instances

Card shape should prevent impossible rank/suit combinations rather than representing them and hoping validation catches them later.

Conceptually:

```ts
export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';

export type ValueRank = 'ACE' | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type SuitedModifierRank = 'JACK' | 'QUEEN' | 'KING';

export type CardFace =
  | {
      readonly rank: ValueRank | SuitedModifierRank;
      readonly suit: Suit;
    }
  | {
      readonly rank: 'JOKER';
      readonly suit: null;
    };
```

A selected deck contains stable source-card definitions before a match assigns seats/live instance IDs:

```ts
interface DeckCardDefinition {
  readonly deckCardId: DeckCardId;
  readonly face: CardFace;
  readonly sourceSetId: CardSetId;
}

interface DeckDefinition {
  readonly cards: readonly DeckCardDefinition[];
}
```

At match initialization, cards become live instances owned by a seat:

```ts
interface CardInstance {
  readonly id: CardId;
  readonly owner: PlayerSeat;
  readonly deckCardId: DeckCardId;
  readonly face: CardFace;
  readonly sourceSetId: CardSetId;
}
```

`CardId` identifies one concrete card instance in one match. Rules based on rank/suit must not confuse card identity with card value.

The `owner` field never changes. A King played by seat A onto seat B's route still belongs to seat A and returns to A's discard pile if removed or if B disbands that route.

## Deck definitions versus shuffled draw order

Separate a player's selected deck definition from live match order.

Conceptually:

```ts
interface ShuffledDeckState {
  readonly drawPile: readonly CardId[];
  readonly discardPile: readonly CardId[];
}
```

Deck validation is deterministic. At minimum the canonical rules require a legal minimum size, unique source-card instances, and enough value cards to make opening setup possible.

Shuffle entropy and starting-seat choice are not produced by the engine.

The authoritative server validates each `DeckDefinition`, instantiates owned match cards, generates secure shuffled orders and a secure starting seat, then injects those initialization inputs into the deterministic engine.

If an opening hand fails the canonical three-value-card requirement, the server supplies a fresh accepted shuffle/order rather than allowing the client or engine to invent entropy.

## Route model

Each player owns exactly three indexed routes:

```ts
type RouteIndex = 0 | 1 | 2;
type Direction = 'ASCENDING' | 'DESCENDING';
```

A route contains an ordered list of value-card nodes.

```ts
interface RouteCard {
  readonly cardId: CardId;
  readonly modifiers: readonly ModifierAttachment[];
}

interface RouteState {
  readonly cards: readonly RouteCard[];
  readonly direction: Direction | null;
}
```

A route's value-card IDs must belong to that route's owning seat because value cards cannot be played onto an opponent's route. Modifier attachments may belong to either seat.

`direction` is explicit because destructive effects can produce edge cases that are not safely reconstructable from a naive `last two cards` expression alone, including equal terminal ranks after an intervening card is removed.

The engine validates stored direction against the canonical recomputation model wherever the current terminal ranks determine it unambiguously.

Active suit is derived from the terminal card/modifiers rather than persisted independently.

## Modifier attachments

Conceptually:

```ts
interface ModifierAttachment {
  readonly cardId: CardId;
  readonly playedSequence: number;
}
```

Attachment order matters because the most recently played surviving Queen determines active suit, while surviving Queen count determines direction toggles.

Do not flatten modifiers into booleans such as `hasKing` or `queenSuit`; the concrete attached cards are public table state and are needed for removal, discard ownership, animation, replay/debugging, and multiple modifiers.

Jacks are transient actions: they do not remain in `RouteState` after successful resolution.

## Authoritative player state

Conceptually:

```ts
interface PlayerGameState {
  readonly seat: PlayerSeat;
  readonly drawPile: readonly CardId[];
  readonly hand: readonly CardId[];
  readonly discardPile: readonly CardId[];
  readonly routes: readonly [RouteState, RouteState, RouteState];
}
```

A player's draw pile, hand, and discard pile contain only cards whose immutable `owner` is that seat. Routes are different: their value cards belong to the route owner, but attached modifiers may be opponent-owned.

Transitions use immutable-copy semantics from the public engine boundary and do not depend on hidden global mutable state.

## Match card registry

Authoritative state needs a stable registry for resolving every `CardId` to face and original owner even after cards move between hands, routes, modifiers, and discard piles.

Conceptually:

```ts
interface MatchCardRegistry {
  readonly byId: Readonly<Record<CardId, CardInstance>>;
}
```

The registry is metadata, not an additional gameplay location. A card still occupies exactly one live location at a time.

## Match state

Conceptually:

```ts
type MatchPhase = 'OPENING' | 'PLAYING' | 'FINISHED';

interface CaravanGameState {
  readonly schemaVersion: number;
  readonly phase: MatchPhase;
  readonly startingPlayer: PlayerSeat;
  readonly activePlayer: PlayerSeat;
  readonly cards: MatchCardRegistry;
  readonly players: Readonly<Record<PlayerSeat, PlayerGameState>>;
  readonly openingPlacements: Readonly<Record<PlayerSeat, number>>;
  readonly result: GameResult | null;
  readonly actionSequence: number;
}
```

The accepted initialization contract guarantees that `activePlayer === startingPlayer` before the first opening action. Turn alternation then follows the canonical rule document; after six alternating opening actions, the starting player becomes the first normal-turn actor.

`stateVersion` used for network concurrency belongs to the authoritative match/server envelope, not to pure game-rule state. Do not conflate transport/persistence versioning with game action sequence.

## Rule-engine result versus server match result

The pure game engine decides only outcomes produced by card-game rules:

- normal route/lane victory;
- deck exhaustion.

Voluntary surrender, inactivity timeout, disconnect forfeiture, administrative abort, and infrastructure no-contest are server match-lifecycle outcomes. They are not `GameAction`s or card-rule transitions.

The server may wrap a rule-engine `GameResult` in a broader persisted `MatchResult`/finish reason used by history and UI.

## Player actions

The implemented public rule boundary uses a discriminated union:

```ts
type GameAction =
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
```

Do not create a generic `{ type: string; payload: unknown }` rule boundary.

`legalActions(state, seat)` and `isLegalAction(...)` are derived from the same rule helpers used by transition validation. Client highlighting must not become a separate handwritten rules implementation.

Surrender is intentionally absent from `GameAction`; it belongs to server lifecycle commands.

## Engine transition contract

The implemented high-level shape is:

```ts
interface TransitionResult {
  readonly state: CaravanGameState;
  readonly events: readonly GameEvent[];
}

function applyAction(
  state: CaravanGameState,
  actor: PlayerSeat,
  action: GameAction,
): TransitionResult;
```

Invalid actions fail with stable `GameRuleError` codes rather than presentation strings.

Events are useful for animation/audit semantics but the engine does not own WebSocket broadcasting or persistence.

## Game events

The engine currently emits explicit events for:

- `CARD_PLAYED`;
- `CARD_DRAWN`;
- `CARD_DISCARDED`;
- `MODIFIER_ATTACHED`;
- `CARDS_REMOVED`;
- `ROUTE_DISBANDED`;
- `TURN_CHANGED`;
- `GAME_FINISHED`.

Event visibility is explicit. A private draw event contains a card identity only for its player; public actions expose identities as appropriate.

Do not broadcast raw engine events blindly. The future protocol/server layer must preserve visibility semantics and may transform events into viewer-specific wire messages.

## Derived route evaluation

The engine centralizes pure helpers including:

```ts
routeValue(route, cards)
activeSuit(route, cards)
routeStatus(route, cards)
laneOwner(state, routeIndex)
normalRouteWinner(state)
```

There must be one implementation of these rules. Server, protocol, and React components should not recalculate them independently.

## Destructive effects and discard routing

Jack/Joker removals are deterministic transformations over concrete card IDs.

After removal:

- each removed card is routed to the discard pile belonging to `cards.byId[cardId].owner`;
- surviving route order is preserved;
- direction is recomputed according to the canonical rule document;
- route value/status and lane ownership are recalculated;
- the action may immediately finish the game.

The same ownership routing applies when a route is disbanded. A single disband operation may therefore update both players' discard piles when opponent-owned modifiers were attached to the route.

Regression tests include:

- terminal/internal destructive removals;
- cards carrying modifiers;
- opponent-owned modifiers attached across routes;
- Joker removal across both players by suit and by rank;
- removal that leaves equal terminal ranks;
- a Queen-bearing internal card becoming terminal again;
- removal that empties a route.

## Authoritative state versus PlayerView

`CaravanGameState` is privileged server state and must never be serialized wholesale to a client.

The implemented projection boundary is:

```ts
function projectForPlayer(
  state: CaravanGameState,
  viewer: PlayerSeat,
): PlayerView;
```

A `PlayerView` contains:

- the viewer's exact hand;
- all public table cards/modifiers and their original owners;
- public route values/status/ownership;
- opponent hand size, not opponent hand identities;
- both remaining deck counts, not either future deck order;
- both public discard piles and discarded card identities/order;
- active player/phase/result;
- legal actions for the viewer when they are the active player.

It must not contain:

- opponent hand contents;
- either future draw order;
- rejected mulligan hands/orders;
- private server RNG material;
- other server-only audit/identity data.

Projection is covered by focused and property-based security tests.

## Serialization

Engine state carries a schema version, but durable snapshot parsing/restoration is intentionally deferred until the persistence layer exists.

When persistence is introduced, never trust `JSON.parse(...) as CaravanGameState` without runtime validation. Migrations or explicit legacy deserializers should handle old snapshot schemas when persisted format changes.

## Determinism

Given the same:

- valid initial card instances and ownership;
- injected shuffled orders;
- injected starting player;
- action sequence;

…the engine produces the same resulting state and domain events.

Wall-clock timestamps, random generation, database queries, network state, animation timing, and Telegram context are forbidden inputs to rule transitions.

## Invariants and property tests

`assertGameState(...)` / `stateInvariantViolations(...)` enforce the central structural invariants, while fast-check generates arbitrary legal action sequences and verifies that transitions preserve them.

Covered invariants include:

- every live `CardId` exists in the match registry exactly once;
- every card instance occupies exactly one gameplay location at a time;
- card ownership never changes;
- draw piles, hands, and discard piles contain only cards owned by that player;
- route value cards belong to the route owner;
- route modifier attachments may belong to either player;
- a hand never contains an opponent's card instance;
- route attachment count never exceeds three;
- a modifier never exists unattached on a route;
- Jacks never persist on the table after resolution;
- route values are derived from surviving cards only;
- a finished rule-engine game has exactly one winner;
- hidden-information projection never exposes forbidden card IDs;
- generated legal actions are accepted by `applyAction`;
- public transitions do not mutate their input state.

Duplicate network-command application remains the responsibility of the future server command layer, not the engine action semantics.
