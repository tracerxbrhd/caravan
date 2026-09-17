# 20. Mobile Match Stabilization

## Status

Accepted implementation boundary for PR23, the production follow-up after Telegram account rebinding made real two-account private matches reachable.

PR23 stabilizes the existing first-playable match surface before the table composition and hand interaction are redesigned in later PRs. It does not move gameplay authority into the Mini App and does not change hidden-information projections or the realtime wire protocol.

## Telegram viewport contract

The live match must use the platform adapter's computed content-safe insets on every supported viewport, including the narrow mobile override. Match-specific CSS must not fall back to raw `env(safe-area-inset-top)` and accidentally discard Telegram's content safe-area or the existing top-chrome fallback.

The match header is deliberately compact. Player-facing UI does not expose `stateVersion`; that value remains an internal protocol/concurrency detail.

PR23 reduces avoidable vertical padding and secondary-control footprint, but it intentionally keeps the current lane DOM structure. The three-caravan table recomposition belongs to the next visual PR so this stabilization change can remain reviewable and production-safe.

## Controlling-client ownership

Controlling WebSocket ownership remains keyed by internal `accountId + matchId` on the authoritative server.

Therefore:

- player A and player B have independent controlling sockets in the same match;
- opening a second client for player A may replace only player A's previous controller;
- replacing player A must not pause or disconnect player B;
- a replaced client does not automatically reconnect and steal control back;
- reclaiming control remains an explicit player action.

The Mini App represents this as an account-scoped screen takeover rather than wording that could imply the opponent took control. Presentation state is explicit (`OWNED`, `REPLACED`, `RECLAIMING`) and no longer inferred from an English rejection string.

## Private invite decline recovery

A player who opens a private challenge deep link must be able to decline it without being trapped on a generic error screen.

The server's normal authenticated decline route remains authoritative and is covered by integration tests. On the client, already-terminal invite outcomes (`CHALLENGE_NOT_FOUND`, `CHALLENGE_EXPIRED`, `CHALLENGE_UNAVAILABLE`) are treated as success-equivalent for the purpose of leaving the inbound invitation screen: there is nothing left to decline, so forcing a generic error page would be misleading.

Authentication failures are not swallowed. They still return to the normal Telegram/application-session recovery path.

## Explicit non-goals

PR23 does not implement:

- the final three-caravan mobile table composition;
- cyclic/expanded hand navigation;
- drag-and-drop card placement;
- new card rules or legal-action semantics;
- new server authority, persistence, or hidden-information behavior;
- a new realtime protocol message;
- automatic control reclaim on focus/visibility changes.

Those boundaries keep the production stabilization independent from the larger table and gesture redesigns planned next.
