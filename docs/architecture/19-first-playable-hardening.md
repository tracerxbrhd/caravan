# 19. First-Playable Hardening

## Status

Accepted implementation boundary for the final hardening pass before CARAVAN's first real-account production acceptance run.

This layer does not add a new game system. It closes failure modes around the already implemented Telegram -> Play -> match -> reconnect -> result/rematch journey defined by [`../product/06-first-playable-scope.md`](../product/06-first-playable-scope.md).

Passing repository CI proves the software and production-container contracts covered by automation. It does **not** prove that the real Telegram/BotFather/public-domain journey has been exercised by two humans; that remains the explicit acceptance step in [`../development/first-playable-acceptance.md`](../development/first-playable-acceptance.md).

## Realtime recovery policy

Not every WebSocket close is equivalent.

The Mini App classifies the server's existing close signals as follows:

| Close condition | Client policy |
| --- | --- |
| ordinary network loss / unexpected close | bounded exponential reconnect, then `RESYNC` |
| `1012 SERVICE_RESTART` | reconnect and replace local match state from a fresh sanitized snapshot |
| `4001 CONTROL_REPLACED` | stop automatic reconnect; require an explicit **Take control here** action |
| `1008 SESSION_EXPIRED` | stop permanently and return to the application authentication bootstrap |

The `CONTROL_REPLACED` rule prevents two open clients for the same account from repeatedly stealing controlling-socket ownership from each other. Explicit reclaim remains available because a player may intentionally move the match to another device/window.

The `SESSION_EXPIRED` rule prevents a revoked/disabled/expired session from entering an infinite reconnect loop. A new gameplay socket is created only after the normal Telegram/application-session boundary succeeds again.

The server remains authoritative for controlling connection ownership. These client rules only determine whether the Mini App should attempt another connection.

## Authoritative deadline presentation

`MatchSnapshot` already contains:

- `turnDeadlineAtMs`;
- `reconnectDeadlineAtMs.A`;
- `reconnectDeadlineAtMs.B`;
- per-seat connection state.

The first-playable UI must expose a deadline whenever it materially affects the player. Hiding those fields while enforcing them server-side creates an unfair experience where a player can lose without knowing that time is expiring.

The countdown is presentation only. The server still decides whether a deadline has expired.

### Clock synchronization

Every realtime server message includes `serverTimeMs`. When a sanitized snapshot arrives, the Mini App captures:

```text
serverTimeMs + client monotonic clock anchor
```

Subsequent countdown ticks estimate current server time from elapsed `performance.now()` time rather than trusting the device wall clock. Changing the phone/computer date or clock therefore does not change authority and does not make the displayed countdown jump merely because local wall time changed.

A fresh snapshot replaces the clock anchor. The client never sends its countdown back as authoritative state.

## Session recovery

Application HTTP polling/actions and realtime may both discover that a session is no longer valid.

A real Telegram launch carrying raw `initData` first re-authenticates that Telegram identity through the backend. This deliberately replaces any pre-existing same-origin CARAVAN cookie, because Telegram WebViews can preserve cookies while the user switches Telegram accounts. A stale application session from account A must never cause a launch by account B to act as account A.

When Telegram `initData` is unavailable, bootstrap may restore the opaque application session through `/api/me`. This is the non-Telegram/provider-independent fallback.

A `401` from matchmaking/challenge/rematch flows or a realtime `SESSION_EXPIRED` close returns the Mini App to the same bootstrap policy:

1. if Telegram `initData` is present, validate it again through the backend authentication endpoint and bind a fresh application session to that verified identity;
2. otherwise try the existing opaque application session;
3. if neither path establishes a session, show the Telegram-required/error state rather than continuing background polling.

The bootstrap promise is cached only while one attempt is in flight. Success or failure clears that cache so a later retry/session refresh performs a real authorization check.

## Hidden information and logging sweep

PR18 does not expand any gameplay payload.

The existing security boundary remains:

- `MatchSnapshot.game` is a server-generated `PlayerView`;
- protocol schemas are strict and reject opponent-hand/future-deck/privileged-state fields;
- opponent hand identities and future draw order are absent from serialized snapshots;
- client presentation derives deadlines only from already-public lifecycle metadata;
- WebSocket broadcasts continue to project separately for each recipient;
- HTTP logging redacts cookies, authorization, raw Telegram `initData`, invite tokens and `Set-Cookie`;
- the bot validates its webhook secret and does not log raw Telegram updates on processing failures.

A hardening pass must not solve observability by logging authoritative match snapshots or authentication material.

## Existing server lifecycle guarantees retained

The server already owns and persists:

- turn deadlines;
- reconnect grace deadlines;
- surrender/timeout/no-contest finalization;
- state version and command idempotency;
- controlling-socket ownership;
- authorization revalidation for open sockets;
- deadline sweeping;
- restart recovery of process-local connection state;
- fresh sanitized `RESYNC` snapshots.

Those mechanics remain unchanged unless a test demonstrates a server defect. PR18 intentionally avoids redesigning proven authority/persistence code merely because this is a hardening milestone.

## Verification boundary

Automated verification must continue to cover:

- format/lint/typecheck/build;
- engine/protocol/server/Mini App tests;
- PostgreSQL integration tests;
- hidden-information rejection;
- stale/duplicate/race behavior;
- reconnect/restart/finalization behavior;
- terminal Mini App WebSocket close policy;
- deadline presentation derivation;
- authentication bootstrap retry and Telegram account rebinding;
- production image builds, Caddy validation and clean Compose startup;
- production dependency audit at the repository gate.

After merge, production acceptance still requires the real-account procedure in [`../development/first-playable-acceptance.md`](../development/first-playable-acceptance.md). Failures found there are bugs to fix, not evidence that the acceptance checklist should be weakened.

## Explicit non-goals

PR18 does not add:

- ranked matchmaking or rating;
- profiles/history;
- custom deck building;
- card collection/economy;
- AI opponents;
- spectator/chat systems;
- standalone native packaging;
- analytics-driven retention claims;
- a second Telegram transport.

Those decisions belong after the core loop survives real-user acceptance.
