# 01. Technical Foundation

## Status

Accepted as the initial architecture direction. The repository is currently pre-implementation; concrete dependencies and versions must be verified when scaffolding begins.

## Reference architecture

CARAVAN should reuse proven architectural patterns from `tracerxbrhd/undergammon` where the problem is genuinely the same: Telegram authentication, internal accounts, bot launch/invite flows, matchmaking/challenges, typed realtime communication, reconnect, durable match recovery, history/rating patterns, CI, and deployment.

It must not copy backgammon-specific domain abstractions or prematurely extract a generic multi-game platform.

## Repository shape

Prefer a pnpm TypeScript monorepo:

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

The engine should explicitly model:

- cards and card identity;
- decks, hands, discard state, and public table state;
- legal actions;
- special-card effects;
- turn/state transitions;
- victory resolution;
- invariant validation;
- serialization/schema evolution where required.

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

`packages/protocol` contains only contracts genuinely shared between clients and the server: versioned command/event envelopes, sanitized player views, stable enums/identifiers, and boundary schemas.

It must not become a generic `shared` dumping ground and must not duplicate game rules.

## Data

PostgreSQL is the intended durable source of truth unless an accepted architecture decision changes it.

Use internal domain account IDs. Telegram user IDs belong to external identity records and must not become gameplay ownership keys.

Authoritative active-match state may be stored as a versioned snapshot suitable for recovery after a normal process/container restart. Complex game state should not be decomposed into relational rows merely to make the schema look normalized when JSONB is the better persistence boundary.

## Client

The Mini App should be a thin authoritative-game client: it renders sanitized server state, collects intent, manages presentation/draft UI state, animates confirmed transitions, and resynchronizes from fresh server projections after reconnect.

Telegram-specific behavior belongs behind a platform adapter.
