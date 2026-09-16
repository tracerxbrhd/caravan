# 12. Mini App Play Flow and Realtime Client

## Status

Implemented as the first CARAVAN Mini App application flow that reaches durable match entry and an authoritative realtime match snapshot. It deliberately stops before the full interactive card-table presentation and tutorial.

## Responsibilities

The Mini App now owns client-side orchestration for:

- restoring/authenticating the CARAVAN application session;
- reading launch context through `PlatformAdapter`;
- entering casual matchmaking;
- renewing the durable matchmaking lease;
- creating, sharing, polling, and cancelling a private challenge;
- accepting or declining an inbound private challenge;
- transitioning from match entry to the authoritative match identified by the server;
- opening `/ws`, claiming control with `RESYNC`, and replacing local match state with validated server snapshots;
- reconnecting with bounded exponential backoff after temporary socket loss.

The client still does not own match state, timers, hidden information, challenge truth, queue truth, or gameplay legality.

## Shared launch contract

`challenge_<inviteToken>` is now defined in `packages/protocol` because it is consumed by both the Telegram bot boundary and the Mini App platform boundary.

Telegram syntax remains platform-specific. The application sees only a parsed launch context:

```text
HOME
CHALLENGE(inviteToken)
INVALID
```

Unknown or malformed launch data fails closed. A challenge launch token is only a bearer capability; the server still requires the authenticated CARAVAN session before challenge acceptance.

## Match-entry recovery

The Play screen does not assume that its in-memory UI state is authoritative.

On normal entry it queries `GET /api/matchmaking` so a reload can recover either:

- an active durable queue lease; or
- an already-created match returned as `MATCH_FOUND`.

While queued, the client renews the lease through the heartbeat endpoint. A transient failed heartbeat is retried rather than immediately pretending the player left the queue. Explicit queue cancellation still goes through the authoritative server endpoint.

Private outgoing challenges are polled by challenge ID until they are accepted or resolved. The raw invite token is kept only in the current client session and is not added to durable client storage.

## Private challenge sharing

The Mini App uses the public `VITE_TELEGRAM_BOT_USERNAME` build/runtime configuration only to construct Telegram deep links. This value is not secret.

The actual invite URL follows the same Main Mini App transport defined by the bot layer:

```text
https://t.me/<bot>?startapp=challenge_<inviteToken>
```

The platform adapter owns Telegram share/open behavior so application components do not spread Telegram globals throughout the React tree.

## Realtime ownership and resync

When a match ID is obtained from matchmaking or challenge acceptance, the Mini App opens the same-origin `/ws` endpoint.

Every initial connection and reconnect sends:

```text
RESYNC(matchId, commandId, knownStateVersion)
```

The server decides whether that socket becomes the controlling connection and returns a fresh viewer-safe `SNAPSHOT`.

The client validates every server message through `packages/protocol`. Invalid JSON or protocol-incompatible data is treated as transport failure and triggers reconnect rather than being rendered as trustworthy state.

A server snapshot fully replaces the client's authoritative match view. Rejection payloads carrying a fresh snapshot also replace the local view.

## State-changing commands

The realtime client exposes typed helpers for future table UI:

- `sendAction(action)`;
- `surrender()`;
- `requestControl()`.

A state-changing command is not sent until an authoritative active snapshot exists. Its `expectedStateVersion` comes from that snapshot. The transport does not fabricate or optimistically commit game state.

PR11 introduced typed state-changing helpers without exposing them through card controls. The interactive table added later consumes those helpers directly; see [`13-interactive-card-table.md`](13-interactive-card-table.md).

## Presentation boundary

The match transport remains independent from table presentation. The interactive table consumes the existing `MatchSnapshot`, `legalActions`, and realtime send helpers rather than building another match transport or client-owned rules layer.

## Local development

Vite now proxies both:

```text
/api -> http://127.0.0.1:3000
/ws  -> ws://127.0.0.1:3000
```

The Mini App config uses the repository root as its Vite environment directory so the shared local `.env` can provide the public `VITE_TELEGRAM_BOT_USERNAME` value. Only `VITE_*` values are exposed to the browser bundle; server secrets remain server-only.

## Testing baseline

Client flow changes should protect at least:

- shared launch-context validation;
- strict runtime validation of match-entry HTTP responses;
- malformed successful HTTP responses failing closed;
- initial WebSocket control acquisition using `RESYNC`;
- no gameplay command before the first authoritative snapshot;
- reconnect scheduling after socket loss;
- protocol-invalid server messages not becoming rendered state.

Server-side hidden-information and command-concurrency tests remain authoritative for security invariants; client tests supplement rather than replace them.

## Deferred

This layer deliberately does not implement:

- the interactive tutorial;
- richer confirmed deal/play/modifier/discard travel animations beyond the implemented selection/target feedback;
- sound/haptics settings;
- complete result/rematch UX;
- browser/native authentication;
- production Docker/reverse-proxy deployment.

Those remain separate focused first-playable layers.
