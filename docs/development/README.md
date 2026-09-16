# Development

CARAVAN is currently in the product/architecture foundation stage. Application scaffolding and local-development commands have not been established yet.

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

Do not invent setup commands or describe dependencies as installed until the repository actually contains them.

Do not implement a gameplay behavior that contradicts `product/05-game-rules.md` merely because another public Caravan implementation behaves differently. Change the normative rule document deliberately when a rule decision changes.

## Expected quality baseline

Once implementation begins, the repository should establish and document commands for:

- formatting and format checks;
- linting;
- strict TypeScript typechecking;
- unit/regression/property tests for the game engine;
- server integration tests for hidden information, stale/duplicate commands, reconnect/recovery, lifecycle deadlines, and finalization;
- production builds;
- key E2E player journeys where practical.

The exact tools and commands should be recorded here when they exist.

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
