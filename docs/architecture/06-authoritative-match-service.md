# 06. Authoritative Match Service

## Status

Implemented initially in `apps/server` by PR #5.

This document defines the server-owned match orchestration layer that sits between the pure game engine and future transport/persistence adapters.

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
- fresh per-player sanitized snapshots.

It does not own HTTP/WebSocket transport, Telegram authentication, matchmaking, PostgreSQL SQL/migrations, reconnect timing policy, or production deployment.

## Match creation

A match is created only from two already-resolved internal account IDs occupying seats A and B. The same account cannot occupy both seats.

For the first playable, both seats receive the same server-defined starter deck: one ordinary 52-card playing-card set plus two distinct Jokers, 54 cards total.

The server creates stable per-match card-instance IDs, then independently shuffles each player's deck using unbiased Fisher-Yates driven by cryptographically secure server randomness in the default live implementation.

If the first eight cards do not contain at least three value cards, that player's deck is shuffled again from the full unshuffled starter set until the accepted opening-hand condition is met. Rejected candidate orders never enter the engine or client protocol.

The starting seat is chosen independently and uniformly by the same server-owned cryptographic randomness boundary.

Tests inject deterministic randomness; the game engine itself remains randomness-free.

## Authoritative state

The service stores an internal `AuthoritativeMatch` containing privileged engine state, participants, lifecycle state, processed command records and the current `stateVersion`.

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

PR #5 introduces a narrow `MatchStore` port:

- `create(match)`;
- `load(matchId)`;
- `compareAndSet(matchId, expectedStateVersion, next)`.

The first implementation is in-memory and intentionally non-durable. Its purpose is to prove match semantics and concurrency behavior without coupling those semantics to PostgreSQL.

The next durable storage implementation must preserve the same atomic compare-and-set semantics transactionally. PostgreSQL should replace this adapter rather than redesign the match service.

## Command processing order

For a state-changing command, the service performs:

1. load authoritative match;
2. validate account membership / resolve seat;
3. check whether this account already used the `commandId`;
4. if the exact command was already accepted, do not apply it again and return a fresh current snapshot;
5. if the same `commandId` is reused with a different payload, reject `DUPLICATE_COMMAND`;
6. validate `expectedStateVersion`;
7. reject commands against a finished match;
8. apply surrender or deterministic `game-engine` transition;
9. derive any rule-engine match result;
10. increment `stateVersion` exactly once;
11. append the processed-command record;
12. validate fresh player projections;
13. commit with compare-and-set;
14. return the viewer-specific accepted snapshot.

Duplicate detection intentionally occurs before stale-version rejection. A legitimate network retry commonly arrives after the first attempt already advanced the version; treating that retry as stale before checking `commandId` would break idempotency.

## Concurrent commands

Two commands may race with the same expected version.

They may both calculate candidate transitions, but only one compare-and-set commit can succeed. The loser reloads current state and is then resolved under normal duplicate/stale rules.

This property is tested against the in-memory store and must remain true when PostgreSQL persistence arrives.

## Rule errors and protocol rejections

Pure rule violations remain `GameRuleError`s inside the engine.

The service maps them to stable protocol outcomes:

- `NOT_ACTIVE_PLAYER` -> `NOT_ACTIVE_PLAYER`;
- already-finished engine state -> `MATCH_FINISHED`;
- other card-rule violations -> `ILLEGAL_ACTION` plus the stable engine `gameErrorCode`.

Internal exception strings are never exposed as protocol contracts.

## Match finalization

Normal rule-engine finishes are promoted to server match results:

- route victory -> `ROUTES`;
- failed mandatory replacement draw -> `DECK_EXHAUSTION`.

Server lifecycle outcomes remain outside `GameAction`:

- client `SURRENDER` command;
- server-owned `TIMEOUT` finalization;
- infrastructure `NO_CONTEST` finalization.

Lifecycle finalization advances `stateVersion` but does not invent or mutate a card-rule result. The protocol therefore continues to distinguish `PlayerView.result` from the broader match result.

PR #5 provides timeout/no-contest finalization primitives but does not yet implement clocks, reconnect grace, or periodic expiration. Those arrive with realtime/lifecycle infrastructure.

## Resync

`RESYNC` is non-mutating. It does not increment `stateVersion` and always returns a newly generated sanitized snapshot to an authenticated match participant.

The supplied known version is advisory context for transport/client behavior; it is never trusted as state.

## Current non-goals

PR #5 deliberately does not implement:

- PostgreSQL persistence or migrations;
- restart recovery;
- Fastify routes;
- WebSocket connections/broadcasting;
- Telegram `initData` authentication;
- session/control ownership;
- disconnect/reconnect timers;
- matchmaking/private challenges;
- player profiles/rating/economy;
- client UI.

Those layers must consume this service rather than bypassing it or duplicating game rules.

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
- a complete engine-to-server match driven only by projected legal actions.
