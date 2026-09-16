# CARAVAN Agent Guide

## Start here

CARAVAN is a Telegram-first competitive online card game with an original identity and independent implementation.

Before substantial changes:

1. inspect current `main`;
2. read the relevant current documents under `docs/product/`, `docs/architecture/`, and `docs/development/`;
3. inspect real code and tests before assuming behavior.

Accepted repository documentation is the long-term source of truth. Prefer newer and more specific accepted decisions when documents conflict. Direct instructions for the current task take precedence. Do not describe planned behavior as implemented.

## UNDERGAMMON reference

`tracerxbrhd/undergammon` is a proven reference for Telegram auth, accounts, matchmaking, challenges, realtime, reconnect, persistence, rating/history, CI, and deployment.

Reuse patterns when they solve the same problem. Do not turn CARAVAN into an UNDERGAMMON fork and do not carry over backgammon-specific abstractions.

## Non-negotiable boundaries

- Original branding, wording, art, audio, UI, and implementation.
- Do not use Fallout/Bethesda assets, franchise characters/factions/logos/dialogue/music/SFX, extracted files, copied UI, source code, or copied rulebook text.
- `packages/game-engine` must be deterministic and framework-free.
- The server is authoritative for shuffle/deck order, draws, hands, legal actions, committed state, timers, and results.
- Hidden information is a security boundary: never send authoritative state containing opponent hands or future deck order directly to clients.
- Client commands use authenticated ownership plus command/state-version validation; duplicate retries must not apply twice.
- Persist accepted authoritative state before broadcasting it.
- Telegram APIs stay behind a platform adapter and must not leak into game rules.
- PostgreSQL is the durable source of truth unless an accepted decision changes it.
- Do not add microservices, Redis, queues, Kubernetes, Nx, or Turborepo without a measured or documented need.

## Quality

Use strict TypeScript. Avoid `any`, `@ts-ignore`, duplicated rules, hidden global state, and fake security/gameplay implementations.

Game rules require unit/regression/property coverage for invariants and edge cases. Server integration tests should cover stale/duplicate commands, hidden-information isolation, reconnect/recovery, concurrency, and finalization.

Run the repository's available format, lint, typecheck, tests, and builds before substantial work is considered complete.
