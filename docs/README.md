# CARAVAN Documentation

This directory is the repository's long-term product, architecture, and development source of truth.

The root `README.md` is intentionally product-facing. Internal technical detail belongs here rather than on the repository front page.

## Product

- [`product/01-product-foundation.md`](product/01-product-foundation.md) — product vision, priorities, non-goals, and naming.
- [`product/02-player-experience-and-platform-strategy.md`](product/02-player-experience-and-platform-strategy.md) — tactile presentation, onboarding direction, Telegram-first launch, and standalone portability.
- [`product/03-brand-and-ip-boundaries.md`](product/03-brand-and-ip-boundaries.md) — original identity and IP constraints.
- [`product/04-market-and-competitive-context.md`](product/04-market-and-competitive-context.md) — dated market/competitor snapshot and validation rationale.
- [`product/05-game-rules.md`](product/05-game-rules.md) — normative canonical gameplay rules for implementation.
- [`product/06-first-playable-scope.md`](product/06-first-playable-scope.md) — required first vertical slice and explicit deferrals.
- [`product/07-match-ux-and-tutorial.md`](product/07-match-ux-and-tutorial.md) — match interaction, card-motion language, and interactive tutorial contract.

## Architecture

- [`architecture/01-technical-foundation.md`](architecture/01-technical-foundation.md) — intended monorepo/runtime/domain boundaries.
- [`architecture/02-realtime-hidden-information-and-rng.md`](architecture/02-realtime-hidden-information-and-rng.md) — authoritative realtime, security projection, recovery, and shuffle rules.
- [`architecture/03-client-ux-and-portability.md`](architecture/03-client-ux-and-portability.md) — client/platform adapter and cross-platform presentation direction.
- [`architecture/04-game-domain-model.md`](architecture/04-game-domain-model.md) — engine-facing card/route/action/state/projection domain contract.
- [`architecture/05-protocol-contracts.md`](architecture/05-protocol-contracts.md) — typed/runtime-validated wire commands, sanitized snapshots, lifecycle results, and rejection contracts.

## Development

- [`development/README.md`](development/README.md) — development entrypoint. Concrete commands should be added there only after the corresponding tooling exists.

## Precedence

When accepted documents appear to conflict:

1. direct user instruction for the current task wins;
2. newer and more specific accepted documentation wins over older/general documentation;
3. implementation must not silently contradict accepted product rules;
4. archived/historical material, if introduced later, is reference only unless explicitly promoted back into current documentation.

For gameplay specifically, `product/05-game-rules.md` is normative until intentionally amended.
