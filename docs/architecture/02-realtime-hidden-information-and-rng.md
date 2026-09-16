# 02. Realtime, Hidden Information, and RNG

## Status

Accepted as a security/correctness baseline for CARAVAN multiplayer.

## Hidden information is a security boundary

Unlike an open-information board game, the authoritative card-game state may contain information that one or both clients are forbidden to see:

- opponent hand contents;
- future deck order;
- rejected mulligan hands/orders;
- unrevealed draw information;
- other private state introduced by accepted rules.

Therefore the authoritative state must never be serialized wholesale to a client.

Use an explicit projection boundary, conceptually:

```text
AuthoritativeGameState
        |
        +--> projectForPlayer(state, A) --> PlayerView(A)
        |
        +--> projectForPlayer(state, B) --> PlayerView(B)
```

A `PlayerView` may contain the player's permitted hidden information plus public/aggregate opponent information such as hand/deck size when allowed by the rules. It must never contain the opponent's private cards or future deck order.

Under the current canonical rules, table cards and both discard piles are public information. A card discarded from a hidden hand becomes public at the moment the discard is accepted.

## Leakage prevention

Hidden information must also be excluded from:

- WebSocket events sent to the wrong player;
- HTTP response payloads;
- client bundles and debug fixtures used in production;
- logs and structured error context;
- analytics/telemetry payloads;
- exception messages;
- debug/admin endpoints that are not explicitly protected;
- reconnect/resync snapshots.

Tests must treat this as a security property, not merely a presentation concern.

## Realtime command model

Prefer a typed/versioned plain WebSocket protocol.

State-changing commands should include identifiers sufficient for validation and safe retry, including at minimum:

- `matchId`;
- `commandId`;
- expected `stateVersion`.

For each command, the server validates:

1. authenticated account/session;
2. match ownership/seat;
3. expected state version;
4. command idempotency/duplicate status;
5. game legality against the authoritative state where applicable;
6. timing/lifecycle constraints.

Duplicate retries must not apply the same action twice. Stale commands must be rejected/resynchronized rather than guessed forward.

Server lifecycle commands such as surrender are separate from pure card-game `GameAction`s but use the same authentication, ownership, idempotency, and state-version discipline.

## Persistence ordering

For every accepted state-changing command:

```text
receive command
-> validate
-> calculate deterministic next state / lifecycle result
-> persist snapshot/version/event in a transaction
-> commit
-> project fresh PlayerViews
-> broadcast
```

Do not broadcast a committed-looking state before durable persistence succeeds.

Finalization must be idempotent. A rules win, timeout, surrender, retry, reconnect race, or duplicate delivery must never finalize one match twice.

## Starting seat and secure randomness

The client is never randomness authority.

At live-match creation, the authoritative server securely chooses the starting seat and shuffled deck orders, then injects those values into deterministic game initialization.

The starting-seat choice must be unbiased. It is match initialization data, not something either client may nominate after seeing a hand.

## Shuffle and opening mulligans

For live matches:

- generate shuffle entropy on the server with a cryptographically secure randomness source;
- use an unbiased Fisher-Yates shuffle or equivalent;
- persist the authoritative resulting deck order as required for recovery;
- never expose future deck order to either player;
- inject the produced order into the deterministic engine.

If the first eight cards fail the accepted opening-hand requirement, the server performs another secure shuffle for that player's deck until it produces an accepted opening order. Rejected candidate hands/orders remain server-private and are not exposed to either client.

Tests should use deterministic fixtures/seeds/orders so game-engine behavior is reproducible.

## Match lifecycle, deadlines, and disconnects

Card-rule state and multiplayer lifecycle are related but distinct.

The server owns authoritative absolute timestamps/deadlines for:

- turn/inactivity limits where enabled;
- disconnect/reconnect grace;
- challenge/queue lifecycle where applicable;
- finalization.

A socket disconnect is not itself a game loss. A player may reconnect within the accepted grace policy and receive a fresh `PlayerView`.

If a player fails to return or act before an authoritative deadline, the server may finalize the match as timeout/forfeit according to product policy. The client cannot extend or reset a deadline by claiming a different local time.

Voluntary surrender is also a server lifecycle outcome.

If infrastructure failure makes fair continuation impossible and durable recovery cannot restore the match, prefer an explicit aborted/no-contest result over inventing a player fault.

Exact timeout durations belong to configuration/product policy and should be validated with real play; they are not constants in `packages/game-engine`.

## Reconnect and restart recovery

An active match must not exist only in process memory.

After a normal server restart, an unfinished match should be reconstructable from PostgreSQL. Reconnecting players receive newly generated sanitized `PlayerView` snapshots rather than reasserting client state.

Recovery must preserve authoritative deadlines and finish state. Restarting the process must not silently grant extra turns, duplicate a finalization, or revive an already finished match.

## Public events versus private events

Do not assume every engine event has one wire representation.

Examples:

- a draw may reveal exact card identity only to the drawing player while the opponent sees count changes;
- a direct discard is public after acceptance and may reveal the discarded card to both players;
- a Joker/Jack removal is public and may reveal all removed cards/modifiers;
- future deck order remains private even though remaining deck count is public.

Protocol event/projection schemas should encode visibility deliberately rather than broadcasting raw privileged engine events.

## Testing baseline

At minimum, automated tests should cover:

- projection never leaking opponent hand contents;
- projection never leaking future/rejected deck order;
- public discard contents visible consistently to both players;
- duplicate command idempotency;
- stale state-version rejection;
- illegal command rejection;
- reconnect projection correctness;
- restart recovery from durable state;
- preserved deadline behavior across recovery;
- secure-shuffle permutation/invariant tests with deterministic test inputs;
- unbiased/injected starting-seat handling at the server boundary;
- timeout/surrender/finalization idempotency;
- concurrent finalization or command attempts where relevant.
