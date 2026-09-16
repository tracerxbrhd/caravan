# Development

CARAVAN now has its initial pnpm/TypeScript workspace scaffold. Gameplay, backend, bot, protocol, authentication, persistence, and multiplayer behavior are still intentionally unimplemented unless later documentation says otherwise.

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

`product/04-market-and-competitive-context.md` is useful product context but is not an implementation contract.

Do not implement a gameplay behavior that contradicts `product/05-game-rules.md` merely because another public Caravan implementation behaves differently. Change the normative rule document deliberately when a rule decision changes.

## Toolchain

The initial verified baseline intentionally follows the known-good UNDERGAMMON family rather than chasing every newest major release during bootstrap:

- Node.js 24;
- pnpm 12.4.1;
- TypeScript 5.9;
- ESLint 9 with `typescript-eslint`;
- Prettier 3;
- Vitest 4;
- React 19 + Vite 8 for the Mini App shell.

Dependency upgrades should be deliberate and verified rather than mixed into unrelated gameplay work.

## Workspace layout

```text
apps/
  miniapp/       React/Vite client shell
  bot/           Telegram bot application boundary
  server/        authoritative backend application boundary

packages/
  game-engine/   deterministic game-rule package boundary
  protocol/      client/server contract package boundary
```

`bot`, `server`, `game-engine`, and `protocol` intentionally contain no fake runtime/gameplay implementation at scaffold stage. Their package/build boundaries exist so later focused PRs can add real behavior without redesigning the workspace.

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

At scaffold stage Vitest is configured to allow zero tests; substantive tests become mandatory as real behavior is introduced. Do not add meaningless placeholder tests merely to increase a count.

## CI

`.github/workflows/ci.yml` runs on pull requests and pushes to `main` using Node.js 24. The required verification sequence is install, build, lint, formatting check, strict typecheck, tests, and a production dependency audit.

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
