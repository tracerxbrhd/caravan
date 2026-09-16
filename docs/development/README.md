# Development

CARAVAN is currently in the product/architecture foundation stage. Application scaffolding and local-development commands have not been established yet.

## Before implementation work

Read:

1. [`../product/01-product-foundation.md`](../product/01-product-foundation.md)
2. [`../product/02-player-experience-and-platform-strategy.md`](../product/02-player-experience-and-platform-strategy.md)
3. [`../product/03-brand-and-ip-boundaries.md`](../product/03-brand-and-ip-boundaries.md)
4. [`../architecture/01-technical-foundation.md`](../architecture/01-technical-foundation.md)
5. [`../architecture/02-realtime-hidden-information-and-rng.md`](../architecture/02-realtime-hidden-information-and-rng.md)
6. [`../architecture/03-client-ux-and-portability.md`](../architecture/03-client-ux-and-portability.md)

Do not invent setup commands or describe dependencies as installed until the repository actually contains them.

## Expected quality baseline

Once implementation begins, the repository should establish and document commands for:

- formatting and format checks;
- linting;
- strict TypeScript typechecking;
- unit/regression/property tests for the game engine;
- server integration tests;
- production builds;
- key E2E player journeys where practical.

The exact tools and commands should be recorded here when they exist.

## Development principles

- inspect current `main` and accepted docs before editing;
- prefer focused PRs with a clear blast radius;
- update docs alongside decisions that materially change product or architecture;
- keep hidden-information security testable and explicit;
- do not duplicate rules between server, protocol, and UI;
- do not introduce infrastructure for hypothetical scale;
- never make the client authoritative merely to simplify a UI prototype.
