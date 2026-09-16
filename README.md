# CARAVAN

CARAVAN is a Telegram-first competitive online card game built around Caravan gameplay principles with an original visual identity, original assets, and an independent implementation.

The initial client is a Telegram Mini App, used as the fastest way to validate the game with real players. The architecture is intended to preserve a straightforward path to standalone Android/iOS clients and a browser client without making Telegram part of the game domain.

> **Status:** product and architecture foundation. Gameplay implementation has not started yet.

## Product direction

- fast entry from Telegram into a real match;
- accurate, learnable rules with an interactive tutorial;
- server-authoritative multiplayer with reliable reconnect/recovery;
- casual and private play as first-class experiences;
- tactile card-table presentation through motion, layering, sound, and haptics;
- an original weathered frontier / trade-route identity;
- competitive fairness: no pay-to-win mechanics;
- portable application architecture rather than a Telegram-only game.

## Original identity and IP boundary

CARAVAN is not an official, licensed, or affiliated Fallout or Bethesda product.

The project does not use Fallout: New Vegas assets, characters, factions, logos, dialogue, music, sound effects, UI, source code, extracted game files, or copied rulebook text. Gameplay concepts are specified and implemented independently, while presentation, wording, art, audio, and branding remain original.

See [`docs/product/03-brand-and-ip-boundaries.md`](docs/product/03-brand-and-ip-boundaries.md).

## Intended repository shape

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

The implementation is expected to use a pnpm TypeScript monorepo unless an accepted architecture decision changes that direction.

## Documentation

- [`docs/product/01-product-foundation.md`](docs/product/01-product-foundation.md) — product vision, goals, scope, and non-goals.
- [`docs/product/02-player-experience-and-platform-strategy.md`](docs/product/02-player-experience-and-platform-strategy.md) — player experience, tutorial, tactile presentation, and platform path.
- [`docs/product/03-brand-and-ip-boundaries.md`](docs/product/03-brand-and-ip-boundaries.md) — original identity and IP constraints.
- [`docs/product/04-market-and-competitive-context.md`](docs/product/04-market-and-competitive-context.md) — dated competitor snapshot and validation rationale.
- [`docs/architecture/01-technical-foundation.md`](docs/architecture/01-technical-foundation.md) — initial technical direction and boundaries.
- [`docs/architecture/02-realtime-hidden-information-and-rng.md`](docs/architecture/02-realtime-hidden-information-and-rng.md) — authoritative multiplayer, hidden information, recovery, and shuffle security.
- [`docs/architecture/03-client-ux-and-portability.md`](docs/architecture/03-client-ux-and-portability.md) — client architecture, animation principles, and Android/iOS portability.

## Reference project

[`tracerxbrhd/undergammon`](https://github.com/tracerxbrhd/undergammon) is a proven reference for Telegram authentication, accounts, bot flows, matchmaking, challenges, realtime, reconnect, persistence, rating/history, CI, and deployment.

CARAVAN should reuse proven patterns where they fit, but it is a separate product and must not inherit backgammon-specific abstractions merely for code reuse.
