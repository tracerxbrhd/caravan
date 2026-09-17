# Development

CARAVAN has its pnpm/TypeScript workspace scaffold, deterministic `packages/game-engine` rules implementation, typed/runtime-validated `packages/protocol` contracts, authoritative match-service domain layer, PostgreSQL-backed durable match persistence, authenticated Fastify HTTP runtime, authenticated WebSocket realtime runtime, durable match-entry runtime in `apps/server`, and a thin Telegram entry runtime in `apps/bot`. Telegram `initData` authentication, provider-independent accounts, PostgreSQL-backed application sessions, casual matchmaking, private challenges, reconnect/deadline lifecycle, bot `/start`/webhook/deep-link entry, and the Mini App authentication bootstrap are implemented. Mini App Play/match-entry/realtime orchestration, the legal-action-driven interactive card table, the optional visual rules guide, authoritative match results, durable direct rematches, tactile transition/audio/haptic presentation, production Docker/manual deployment, deploy-time Telegram Bot API wiring, terminal reconnect handling, session recovery, and authoritative deadline presentation are implemented. BotFather Main Mini App setup and the two-real-account production acceptance run remain operator steps rather than claimed automated validation.

## Before implementation work

Read the documentation map in [`../README.md`](../README.md), then at minimum read the contracts relevant to the task.

For gameplay, server, protocol, persistence, authentication, realtime, match-entry, or match-client implementation, the required baseline is:

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
15. [`../architecture/09-authenticated-realtime-runtime.md`](../architecture/09-authenticated-realtime-runtime.md)
16. [`../architecture/10-match-entry.md`](../architecture/10-match-entry.md)
17. [`../architecture/11-telegram-entry.md`](../architecture/11-telegram-entry.md)
18. [`../architecture/12-miniapp-play-flow.md`](../architecture/12-miniapp-play-flow.md)
19. [`../architecture/13-interactive-card-table.md`](../architecture/13-interactive-card-table.md)
20. [`../architecture/14-rules-guide.md`](../architecture/14-rules-guide.md)
21. [`../architecture/15-results-and-rematch.md`](../architecture/15-results-and-rematch.md)
22. [`../architecture/16-tactile-game-feel.md`](../architecture/16-tactile-game-feel.md)
23. [`../architecture/17-production-docker-and-deployment.md`](../architecture/17-production-docker-and-deployment.md)
24. [`../architecture/18-production-telegram-wiring.md`](../architecture/18-production-telegram-wiring.md)
25. [`../architecture/19-first-playable-hardening.md`](../architecture/19-first-playable-hardening.md)

Before declaring the first playable production-validated, also follow [`first-playable-acceptance.md`](first-playable-acceptance.md).

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
- `@fastify/cookie`, `@fastify/rate-limit`, and `@fastify/websocket` for the authenticated server runtime;
- PostgreSQL 18;
- `pg` + Drizzle PostgreSQL migrator for durable server persistence;
- React 19 + Vite 8 for the Mini App shell.

Dependency upgrades should be deliberate and verified rather than mixed into unrelated gameplay work.

## Workspace layout

```text
apps/
  miniapp/       React/Vite Play + auth/match-entry/realtime + table + results/rematch
  bot/           Telegram webhook + Mini App entry/deep-link runtime
  server/        authenticated HTTP/WS + entry/rematch + authoritative match service + PostgreSQL

packages/
  game-engine/   implemented deterministic CARAVAN rules engine
  protocol/      implemented client/server gameplay and match-entry contracts
```

`packages/game-engine` owns the canonical deterministic card-rule behavior. It exposes initialization from server-supplied deck order/starting seat, legal actions, state transitions, route/lane evaluation, invariant checking, rule-domain events, and player-safe projections.

`packages/protocol` owns strict versioned wire schemas for gameplay/surrender/resync commands, sanitized `PlayerView` snapshots, match lifecycle results, protocol errors, stable rejection payloads, and match-entry response/request shapes. It deliberately exposes no wire schema for privileged `CaravanGameState`.

`apps/server` owns equal starter-deck construction, crypto-backed Fisher-Yates/mulligan and starting-seat selection, match ownership, `stateVersion`, processed command identity, stale/duplicate rejection, CAS concurrency, game-engine execution, surrender/timeout/no-contest finalization, per-player protocol snapshots, versioned authoritative persistence, migrations, PostgreSQL-backed restart recovery, Fastify HTTP/WS runtime, Telegram `initData` verification, internal account identity, application sessions, durable casual matchmaking, private challenge lifecycle, durable rematch coordination, controlling socket ownership, heartbeat, reconnect grace, and turn deadlines.

`InMemoryMatchStore` remains useful for focused unit/service tests. `PostgresMatchStore` is the durable adapter and must preserve the same compare-and-set/idempotency contract. It may also be bound to a PostgreSQL transaction when a surrounding server operation such as match entry must atomically create a match together with its own durable transition. Raw authoritative snapshots contain hidden information and must never become client payloads.

Telegram user IDs are external identity subjects only. Gameplay and match-entry ownership use internal CARAVAN account UUIDs. Raw Telegram `initData`, session tokens, cookies, invite tokens, and authorization material must never be logged or stored as ordinary application data. Private invite tokens are stored only by SHA-256 hash.

`bot` exposes a minimal Telegram webhook runtime with `/start`, Mini App launch buttons, challenge deep-link fallback, and `/health`; it remains non-authoritative for accounts, challenges, and gameplay. `server` exposes authenticated HTTP match-entry routes and `/ws` for authenticated gameplay realtime. The Mini App consumes validated launch context, restores/renews casual matchmaking, creates and resolves private challenge flows, connects through a validated RESYNC/reconnect WebSocket client, and renders an interactive table directly from sanitized `PlayerView` plus server-projected `legalActions`. The optional visual rules guide is also implemented and remains available before and during matches. Finished snapshots produce the player-facing result surface and durable same-opponent rematch handshake without adding another gameplay transport. Confirmed public-card transitions, procedural original audio, platform haptics, persistent presentation preferences, reduced-motion fallback, explicit terminal-connection recovery and server-clock-anchored deadline countdowns provide the first-playable presentation layer without changing server authority or hidden-information boundaries.

The engine does not generate live randomness and does not own surrender, timeout, reconnect, persistence, authentication, matchmaking, private challenges, WebSocket broadcasting, or server command idempotency/state-version semantics. The protocol describes gameplay and match-entry wire boundaries; the server service, persistence adapters, and runtime implement authoritative command/state/storage/authentication/realtime/match-entry semantics.

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

Set a real Telegram bot token in `.env` when exercising Telegram authentication. Realtime and match-entry defaults are also configurable there:

```text
TURN_TIMEOUT_SECONDS=60
RECONNECT_GRACE_SECONDS=30
MATCHMAKING_LEASE_SECONDS=90
CHALLENGE_TTL_SECONDS=900
REMATCH_TTL_SECONDS=900
BOT_USERNAME=replace_with_bot_username
VITE_TELEGRAM_BOT_USERNAME=replace_with_bot_username
BOT_HOST=0.0.0.0
BOT_PORT=3001
TELEGRAM_WEBHOOK_SECRET=replace_with_high_entropy_webhook_secret_32_chars
```

Export/load the environment, then build the workspace and apply committed migrations:

```bash
pnpm build
pnpm --filter @caravan/server db:migrate
```

`compose.yaml` intentionally remains the lightweight local PostgreSQL dependency. The deployable application stack lives in `compose.production.yaml`; see [`production-deployment.md`](production-deployment.md) for production setup, rollout and rollback commands.

## Running the current server runtime

After building and loading `.env` into the process environment:

```bash
pnpm start:server
```

The server defaults to `0.0.0.0:3000` and exposes:

```text
GET    /health
GET    /ready
POST   /api/auth/telegram
GET    /api/me
POST   /api/logout
GET    /api/matchmaking
POST   /api/matchmaking/join
POST   /api/matchmaking/heartbeat
DELETE /api/matchmaking
POST   /api/challenges
GET    /api/challenges/:challengeId
POST   /api/challenges/accept
POST   /api/challenges/decline
POST   /api/challenges/:challengeId/cancel
GET    /api/matches/:matchId/rematch
POST   /api/matches/:matchId/rematch
DELETE /api/matches/:matchId/rematch
GET    /ws   (WebSocket upgrade)
```

Match-entry HTTP endpoints require the same `caravan_session` cookie as `/api/me`. Casual matchmaking uses a bounded durable queue lease. Creating a private challenge leaves casual matchmaking and returns a high-entropy invite token once; joining casual matchmaking cancels the account's pending outgoing challenge. Challenge acceptance, casual pairing, and a mutually accepted rematch all create gameplay state only through the existing authoritative `MatchService`. Rematch requests are durable, source-match-scoped, and require both finished-match participants before one fresh match is created.

The WebSocket endpoint requires the existing `caravan_session` cookie and the configured `PUBLIC_ORIGIN`. Gameplay identity is resolved from that session; clients do not send Telegram IDs or replacement account identity in realtime commands.

A match participant uses `RESYNC` to establish/take over control for a match and receive a fresh sanitized snapshot. State-changing commands are accepted only from the controlling socket. Before the match has started — while no authoritative turn deadline exists because both players have not connected yet — the realtime boundary returns `MATCH_NOT_READY` rather than allowing early play. Once the match has started, a later opponent disconnect does not freeze the connected active player; reconnect grace is enforced independently by the server.

In local development Vite proxies both `/api` and `/ws` to `127.0.0.1:3000`, so the implemented Play flow exercises the same authenticated HTTP and realtime boundaries as production composition will expose.

Production requires an HTTPS `PUBLIC_ORIGIN`. Production requests are checked against the configured public Host, mutations remain same-origin, and `/ws` validates the Origin during upgrade. The production server trusts forwarded client addressing only when `NODE_ENV=production`, matching the deployment contract where the server has no host port and is reachable only through the trusted Caddy edge.

## Commands

```bash
pnpm dev:miniapp
pnpm start:server
pnpm start:bot
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

PostgreSQL integration tests run when `DATABASE_URL` is available. CI additionally sets `CARAVAN_REQUIRE_DATABASE_TESTS=1`, so database coverage cannot silently skip there. CI test files run serially because multiple database integration suites intentionally truncate the same isolated test database between cases; this prevents cross-file test races without changing normal application concurrency behavior.

The game engine, protocol, authoritative match service, durable match store, Telegram verifier, server configuration, authenticated HTTP runtime, match-entry lifecycle, realtime lifecycle, actual WebSocket transport, Telegram bot entry runtime, production Telegram wiring, Mini App API/realtime boundaries, terminal reconnect behavior, deadline presentation, bootstrap retry behavior, card-table legal-action affordance model, rules-guide presentation, result presentation, tactile presentation feedback, and rematch concurrency/API lifecycle have substantive automated tests. Vitest still permits zero tests globally only because remaining scaffold-only apps do not yet have behavior worth testing. Do not add meaningless placeholder tests merely to increase a count.

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

Changes to client/server gameplay or match-entry contracts should add or update tests in `packages/protocol/test/` and, where runtime behavior is affected, `apps/server/test/`.

Tests protect:

- strict protocol/version/identifier validation;
- client commands never carrying replacement game state;
- real engine `PlayerView` remaining wire-compatible;
- privileged authoritative state remaining non-serializable through protocol schemas;
- opponent hand and future deck data being rejected as unknown wire fields;
- server match lifecycle results remaining separate from pure rule-engine outcomes;
- stable engine rule error codes remaining synchronized with rejection payloads;
- WebSocket malformed/unsupported-version input failing through stable protocol errors;
- match-entry responses remaining strict and free of privileged authoritative state;
- invite-token syntax remaining explicit and runtime validated.

## Match-service, persistence, match-entry, and realtime testing baseline

Changes to authoritative match semantics, persistence, match entry, or realtime lifecycle should add or update tests in `apps/server/test/`.

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
- persistence metadata divergence failing closed;
- durable casual queue lease behavior and FIFO pairing;
- simultaneous queue joins producing one pairing rather than stranded duplicates;
- private challenge retry idempotency and single-winner acceptance races;
- private invite tokens being hashed at rest and absent from match state;
- queue/challenge mode switching and casual-vs-private concurrency producing at most one active match;
- challenge expiry becoming durable rather than remaining an indefinitely pending row;
- authenticated match-entry HTTP routes using the existing application-session boundary;
- durable connect/disconnect/reconnect transitions;
- turn/reconnect deadline expiration and idempotent finalization;
- restart recovery of process-local connection state;
- authenticated real WebSocket handshake and `RESYNC`;
- controlling-socket takeover and stale-socket rejection;
- pre-start match-readiness rejection until both players have connected;
- legal active-player commands remaining accepted while the opponent is inside reconnect grace;
- per-recipient WebSocket snapshots not exposing the opponent hand;
- accepted realtime mutations being durable before peer broadcast.

## Authentication/runtime testing baseline

Authentication or HTTP/runtime changes should protect:

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
- secret values remaining outside ordinary logs/error responses;
- match-entry endpoints resolving internal account identity from the same session cookie;
- WebSocket authentication reusing the same application session/account boundary;
- session revocation/disablement not leaving an already-open socket permanently authorized.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`, and can also be reused by the manual production deployment workflow. It uses Node.js 24 and PostgreSQL 18, performs frozen dependency installation, validates both local and production Compose configurations, builds the workspace, applies committed database migrations, runs the build/lint/format/typecheck/test gate and production dependency audit, builds all production image targets, validates Caddy configuration, then boots the complete production Compose stack and probes the static app plus `/health` and `/ready` through the web edge.

`CARAVAN_REQUIRE_DATABASE_TESTS=1` makes PostgreSQL integration coverage mandatory in CI. The committed `.env.production.example` contains only non-production smoke-test values; real deployment secrets remain outside Git.

## Development principles

- inspect current `main` and accepted docs before editing;
- prefer focused PRs with a clear blast radius;
- update docs alongside decisions that materially change product or architecture;
- keep hidden-information security testable and explicit;
- keep Telegram identity separate from internal account ownership;
- never trust `initDataUnsafe` or client-supplied Telegram identity data;
- never persist or log raw `initData`, raw session tokens, or raw private invite tokens;
- keep card ownership stable and explicit when modifiers cross player routes;
- do not duplicate rules between server, protocol, persistence, transport, and UI;
- keep surrender/timeout/reconnect lifecycle out of the pure card-rule action model;
- check duplicate command identity before stale-version rejection so retries remain idempotent;
- persist authoritative state before realtime broadcast;
- generate a fresh player-specific projection for each WebSocket recipient;
- treat socket ownership as process-local control, not durable gameplay identity;
- preserve absolute server deadlines in durable match state;
- validate persisted snapshots on both write and restore;
- serialize match-entry races at the server/database boundary rather than trusting client UI state;
- use committed migrations rather than ad-hoc production schema changes;
- keep production secrets outside images, Git and ordinary logs;
- do not introduce infrastructure for hypothetical scale;
- never make the client authoritative merely to simplify a UI prototype.
