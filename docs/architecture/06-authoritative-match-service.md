# 06. Authoritative Match Service

## Status

Implemented initially in `apps/server` by PR #5 and extended with durable realtime lifecycle/deadline orchestration in PR #8.

This document defines the server-owned match orchestration layer that sits between the pure game engine, persistence adapter, and transport runtime.

## Scope

The match service owns:

- live match identity and seat ownership;
- the equal first-playable starter deck definition;
- server-side shuffle and opening mulligans;
- unbiased starting-seat choice;
- authoritative game state;
- `stateVersion`;
- command idempotency through `commandId`;
- stale-command rejection;
- game-engine action application;
- surrender and server-owned lifecycle finalization;
- durable connection flags and authoritative turn/reconnect deadlines;
- connect/disconnect/restart lifecycle transitions;
- periodic deadline-expiration decisions;
- fresh per-player sanitized snapshots.

It does not own HTTP/WebSocket framing, Telegram authentication, process-local controlling-socket maps, matchmaking, PostgreSQL SQL/migrations, or production deployment.

## Match creation

A match is created only from two already-resolved internal account IDs occupying seats A and B. The same account cannot occupy both seats.

For the first playable, both seats receive the same server-defined starter deck: one ordinary 52-card playing-card set plus two distinct Jokers, 54 cards total.

The server creates stable per-match card-instance IDs, then independently shuffles each player's deck using unbiased Fisher-Yates driven by cryptographically secure server randomness in the default live implementation.

If the first eight cards do not contain at least three value cards, that player's deck is shuffled again from the full unshuffled starter set until the accepted opening-hand condition is met. Rejected candidate orders never enter the engine or client protocol.

The starting seat is chosen independently and uniformly by the same server-owned cryptographic randomness boundary.

Tests inject deterministic randomness; the game engine itself remains randomness-free.

## Authoritative state

The service stores an internal `AuthoritativeMatch` containing privileged engine state, participants, lifecycle state, processed command records, connection flags, absolute deadlines, and the current `stateVersion`.

That type is server-only and has no protocol schema.

Every client-facing snapshot is produced by:

```text
AuthoritativeMatch.game
-> projectForPlayer(game, viewerSeat)
-> protocol MatchSnapshot validation
-> client
```

The service validates outbound snapshots for both seats before committing accepted changes. This is defense in depth against accidentally persisting a server state that cannot be represented safely through the accepted protocol.

## Storage boundary

`MatchStore` remains deliberately narrow:

- `create(match)`;
- `load(matchId)`;
- `compareAndSet(matchId, expectedStateVersion, next)`;
- `listActiveMatchIds()` for lifecycle sweep/recovery work.

`InMemoryMatchStore` remains the focused-test implementation. `PostgresMatchStore` is the durable live adapter and preserves the same atomic compare-and-set semantics transactionally.

The service never relies on process memory as the only copy of active-match state.

## Command processing order

For a state-changing command, the service performs:

1. load authoritative match;
2. validate account membership / resolve seat;
3. check whether this account already used the `commandId`;
4. if the exact command was already accepted, do not apply it again and return a fresh current snapshot;
5. if the same `commandId` is reused with a different payload, reject `DUPLICATE_COMMAND`;
6. resolve any already-expired authoritative deadline before accepting a new mutation;
7. validate `expectedStateVersion`;
8. reject commands against a finished match;
9. apply surrender or deterministic `game-engine` transition;
10. derive any rule-engine match result;
11. increment `stateVersion` exactly once;
12. append the processed-command record;
13. advance/clear lifecycle deadlines as appropriate;
14. validate fresh player projections;
15. commit with compare-and-set;
16. return the viewer-specific accepted snapshot.

Duplicate detection intentionally occurs before stale-version rejection. A legitimate network retry commonly arrives after the first attempt already advanced the version; treating that retry as stale before checking `commandId` would break idempotency.

## Concurrent commands

Two commands may race with the same expected version.

They may both calculate candidate transitions, but only one compare-and-set commit can succeed. The loser reloads current state and is then resolved under normal duplicate/stale rules.

The same CAS discipline also protects concurrent connect/disconnect, deadline finalization, and restart-recovery transitions.

## Rule errors and protocol rejections

Pure rule violations remain `GameRuleError`s inside the engine.

The service maps them to stable protocol outcomes:

- `NOT_ACTIVE_PLAYER` -> `NOT_ACTIVE_PLAYER`;
- already-finished engine state -> `MATCH_FINISHED`;
- other card-rule violations -> `ILLEGAL_ACTION` plus the stable engine `gameErrorCode`.

Transport-owned conditions such as controlling-socket ownership or waiting for both realtime participants remain in the WebSocket adapter rather than being promoted into game rules.

Internal exception strings are never exposed as protocol contracts.

## Match finalization

Normal rule-engine finishes are promoted to server match results:

- route victory -> `ROUTES`;
- failed mandatory replacement draw -> `DECK_EXHAUSTION`.

Server lifecycle outcomes remain outside `GameAction`:

- client `SURRENDER` command;
- server-owned `TIMEOUT` finalization;
- infrastructure `NO_CONTEST` finalization.

Lifecycle finalization advances `stateVersion`, clears active deadlines, and does not invent or mutate a card-rule result. The protocol therefore continues to distinguish `PlayerView.result` from the broader match result.

## Realtime lifecycle and deadlines

The service exposes lifecycle methods consumed by the realtime adapter rather than embedding socket objects itself.

`connectPlayer(...)` and `disconnectPlayer(...)` update durable connection flags and reconnect deadlines through `MatchStore.compareAndSet(...)`.

The first turn deadline is created when both seats have connected. Accepted non-finishing state-changing commands advance the turn deadline from authoritative server time. A disconnect after match start creates a reconnect grace deadline without allowing the client to provide or extend time.

`expireMatchIfDue(...)` and `expireAllDue()` evaluate stored absolute deadlines. If one earliest deadline identifies one loser, the match finalizes as `TIMEOUT`. If simultaneous earliest deadlines imply different losers, the service finalizes `NO_CONTEST` instead of choosing arbitrarily.

The timeout and reconnect durations are injected server configuration, not game-engine rules.

## Restart recovery

`recoverConnectionsAfterRestart()` handles the fact that persisted `connected=true` flags cannot represent live sockets across a process restart.

For active matches it:

- converts stale connected flags to disconnected state;
- grants reconnect grace where a started match had a live pre-restart connection;
- preserves absolute authoritative turn/reconnect timing;
- resolves an already-expired recovered deadline as infrastructure `NO_CONTEST` rather than retroactively asserting a player-caused timeout while the server was unavailable.

All restart-recovery mutations are durable/versioned and use the same CAS boundary.

## Resync

`RESYNC` remains non-mutating with respect to card-game state. It does not itself apply a game action and always returns a newly generated sanitized snapshot to an authenticated match participant.

The realtime adapter performs connection ownership and durable connect/reconnect lifecycle work around this command before returning the final participant snapshot.

The supplied known version is advisory context for transport/client behavior; it is never trusted as state.

## Current non-goals

The match service deliberately does not implement:

- HTTP routes or WebSocket framing;
- Telegram `initData` authentication;
- process-local controlling-socket maps;
- matchmaking/private challenges;
- player profiles/rating/economy;
- client UI.

Those layers consume this service rather than bypassing it or duplicating game rules.

## Testing baseline

Server tests cover:

- equal starter-deck construction;
- deterministic injected shuffle behavior;
- accepted opening hands;
- hidden-information projection at the service boundary;
- accepted command/version advancement;
- exact retry idempotency;
- divergent duplicate-command rejection;
- stale-version resync response;
- wrong-turn and illegal-action mapping;
- concurrent same-version commands committing at most once;
- surrender idempotency;
- timeout and no-contest finalization;
- non-participant isolation;
- a complete engine-to-server match driven only by projected legal actions;
- durable connect/disconnect/reconnect transitions;
- turn/reconnect deadline behavior;
- restart recovery and infrastructure no-contest handling.
