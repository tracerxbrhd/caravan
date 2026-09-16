# 02. Realtime, Hidden Information, and RNG

## Status

Accepted as a security/correctness baseline for CARAVAN multiplayer.

## Hidden information is a security boundary

Unlike an open-information board game, the authoritative card-game state may contain information that one or both clients are forbidden to see:

- opponent hand contents;
- future deck order;
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
5. game legality against the authoritative state;
6. any timing/lifecycle constraints.

Duplicate retries must not apply the same action twice. Stale commands must be rejected/resynchronized rather than guessed forward.

## Persistence ordering

For every accepted state-changing command:

```text
receive command
-> validate
-> calculate deterministic next state
-> persist snapshot/version/event in a transaction
-> commit
-> project fresh PlayerViews
-> broadcast
```

Do not broadcast a committed-looking state before durable persistence succeeds.

## Reconnect and restart recovery

An active match must not exist only in process memory.

After a normal server restart, an unfinished match should be reconstructable from PostgreSQL. Reconnecting players receive newly generated sanitized `PlayerView` snapshots rather than reasserting client state.

Timers should be represented with authoritative server timestamps/deadlines rather than process-local countdown values.

## Shuffle and randomness

The client is never randomness authority.

For live matches:

- generate shuffle entropy on the server with a cryptographically secure randomness source;
- use an unbiased Fisher-Yates shuffle or equivalent;
- persist the authoritative resulting deck order as required for recovery;
- never expose future deck order to either player;
- inject the produced order/random result into the deterministic engine.

Tests should use deterministic fixtures/seeds/orders so game-engine behavior is reproducible.

## Testing baseline

At minimum, automated tests should cover:

- projection never leaking opponent hand contents;
- projection never leaking future deck order;
- duplicate command idempotency;
- stale state-version rejection;
- illegal command rejection;
- reconnect projection correctness;
- restart recovery from durable state;
- shuffle permutation/invariant tests;
- concurrent finalization or command attempts where relevant.
