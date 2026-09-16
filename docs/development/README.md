# Development

CARAVAN has its pnpm/TypeScript workspace scaffold, deterministic `packages/game-engine` rules implementation, and initial typed/runtime-validated `packages/protocol` wire contracts. Backend, bot, authentication, persistence, realtime multiplayer, and production deployment behavior remain intentionally unimplemented unless later documentation says otherwise.

## Before implementation work

Read the documentation map in [`../README.md`](../README.md), then at minimum read the contracts relevant to the task.

For gameplay, server, protocol, or match-client implementation, the required baseline is:

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
- Zod 4 for runtime protocol validation;
- React 19 + Vite 8 for the Mini App shell.

Dependency upgrades should be deliberate and verified rather than mixed into unrelated gameplay work.

## Workspace layout

```text
apps/
  miniapp/       React/Vite client shell
  bot/           Telegram bot application boundary
  server/        authoritative backend application boundary

packages/
  game-engine/   implemented deterministic CARAVAN rules engine
  protocol/      implemented initial client/server wire contracts
```

`packages/game-engine` owns the canonical deterministic card-rule behavior. It exposes initialization from server-supplied deck order/starting seat, legal actions, state transitions, route/lane evaluation, invariant checking, rule-domain events, and player-safe projections.

`packages/protocol` owns strict versioned wire schemas for gameplay/surrender/resync commands, sanitized `PlayerView` snapshots, match lifecycle results, and stable rejection/error payloads. It deliberately exposes no wire schema for privileged `CaravanGameState`.

`bot` and `server` still intentionally contain no fake runtime/domain implementation. Their package/build boundaries exist so later focused PRs can add real behavior without redesigning the workspace.

The engine does not generate live randomness and does not own surrender, timeout, reconnect, persistence, WebSocket broadcasting, or server command idempotency/state-version semantics. The protocol describes those boundaries but does not implement their server-side semantics.

## Setup

Use Node.js 24 and pnpm 12.

```bash
pnpm install
```

The repository enforces supported Node/pnpm major versions through `package.json` and `.npmrc`.

## Commands

```bash
pnpm dev:miniapp
```

Runs the current Vite Mini App shell.

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

The game engine and protocol have substantive automated tests. Vitest still permits zero tests globally only because scaffold-only apps do not yet have behavior worth testing. Do not add meaningless placeholder tests merely to increase a count.

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

Changes to client/server contracts should add or update tests in `packages/protocol/test/`.

Protocol tests protect:

- strict protocol/version/identifier validation;
- client commands never carrying replacement game state;
- real engine `PlayerView` remaining wire-compatible;
- privileged authoritative state remaining non-serializable through protocol schemas;
- opponent hand and future deck data being rejected as unknown wire fields;
- server match lifecycle results remaining separate from pure rule-engine outcomes;
- stable engine rule error codes remaining synchronized with rejection payloads.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node.js 24. The required verification sequence is frozen dependency install, build, lint, formatting check, strict typecheck, tests, and a production dependency audit.

CI should grow only when the corresponding implementation exists. PostgreSQL services, Playwright, Docker validation, migrations, and deployment checks belong in later PRs that actually introduce those capabilities.

## Development principles

- inspect current `main` and accepted docs before editing;
- prefer focused PRs with a clear blast radius;
- update docs alongside decisions that materially change product or architecture;
- keep hidden-information security testable and explicit;
- keep card ownership stable and explicit when modifiers cross player routes;
- do not duplicate rules between server, protocol, and UI;
- keep surrender/timeout/reconnect lifecycle out of the pure card-rule action model;
- do not introduce infrastructure for hypothetical scale;
- never make the client authoritative merely to simplify a UI prototype.
