# Development

CARAVAN has its pnpm/TypeScript workspace scaffold, deterministic `packages/game-engine` rules implementation, typed/runtime-validated `packages/protocol` contracts, authoritative match-service domain layer, PostgreSQL-backed durable match persistence, and an authenticated Fastify HTTP runtime in `apps/server`. Telegram `initData` authentication, provider-independent accounts, PostgreSQL-backed application sessions, and the Mini App authentication bootstrap are implemented. Bot runtime, WebSocket transport/connection recovery, matchmaking, and production application deployment remain intentionally unimplemented unless later documentation says otherwise.

## Before implementation work

Read the documentation map in [`../README.md`](../README.md), then at minimum read the contracts relevant to the task.

For gameplay, server, protocol, persistence, authentication, or match-client implementation, the required baseline is:

1. [`../product/01-product-foundation.md`](../product/01-product-foundation.md)
2. [`../product/02-player-experience-and-platform-strategy.md`](../product/02-player-experience-and-platform-strategy.md)
3. [`../product/03-brand-and-ip-boundaries.md`](../product/03-brand-and-ip-boundaries.md)
4. [`../product/05-game-rules.md`](../product/05-game-rules.md) — normative gameplay rules
5. [`../product/06-first-playable-scope.md`](../product/06-first-playable-scope.md) — current vertical-slice boundary
6. [`../product/07-match-ux-and-tutorial.md`](../product/07-match-ux-and-tutorial.md)
7. [`../architecture/01-technical-foundation.md`](../architecture/01-technical-foundation.md)
8. [`../architecture/02-realtime-hidden-information-and-rng.md`](../architecture/02-realtime-hidden-information-and-rng.md)
9. [`../architecture/03-client-ux-and-portability.md`](../architecture/03-client-ux-and-portability.md)
10. [`../architecture/04-game-domain-model.md`](../architecture/04-game-domain-model.md)
11. [`../architecture/05-protocol-contracts.md`](../architecture/05-protocol-contracts.md)
12. [`../architecture/06-authoritative-match-service.md`](../architecture/06-authoritative-match-service.md)
13. [`../architecture/07-durable-match-persistence.md`](../architecture/07-durable-match-persistence.md)
14. [`../architecture/08-authenticated-server-runtime.md`](../architecture/08-authenticated-server-runtime.md)

`product/04-market-and-competitive-context.md` is useful product context but is not an implementation contract.

Do not implement a gameplay behavior that contradicts `product/05-game-rules.md` merely because another public Caravan implementation behaves differently. Change the normative rule document deliberately together with regression tests when a rule decision changes.

## Toolchain

The verified baseline follows the proven UNDERGAMMON architecture/tooling direction while using supported current majors for this repository:

- Node.js 24;
- pnpm 12.4.1;
- TypeScript 5.9;
- ESLint 10 with `typescript-eslint`;
- Prettier 3;
- Vitest 4;
- fast-check 4 for property tests;
- Zod 4 for runtime boundary validation;
- Fastify 5;
- `@fastify/cookie` and `@fastify/rate-limit` for the authenticated HTTP runtime;
- PostgreSQL 18;
- `pg` + Drizzle PostgreSQL migrator for durable server persistence;
- React 19 + Vite 8 for the Mini App shell.

Dependency upgrades should be deliberate and verified rather than mixed into unrelated gameplay work.

## Workspace layout

```text
apps/
  miniapp/       React/Vite shell + platform/auth bootstrap
  bot/           Telegram bot application boundary
  server/        authenticated HTTP runtime + authoritative match service + PostgreSQL persistence

packages/
  game-engine/   implemented deterministic CARAVAN rules engine
  protocol/      implemented initial client/server gameplay wire contracts
```

`packages/game-engine` owns the canonical deterministic card-rule behavior. It exposes initialization from server-supplied deck order/starting seat, legal actions, state transitions, route/lane evaluation, invariant checking, rule-domain events, and player-safe projections.

`packages/protocol` owns strict versioned wire schemas for gameplay/surrender/resync commands, sanitized `PlayerView` snapshots, match lifecycle results, and stable rejection/error payloads. It deliberately exposes no wire schema for privileged `CaravanGameState`.

`apps/server` owns equal starter-deck construction, crypto-backed Fisher-Yates/mulligan and starting-seat selection, match ownership, `stateVersion`, processed command identity, stale/duplicate rejection, CAS concurrency, game-engine execution, surrender/timeout/no-contest finalization primitives, per-player protocol snapshots, versioned authoritative persistence, migrations, PostgreSQL-backed restart recovery, Fastify HTTP runtime, Telegram `initData` verification, internal account identity, and application sessions.

`InMemoryMatchStore` remains useful for focused unit/service tests. `PostgresMatchStore` is the durable adapter and must preserve the same compare-and-set/idempotency contract. Raw authoritative snapshots contain hidden information and must never become client payloads.

Telegram user IDs are external identity subjects only. Gameplay ownership uses internal CARAVAN account UUIDs. Raw Telegram `initData`, session tokens, cookies, and authorization material must never be logged or stored as ordinary application data.

`bot` remains scaffold-only. `server` does not yet expose WebSocket gameplay transport, own live connection takeover/reconnect semantics, schedule reconnect/turn deadlines, or perform matchmaking.

The engine does not generate live randomness and does not own surrender, timeout, reconnect, persistence, authentication, WebSocket broadcasting, or server command idempotency/state-version semantics. The protocol describes gameplay wire boundaries; the server service, persistence adapters, and runtime implement authoritative command/state/storage/authentication semantics.

## Setup

Use Node.js 24 and pnpm 12.

```bash
pnpm install
```

The repository enforces supported Node/pnpm major versions through `package.json` and `.npmrc`.

For PostgreSQL-backed work, copy the example environment and start the local database:

```bash
cp .env.example .env
docker compose up -d db
```

Set a real Telegram bot token in `.env` when exercising Telegram authentication. Export/load the environment, then build the workspace and apply committed migrations:

```bash
pnpm build
pnpm --filter @caravan/server db:migrate
```

The Compose file intentionally contains PostgreSQL only at this stage. It is a reproducible development/integration-test dependency, not the final production deployment stack.

## Running the current HTTP runtime

After building and loading `.env` into the process environment:

```bash
pnpm start:server
```

The server defaults to `0.0.0.0:3000` and exposes:

```text
GET  /health
GET  /ready
POST /api/auth/telegram
GET  /api/me
POST /api/logout
```

In local development the Vite Mini App proxies `/api` to `127.0.0.1:3000`.

Production requires an HTTPS `PUBLIC_ORIGIN`. Production mutation requests are checked against that configured same origin and public Host.

## Commands

```bash
pnpm dev:miniapp
pnpm start:server
```

Run the Mini App shell and built server runtime respectively.

```bash
pnpm build
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test
```

Or run the full local verification gate:

```bash
pnpm verify
```

`pnpm format` writes formatting changes when needed.

PostgreSQL integration tests run when `DATABASE_URL` is available. CI additionally sets `CARAVAN_REQUIRE_DATABASE_TESTS=1`, so database coverage cannot silently skip there.

The game engine, protocol, authoritative match service, durable match store, Telegram verifier, server configuration, and authenticated HTTP runtime have substantive automated tests. Vitest still permits zero tests globally only because remaining scaffold-only apps do not yet have behavior worth testing. Do not add meaningless placeholder tests merely to increase a count.

## Game-engine testing baseline

Changes to canonical gameplay should normally add or update focused regression tests in `packages/game-engine/test/`.

Property tests protect cross-cutting invariants including:

- card-location uniqueness;
- immutable original ownership;
- generated legal actions remaining applicable;
- transition immutability;
- hidden-information projection not exposing opponent hands or future deck order.

Rule changes should update `docs/product/05-game-rules.md` and tests in the same PR rather than allowing documentation and executable behavior to drift.

## Protocol testing baseline

Changes to client/server gameplay contracts should add or update tests in `packages/protocol/test/`.

Protocol tests protect:

- strict protocol/version/identifier validation;
- client commands never carrying replacement game state;
- real engine `PlayerView` remaining wire-compatible;
- privileged authoritative state remaining non-serializable through protocol schemas;
- opponent hand and future deck data being rejected as unknown wire fields;
- server match lifecycle results remaining separate from pure rule-engine outcomes;
- stable engine rule error codes remaining synchronized with rejection payloads.

## Match-service and persistence testing baseline

Changes to authoritative match semantics or persistence should add or update tests in `apps/server/test/`.

Server tests protect:

- equal starter-deck construction and accepted opening hands;
- deterministic injected randomness in tests while live defaults use Node crypto;
- client-visible state always coming from `projectForPlayer` plus protocol validation;
- `stateVersion` advancing exactly once per accepted mutation;
- exact command retry not applying twice;
- reused command IDs with different payloads being rejected;
- stale commands receiving a fresh sanitized snapshot;
- concurrent same-version commands committing at most once;
- server lifecycle finishes remaining separate from pure game-engine results;
- full matches remaining playable through the service using projected legal actions only;
- authoritative PostgreSQL snapshot round-trip;
- atomic PostgreSQL same-version CAS races;
- accepted-command/idempotency recovery after pool/service recreation;
- persistence metadata divergence failing closed.

## Authentication/runtime testing baseline

Authentication or HTTP runtime changes should protect:

- valid Telegram HMAC verification;
- rejection of tampered, expired, future-dated, or ambiguous `initData`;
- fail-fast configuration validation;
- provider-independent account mapping;
- repeated Telegram authentication resolving the same CARAVAN account;
- raw session tokens never being persisted;
- session restore through `/api/me`;
- logout/revocation;
- disabled-account rejection;
- liveness and database readiness behavior;
- secret values remaining outside ordinary logs/error responses.

WebSocket authentication in the next realtime layer must reuse the application session/account boundary rather than accepting Telegram identity directly on gameplay commands.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node.js 24 and PostgreSQL 18. CI performs frozen dependency installation, validates `compose.yaml`, builds the workspace, applies committed database migrations, then runs the repository build/lint/format/typecheck/test gate and production dependency audit.

`CARAVAN_REQUIRE_DATABASE_TESTS=1` makes PostgreSQL integration coverage mandatory in CI. Playwright and production application-container/deployment checks should be added only when the corresponding runtime surfaces exist.

## Development principles

- inspect current `main` and accepted docs before editing;
- prefer focused PRs with a clear blast radius;
- update docs alongside decisions that materially change product or architecture;
- keep hidden-information security testable and explicit;
- keep Telegram identity separate from internal account ownership;
- never trust `initDataUnsafe` or client-supplied Telegram identity data;
- never persist or log raw `initData` or raw session tokens;
- keep card ownership stable and explicit when modifiers cross player routes;
- do not duplicate rules between server, protocol, persistence, and UI;
- keep surrender/timeout/reconnect lifecycle out of the pure card-rule action model;
- check duplicate command identity before stale-version rejection so retries remain idempotent;
- commit authoritative state and processed-command identity atomically before any future realtime broadcast;
- validate persisted snapshots on both write and restore;
- use committed migrations rather than ad-hoc production schema changes;
- do not introduce infrastructure for hypothetical scale;
- never make the client authoritative merely to simplify a UI prototype.
