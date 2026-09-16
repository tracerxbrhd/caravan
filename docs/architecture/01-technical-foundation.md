# 01. Technical Foundation

## Status

Accepted as the initial architecture direction. The repository scaffold implements the agreed pnpm/TypeScript monorepo boundaries; concrete runtime behavior is added only through focused changes.

As of 2026-09-16, `apps/miniapp`, `apps/bot`, `apps/server`, `packages/game-engine`, and `packages/protocol` exist as buildable workspace packages. The deterministic game engine is implemented and `packages/protocol` now implements the initial typed/runtime-validated wire contracts. The Mini App remains a minimal React/Vite shell, while bot and server runtime behavior remain intentionally unimplemented rather than represented by fake placeholders.

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

Durable snapshot restore/schema migration remains a persistence-layer concern to add when persistence arrives.

Randomness is injected. The engine must not be the live entropy authority.

Use strict types and discriminated unions for actions/events rather than generic untyped payloads.

## Server

`apps/server` is authoritative for:

- deck construction validation where applicable;
- shuffle/deck order;
- draws and private hands;
- legal command acceptance;
- committed match state and state version;
- timers/deadlines;
- match result/finalization;
- future rating/progression/economy effects.

The server must never accept client-provided game state as authoritative.

A modular monolith is preferred initially. Do not add microservices, Redis, queues, Kafka/RabbitMQ, Kubernetes, or distributed coordination infrastructure without an objective need.

## Protocol

`packages/protocol` contains only contracts genuinely shared between clients and the server: versioned command/server-message envelopes, sanitized player views, stable identifiers/error codes, match lifecycle result shapes, and strict runtime boundary schemas.

The initial protocol is implemented with TypeScript + Zod and depends on the game engine only for stable shared domain contracts. It deliberately has no wire schema for privileged `CaravanGameState`; snapshots carry only sanitized `PlayerView` plus server-owned public lifecycle metadata.

It must not become a generic `shared` dumping ground and must not duplicate game rules.

See [`05-protocol-contracts.md`](05-protocol-contracts.md) for the normative wire-boundary decisions.

## Data

PostgreSQL is the intended durable source of truth unless an accepted architecture decision changes it.

Use internal domain account IDs. Telegram user IDs belong to external identity records and must not become gameplay ownership keys.

Authoritative active-match state may be stored as a versioned snapshot suitable for recovery after a normal process/container restart. Complex game state should not be decomposed into relational rows merely to make the schema look normalized when JSONB is the better persistence boundary.

## Client

The Mini App should be a thin authoritative-game client: it renders sanitized server state, collects intent, manages presentation/draft UI state, animates confirmed transitions, and resynchronizes from fresh server projections after reconnect.

Telegram-specific behavior belongs behind a platform adapter.
