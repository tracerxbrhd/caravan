# Contributing to CARAVAN

CARAVAN is early in development, so accepted repository documentation is part of the implementation contract rather than background reading.

Before making a substantial change:

1. read `AGENTS.md`;
2. follow the documentation map in `docs/README.md`;
3. inspect the current code and tests instead of assuming planned behavior already exists.

## Local verification

Use Node.js 24 and pnpm 12.

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs the repository build, lint, formatting check, strict typecheck, and automated tests.

To run the current Mini App shell locally:

```bash
pnpm dev:miniapp
```

## Pull requests

Keep pull requests focused. Update product or architecture documentation in the same change when implementation materially changes an accepted decision.

Do not introduce Fallout/Bethesda assets or copied expression, client-authoritative gameplay, hidden-information leakage, speculative infrastructure, or rule behavior that silently contradicts `docs/product/05-game-rules.md`.
