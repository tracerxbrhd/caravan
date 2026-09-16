# 01. Technical Foundation

## Status

Accepted as the initial architecture direction. The repository scaffold implements the agreed pnpm/TypeScript monorepo boundaries; concrete runtime behavior is added only through focused changes.

As of 2026-09-16, `apps/miniapp`, `apps/bot`, `apps/server`, `packages/game-engine`, and `packages/protocol` exist as buildable workspace packages. The deterministic game engine, typed/runtime-validated protocol contracts, authoritative match-service domain layer, PostgreSQL-backed durable match persistence, Fastify HTTP runtime, provider-independent accounts, Telegram authentication, PostgreSQL-backed application sessions, authenticated WebSocket realtime/reconnect/deadline runtime, casual matchmaking, and private challenges are implemented. The Mini App has a Telegram platform adapter and authentication bootstrap but remains a minimal shell. Bot runtime, client Play/match UI/reconnect transport, and production backend composition remain intentionally unimplemented rather than represented by fake placeholders.

## Reference architecture

CARAVAN should reuse proven architectural patterns from `tracerxbrhd/undergammon` where the problem is genuinely the same: Telegram authentication, internal accounts, bot launch/invite flows, matchmaking/challenges, typed realtime communication, reconnect, durable match recovery, history/rating patterns, CI, and deployment.

It must not copy backgammon-specific domain abstractions or prematurely extract a generic multi-game platform.

## Repository shape

The accepted pnpm TypeScript monorepo shape is now established:

```text
apps/
  miniapp/
  bot/
  server/

packages/
  game-engine/
  protocol/

docs/
  product/
  architecture/
  development/
```

Do not add Nx or Turborepo without a concrete measured need.

## Game engine

`packages/game-engine` owns deterministic card-game rules and state transitions.

It must not depend on:

- React;
- Telegram APIs;
- HTTP/WebSocket transports;
- Fastify or other server frameworks;
- PostgreSQL/database code;
- wall-clock time;
- presentation/animation code.

The implemented engine models:

- cards and stable card identity/ownership;
- decks, hands, discard state, and public table state;
- legal actions;
- special-card effects;
- turn/state transitions;
- victory and deck-exhaustion resolution;
- invariant validation;
- rule-domain events;
- explicit player-safe projections.

Durable storage is owned by the server persistence layer. The engine contributes its own state schema version and invariant validation but remains unaware of PostgreSQL or snapshot envelopes.

Randomness is injected. The engine must not be the live entropy authority.

Use strict types and discriminated unions for actions/events rather than generic untyped payloads.

## Server

`apps/server` is authoritative for:

- authentication/session resolution;
- player-to-player match entry;
- deck construction validation where applicable;
- shuffle/deck order;
- draws and private hands;
- legal command acceptance;
- committed match state and state version;
- timers/deadlines;
- match result/finalization;
- future rating/progression/economy effects.

The match-service implementation owns secure starter-deck shuffle/mulligan, starting-seat selection, authoritative match state, `stateVersion`, command idempotency, stale rejection, game-engine application, lifecycle finalization, durable connection/deadline state, and per-player snapshot projection.

`MatchStore` remains the storage boundary. `InMemoryMatchStore` is retained for focused tests, while `PostgresMatchStore` durably stores versioned authoritative JSONB snapshots and preserves compare-and-set/idempotency semantics across process restarts. It can also enumerate active match IDs for lifecycle sweeps and restart recovery, and it may be transaction-bound when an outer server operation must atomically create a match with another durable transition.

The runtime provides liveness/readiness, Telegram `initData` authentication, provider-independent account resolution, opaque application sessions, `/api/me`, logout, durable casual matchmaking/private challenge routes, and authenticated `/ws` gameplay transport. Match entry resolves ownership from the same application session, uses internal CARAVAN account UUIDs, stores private invite tokens only by SHA-256 hash, and delegates actual game creation to the existing authoritative `MatchService`. Realtime reuses the application session cookie, establishes one controlling socket per account/match, broadcasts only viewer-specific fresh projections, persists connect/disconnect/deadline changes through the same CAS boundary, and recovers stale socket-presence state after restart.

The server must never accept client-provided game state or client-provided Telegram identity fields as authoritative.

A modular monolith is preferred initially. Do not add microservices, Redis, queues, Kafka/RabbitMQ, Kubernetes, or distributed coordination infrastructure without an objective need.

See [`06-authoritative-match-service.md`](06-authoritative-match-service.md) for the service boundary, [`07-durable-match-persistence.md`](07-durable-match-persistence.md) for durable storage/recovery, [`08-authenticated-server-runtime.md`](08-authenticated-server-runtime.md) for HTTP/authentication/session boundaries, [`09-authenticated-realtime-runtime.md`](09-authenticated-realtime-runtime.md) for WebSocket/reconnect/deadline behavior, and [`10-match-entry.md`](10-match-entry.md) for casual/private match entry behavior.

## Protocol

`packages/protocol` contains only contracts genuinely shared between clients and the server: versioned command/server-message envelopes, sanitized player views, stable identifiers/error codes, match lifecycle result shapes, match-entry request/response shapes, and strict runtime boundary schemas.

The initial protocol is implemented with TypeScript + Zod and depends on the game engine only for stable shared domain contracts. It deliberately has no wire schema for privileged `CaravanGameState`; snapshots carry only sanitized `PlayerView` plus server-owned public lifecycle metadata.

It must not become a generic `shared` dumping ground and must not duplicate game rules.

See [`05-protocol-contracts.md`](05-protocol-contracts.md) for gameplay wire-boundary decisions and [`10-match-entry.md`](10-match-entry.md) for the match-entry HTTP boundary.

## Data

PostgreSQL is the durable source of truth for authoritative match persistence, account identity mapping, application sessions, casual queue membership, and private challenge lifecycle unless an accepted architecture decision changes it.

Use internal domain account IDs. Telegram user IDs belong only to `account_identities` as external provider subjects and must not become gameplay or match-entry ownership keys.

Authoritative match state is stored as a versioned JSONB snapshot suitable for recovery after a normal process/container restart. Complex game state is not decomposed into relational rows merely to make the schema look normalized when JSONB is the correct persistence boundary.

The PostgreSQL `MatchStore` adapter preserves compare-and-set state-version semantics in one conditional update and persists processed command identity, connection flags, and authoritative deadlines in the same authoritative snapshot as accepted state. Persistence envelope versioning is separate from the game-engine state schema version, and restored snapshots are runtime-validated before use.

Application sessions are cryptographically random opaque tokens delivered through an `HttpOnly` cookie. PostgreSQL stores only token hashes plus expiration/revocation state; raw session tokens and raw Telegram `initData` are not persisted. Private challenge invite tokens follow the same secret-minimization principle: the raw token is returned to the creator, while PostgreSQL stores only its SHA-256 hash.

Committed SQL migrations under `apps/server/migrations/` are the supported database schema-evolution path. PostgreSQL 18 is used by the local Docker Compose service and CI integration environment.

## Client

The Mini App should be a thin authoritative-game client: it renders sanitized server state, collects intent, manages presentation/draft UI state, animates confirmed transitions, and resynchronizes from fresh server projections after reconnect.

Telegram-specific behavior belongs behind a platform adapter. The initial adapter now owns raw `initData`, `ready()`, and `expand()` access, while authentication bootstrap is kept outside gameplay/presentation state.
