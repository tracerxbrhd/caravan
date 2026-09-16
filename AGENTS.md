# CARAVAN Agent Guide

## Start here

CARAVAN is a Telegram-first competitive online card game with an original identity and independent implementation.

Before substantial changes:

1. inspect current `main`;
2. read the relevant current documents under `docs/product/`, `docs/architecture/`, and `docs/development/`;
3. inspect real code and tests before assuming behavior.

Accepted repository documentation is the long-term source of truth. Prefer newer and more specific accepted decisions when documents conflict. Direct instructions for the current task take precedence. Do not describe planned behavior as implemented.

For gameplay behavior, `docs/product/05-game-rules.md` is normative until intentionally amended. Do not encode a different rule in UI, server code, protocol code, or tests without updating that document. `docs/product/06-first-playable-scope.md` defines the current vertical-slice boundary; deferred features must not quietly become blockers for the first playable.

`docs/README.md` is the documentation map.

## README policy

The repository root `README.md` is the public-facing front page of CARAVAN, not an internal technical document.

Keep it product-oriented: what the game is, why it is interesting, current public status, player-facing features, visual identity, supported/planned platforms, and essential public notices.

Do not turn the root README into an architecture index, repository tree dump, implementation plan, dependency list, internal workflow guide, or engineering changelog. Put technical detail in `docs/architecture/`, contributor/development detail in `docs/development/`, and product decisions in `docs/product/`.

## UNDERGAMMON reference

`tracerxbrhd/undergammon` is a proven reference for Telegram auth, accounts, matchmaking, challenges, realtime, reconnect, persistence, rating/history, CI, and deployment.

Reuse patterns when they solve the same problem. Do not turn CARAVAN into an UNDERGAMMON fork and do not carry over backgammon-specific abstractions.

## Non-negotiable boundaries

- Original branding, wording, art, audio, UI, and implementation.
- Do not use Fallout/Bethesda assets, franchise characters/factions/logos/dialogue/music/SFX, extracted files, copied UI, source code, or copied rulebook text.
- `packages/game-engine` must be deterministic and framework-free.
- The server is authoritative for shuffle/deck order, starting seat, draws, hands, legal actions, committed state, timers, and results.
- Hidden information is a security boundary: never send authoritative state containing opponent hands or future/rejected deck order directly to clients.
- Card ownership is immutable for a match; opponent-owned modifiers may sit on a route but return to their original owner's discard pile when removed.
- Public discard information must not be accidentally treated as hidden state.
- Client commands use authenticated ownership plus command/state-version validation; duplicate retries must not apply twice.
- Surrender/timeout/reconnect lifecycle belongs to the authoritative server layer, not the pure card-rule action model.
- Persist accepted authoritative state before broadcasting it.
- Telegram APIs stay behind a platform adapter and must not leak into game rules.
- PostgreSQL is the durable source of truth unless an accepted decision changes it.
- Do not add microservices, Redis, queues, Kubernetes, Nx, or Turborepo without a measured or documented need.

## Quality

Use strict TypeScript. Avoid `any`, `@ts-ignore`, duplicated rules, hidden global state, and fake security/gameplay implementations.

Game rules require unit/regression/property coverage for invariants and edge cases. Server integration tests should cover stale/duplicate commands, hidden-information isolation, reconnect/recovery, lifecycle deadlines, concurrency, and idempotent finalization.

Run the repository's available format, lint, typecheck, tests, and builds before substantial work is considered complete.
