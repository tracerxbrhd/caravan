# 04. Game Domain Model

## Status

Accepted as the initial domain contract for the future `packages/game-engine` implementation. This is architecture documentation, not implemented code.

The canonical gameplay behavior remains defined by `docs/product/05-game-rules.md`. Domain types must make those rules explicit without embedding UI or transport concerns.

## Goals

The model should make it difficult to represent illegal or ambiguous gameplay accidentally.

It must support:

- deterministic state transitions;
- server-injected shuffled deck order;
- hidden hands/decks;
- three opposing route pairs;
- modifier attachment and destructive effects;
- deterministic route direction/suit recomputation;
- legal-action generation/validation;
- player-specific projections;
- snapshot persistence and schema evolution;
- precise regression/property tests.

## Core card types

Conceptually:

```ts
export type Suit = 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES';

export type ValueRank = 'ACE' | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type ModifierRank = 'JACK' | 'QUEEN' | 'KING' | 'JOKER';
export type Rank = ValueRank | ModifierRank;

export interface CardInstance {
  readonly id: CardId;
  readonly rank: Rank;
  readonly suit: Suit | null;
  readonly sourceSetId: CardSetId;
}
```

Jokers may use `suit: null`. Do not fabricate a suit merely to satisfy a shared shape.

`CardId` identifies one concrete card instance. Rules based on rank/suit must not confuse card identity with card value.

## Deck definitions versus shuffled draw order

Separate a player's submitted/selected deck definition from live match order.

Conceptually:

```ts
interface DeckDefinition {
  readonly cards: readonly CardInstance[];
}

interface ShuffledDeckState {
  readonly drawPile: readonly CardId[];
  readonly discardPile: readonly CardId[];
}
```

Deck validation is deterministic. Shuffle entropy is not produced by the engine.

The authoritative server validates a legal `DeckDefinition`, generates secure shuffled order, and injects that order when creating match state.

## Player identity inside the engine

Gameplay should use a small engine-local seat identifier rather than account/provider identity:

```ts
type PlayerSeat = 'A' | 'B';
```

Telegram IDs, account IDs, usernames, avatars, ratings, and sockets do not belong in engine state.

The server maps authenticated domain accounts to seats.

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

`direction` is explicit because destructive effects can produce edge cases that are not safely reconstructable from a naive `last two cards` expression alone, including equal terminal ranks after an intervening card is removed.

The engine must still validate that stored direction is consistent with the canonical recomputation algorithm.

Active suit should normally be derived from the terminal card/modifiers rather than stored independently unless implementation evidence shows a strong reason to persist it.

## Modifier attachments

Conceptually:

```ts
interface ModifierAttachment {
  readonly cardId: CardId;
  readonly playedSequence: number;
}
```

Attachment order matters because the most recently played surviving Queen determines active suit, while Queen count/order affects direction changes.

Do not flatten modifiers into booleans such as `hasKing` or `queenSuit`; the concrete attached cards are public table state and are needed for removal, discard, animation, replay/debugging, and multiple modifiers.

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

The engine may use immutable-copy semantics or equivalent disciplined updates, but transitions must not depend on hidden global mutable state.

## Match state

Conceptually:

```ts
type MatchPhase = 'OPENING' | 'PLAYING' | 'FINISHED';

interface CaravanGameState {
  readonly schemaVersion: number;
  readonly phase: MatchPhase;
  readonly activePlayer: PlayerSeat;
  readonly players: Readonly<Record<PlayerSeat, PlayerGameState>>;
  readonly openingPlacements: Readonly<Record<PlayerSeat, number>>;
  readonly result: GameResult | null;
  readonly actionSequence: number;
}
```

`stateVersion` used for network concurrency belongs to the authoritative match/server envelope, not necessarily to pure game-rule state. Do not conflate transport/persistence versioning with game action sequence unless an accepted implementation decision intentionally unifies them.

## Player actions

Use a discriminated union, for example:

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

The engine should expose either `legalActions(state, seat)` or focused legal-target helpers derived from the same rules used by validation. Client highlighting must not be maintained as a separate handwritten rules implementation.

## Engine transition contract

A useful high-level shape is:

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

Invalid actions should fail with stable domain error codes, not presentation strings.

Events are useful for animation/audit semantics but the engine does not own WebSocket broadcasting or persistence.

## Game events

Examples of domain events that may be useful:

- `CARD_PLAYED`;
- `CARD_DRAWN` (private visibility);
- `CARD_DISCARDED`;
- `MODIFIER_ATTACHED`;
- `CARDS_REMOVED`;
- `ROUTE_DISBANDED`;
- `ROUTE_STATUS_CHANGED`;
- `TURN_CHANGED`;
- `MATCH_FINISHED`.

Event visibility must be explicit. A private draw event may contain a card identity for one player while the opponent-visible representation contains only hand/deck count changes.

Do not broadcast raw engine events blindly if they contain hidden information.

## Derived route evaluation

The engine should centralize pure helpers such as:

```ts
routeValue(route)
effectiveDirection(route, previousDirectionContext?)
activeSuit(route)
routeStatus(route)
laneOwner(state, routeIndex)
matchResult(state)
```

There must be one implementation of these rules. Server, protocol, and React components should not recalculate them independently.

## Destructive effects

Jack/Joker removals should be expressed as deterministic transformations over concrete card IDs.

After removal:

- removed target groups move to the appropriate owner's discard state;
- surviving route order is preserved;
- direction is recomputed according to the canonical rule document;
- route value/status and lane ownership are recalculated;
- the action may immediately finish the match.

Tests must include removals of:

- terminal cards;
- internal cards;
- cards carrying Kings;
- cards carrying Queens;
- cards carrying Jokers;
- multiple same-rank/same-suit cards removed across both players;
- a removal that leaves equal terminal ranks;
- a removal that empties a route.

## Authoritative state versus PlayerView

`CaravanGameState` is privileged server state and must never be serialized wholesale to a client.

Create an explicit projection boundary, conceptually:

```ts
function projectForPlayer(
  state: CaravanGameState,
  viewer: PlayerSeat,
): PlayerView;
```

A `PlayerView` may contain:

- the viewer's exact hand;
- all public table cards/modifiers;
- public route values/status/ownership;
- opponent hand size, not opponent hand identities;
- both remaining deck counts, not either future deck order;
- public discard information as accepted by product rules;
- active player/phase/result;
- legal actions or legal-target hints for the viewer where useful.

It must not contain:

- opponent hand contents;
- either future draw order;
- private server RNG material;
- other server-only audit/identity data.

Projection tests are security tests, not merely serialization tests.

## Serialization

Snapshots require a schema version and strict validation on restore.

Never trust `JSON.parse(...) as CaravanGameState` without runtime validation.

Migrations or explicit legacy deserializers should handle old snapshot schemas when the format changes after persisted matches exist.

## Determinism

Given the same:

- valid initial deck definitions;
- injected shuffled orders;
- action sequence;

…the engine must produce the same resulting state and domain events.

Wall-clock timestamps, random generation, database queries, network state, animation timing, and Telegram context are forbidden inputs to rule transitions.

## Invariants worth property-testing

At minimum:

- every card instance exists in exactly one valid location at a time;
- a hand never contains an opponent's card instance;
- route attachment count never exceeds three;
- a modifier never exists unattached on a route;
- Jacks never persist on the table after resolution;
- route values are non-negative and derived from surviving cards only;
- a finished match has exactly one winner;
- a normal finished match gives at least two of three lanes to the winner;
- hidden information projection never exposes forbidden card IDs;
- legal-action generation and `applyAction` agree;
- duplicate application is prevented by the server command layer, not by mutating engine semantics.
