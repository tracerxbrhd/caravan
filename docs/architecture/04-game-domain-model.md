# 04. Game Domain Model

## Status

Accepted as the initial domain contract for the future `packages/game-engine` implementation. This is architecture documentation, not implemented code.

The canonical gameplay behavior remains defined by `docs/product/05-game-rules.md`. Domain types must make those rules explicit without embedding UI or transport concerns.

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

The engine may use immutable-copy semantics or equivalent disciplined updates, but transitions must not depend on hidden global mutable state.

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

`stateVersion` used for network concurrency belongs to the authoritative match/server envelope, not necessarily to pure game-rule state. Do not conflate transport/persistence versioning with game action sequence unless an accepted implementation decision intentionally unifies them.

## Rule-engine result versus server match result

The pure game engine should only decide outcomes produced by card-game rules, such as:

- normal route/lane victory;
- deck exhaustion.

Voluntary surrender, inactivity timeout, disconnect forfeiture, administrative abort, and infrastructure no-contest are server match-lifecycle outcomes. They should not be faked as `GameAction`s or encoded as card-rule transitions.

The server may wrap a rule-engine `GameResult` in a broader persisted `MatchResult`/finish reason used by history and UI.

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

Surrender is intentionally absent from `GameAction`; it belongs to server lifecycle commands.

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
- `CARD_DRAWN` (private identity visibility);
- `CARD_DISCARDED` (public identity once discarded);
- `MODIFIER_ATTACHED`;
- `CARDS_REMOVED`;
- `ROUTE_DISBANDED`;
- `ROUTE_STATUS_CHANGED`;
- `TURN_CHANGED`;
- `GAME_FINISHED`.

Event visibility must be explicit. A private draw event may contain a card identity for one player while the opponent-visible representation contains only hand/deck count changes. A discard/removal event may reveal identities that became public by rule.

Do not broadcast raw engine events blindly if they contain hidden information.

## Derived route evaluation

The engine should centralize pure helpers such as:

```ts
routeValue(route)
effectiveDirection(route, previousDirectionContext?)
activeSuit(route)
routeStatus(route)
laneOwner(state, routeIndex)
gameResult(state)
```

There must be one implementation of these rules. Server, protocol, and React components should not recalculate them independently.

## Destructive effects and discard routing

Jack/Joker removals should be expressed as deterministic transformations over concrete card IDs.

After removal:

- each removed card is routed to the discard pile belonging to `cards.byId[cardId].owner`;
- surviving route order is preserved;
- direction is recomputed according to the canonical rule document;
- route value/status and lane ownership are recalculated;
- the action may immediately finish the game.

The same ownership routing applies when a route is disbanded. A single disband operation may therefore update both players' discard piles when opponent-owned modifiers were attached to the route.

Tests must include removals of:

- terminal cards;
- internal cards;
- cards carrying Kings;
- cards carrying Queens;
- cards carrying Jokers;
- an opponent-owned modifier attached to the acting player's route;
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
- all public table cards/modifiers and their original owners where relevant;
- public route values/status/ownership;
- opponent hand size, not opponent hand identities;
- both remaining deck counts, not either future deck order;
- both public discard piles and discarded card identities/order;
- active player/phase/result;
- legal actions or legal-target hints for the viewer where useful.

It must not contain:

- opponent hand contents;
- either future draw order;
- rejected mulligan hands/orders;
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
- instantiated card ownership/identities;
- injected shuffled orders;
- injected starting player;
- action sequence;

…the engine must produce the same resulting state and domain events.

Wall-clock timestamps, random generation, database queries, network state, animation timing, and Telegram context are forbidden inputs to rule transitions.

## Invariants worth property-testing

At minimum:

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
- route values are non-negative and derived from surviving cards only;
- a finished rule-engine game has exactly one winner;
- a normal finished game gives at least two of three lanes to the winner;
- hidden-information projection never exposes forbidden card IDs;
- legal-action generation and `applyAction` agree;
- duplicate application is prevented by the server command layer, not by mutating engine semantics.
