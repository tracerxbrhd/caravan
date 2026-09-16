# 10. Match Entry

## Status

Implemented as the first durable player-to-player match entry layer for the first playable.

This layer sits between authenticated CARAVAN accounts and the existing authoritative `MatchService`. It decides **who should be placed into a match**; it does not own card rules, shuffle, hidden information, realtime gameplay, reconnect, or match finalization.

## Supported entry paths

The first implementation supports both first-playable entry modes required by product scope:

- casual matchmaking queue;
- private challenge/invite.

Ranked matchmaking, rating-based pairing, parties, spectators, tournament brackets, and social graphs remain out of scope.

## Identity boundary

All match-entry operations use internal CARAVAN account UUIDs resolved from the existing application session.

Telegram user IDs, raw Telegram `initData`, usernames, and Telegram-specific deep-link data are not match-entry ownership identifiers.

A later Telegram bot/deep-link layer may transport a private invite token, but accepting that token still requires an authenticated CARAVAN account and produces a normal internal-account match.

## Casual matchmaking

`caravan_matchmaking_queue` stores durable queue membership with:

- account ID;
- original queue time;
- lease expiry.

The lease prevents a process crash, closed Mini App, or abandoned client from leaving a player eligible for matchmaking forever. Joining again refreshes the lease without losing the original queue position while the existing lease is still valid.

Expired queue rows are ignored and cleaned during matchmaking work.

The initial queue is deliberately simple FIFO casual pairing. There is no hidden MMR/rating behavior.

## Private challenges

A private challenge contains:

- a server-generated challenge UUID;
- inviter internal account ID;
- a cryptographically random 32-byte invite token;
- expiry time;
- lifecycle status;
- resolving account and match ID where applicable.

The raw invite token is returned only when the challenge is created. PostgreSQL stores only its SHA-256 hash.

The token is a capability to resolve the invite, not gameplay authorization. Possessing a token does not grant access to a match snapshot or WebSocket control; normal authenticated participant checks still apply after a match exists.

Challenge lifecycle states are:

```text
PENDING
-> ACCEPTED
-> DECLINED
-> CANCELLED
-> EXPIRED
```

Acceptance is retry-safe for the same accepting account after the challenge has already created its match.

## Concurrency and duplicate-match prevention

Match entry is serialized around the involved internal account IDs with PostgreSQL transaction-scoped advisory locks.

Challenge acceptance additionally locks the durable challenge row before resolution.

Before creating a match the service rechecks whether either account already participates in an active authoritative match. Match creation then occurs through the existing `MatchService` using a transaction-bound `PostgresMatchStore`, so the new authoritative match and the surrounding queue/challenge transition share one PostgreSQL transaction.

This protects the important races:

- queue join vs queue join;
- duplicate/retried challenge acceptance;
- two different accounts accepting the same invite;
- challenge acceptance vs casual matchmaking;
- creating another entry path while already in an active match.

No Redis/distributed lock service is introduced.

## Match creation boundary

Match entry never constructs `AuthoritativeMatch` or card state itself.

It delegates to `MatchService.createMatch(...)`, which remains responsible for:

- server-owned match UUID;
- cryptographically secure shuffle;
- equal starter decks;
- opening-hand acceptance/mulligan behavior;
- secure starting-seat selection;
- authoritative hidden state;
- initial snapshot validation.

Therefore casual and private matches have exactly the same gameplay authority and hidden-information guarantees.

## HTTP API

Authenticated match-entry HTTP endpoints are mounted under `/api`:

```text
GET    /api/matchmaking
POST   /api/matchmaking/join
POST   /api/matchmaking/heartbeat
DELETE /api/matchmaking

POST   /api/challenges
GET    /api/challenges/:challengeId
POST   /api/challenges/accept
POST   /api/challenges/decline
POST   /api/challenges/:challengeId/cancel
```

Matchmaking status is explicit:

- `IDLE`;
- `QUEUED` with authoritative lease expiry;
- `MATCH_FOUND` with the participant's match ID.

The client can then enter the already-established authenticated `/ws` runtime and issue `RESYNC` for that match.

## Secret handling

Invite tokens are treated like session-adjacent secrets:

- generated with server cryptographic randomness;
- stored only as a SHA-256 hash;
- validated through strict protocol schemas;
- redacted from Fastify logs;
- never embedded into authoritative match state;
- never interpreted as account or gameplay authorization.

## Durability and restart behavior

Queue rows and challenges live in PostgreSQL, not process memory.

A server restart therefore does not lose challenge state. Queue state survives only for the bounded lease window, preventing stale players from remaining matchable indefinitely.

Already-created matches continue to use the durable match snapshot/realtime recovery behavior defined in architecture documents 07 and 09.

## Current non-goals

This layer does not implement:

- Telegram bot commands or deep links;
- Mini App Play/matchmaking UI;
- push notifications;
- ranked or rating-aware matchmaking;
- rematch;
- friend lists;
- public lobbies/rooms;
- spectator entry;
- multi-process distributed matchmaking coordination.

Those should build on this boundary rather than move account matching into Telegram or the game engine.
