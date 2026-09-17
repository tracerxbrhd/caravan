# 09. Authenticated Realtime Runtime

## Status

Implemented as the initial authenticated WebSocket, reconnect, and deadline runtime for the first playable.

This layer connects the existing application-session boundary, authoritative `MatchService`, durable `PostgresMatchStore`, and strict `packages/protocol` contracts without moving game authority into the transport.

## Transport boundary

`apps/server` exposes a plain WebSocket endpoint at:

```text
GET /ws
```

Socket.IO is intentionally not used. The runtime uses `@fastify/websocket` and the same Fastify process/origin as the HTTP API.

The WebSocket adapter does not implement card rules. It is responsible for:

- session-authenticated upgrades;
- strict command parsing;
- per-match connection ownership;
- reconnect/resync coordination;
- viewer-specific snapshot delivery;
- heartbeat/dead-connection cleanup;
- lightweight per-socket message-rate protection;
- deadline sweeping;
- graceful realtime shutdown.

## Authentication and authorization

The WebSocket upgrade reuses the `caravan_session` HttpOnly application cookie introduced by the authenticated HTTP runtime.

The server resolves that opaque session to an internal CARAVAN `accountId`. Telegram IDs and Telegram `initData` are never accepted as gameplay identity inside WebSocket commands.

The session is not trusted forever after the initial upgrade. Before processing commands and during heartbeat/broadcast paths, the runtime re-resolves the session. Revoked, expired, suspended, or banned sessions therefore lose realtime access without waiting for the socket to reconnect naturally.

The upgrade also requires the configured same `PUBLIC_ORIGIN`. Production Host enforcement remains owned by the shared Fastify HTTP security hook.

## Protocol handling

Every inbound message is parsed as JSON and validated through `clientCommandSchema`.

Malformed payloads receive `PROTOCOL_ERROR / INVALID_MESSAGE`. A payload that explicitly declares a different protocol version receives `PROTOCOL_ERROR / UNSUPPORTED_PROTOCOL_VERSION`.

The transport does not accept alternate untyped command forms.

The initial gameplay wire commands remain:

- `RESYNC`;
- `GAME_ACTION`;
- `SURRENDER`.

## RESYNC and connection ownership

`RESYNC` is the transport entry point for joining or rejoining a known match.

A successful participant resync:

1. resolves the requesting account against the durable match;
2. marks that seat connected through `MatchService`;
3. clears that seat's reconnect deadline;
4. assigns the socket as the controlling connection for that account/match;
5. returns a newly generated sanitized snapshot;
6. broadcasts fresh viewer-specific snapshots to the other connected participant.

Only the controlling socket may submit state-changing commands for that account/match. A second socket for the same account and match takes control and closes the previous controller with an application-specific control-replaced close code.

A stale/non-controlling socket receives the stable `CONNECTION_NOT_OWNER` rejection instead of mutating state.

Control ownership is process-local transport state. Match state, connection flags, reconnect deadlines, turn deadlines, and results remain durable server state.

## Match readiness

Transport readiness is deliberately not a pure game-engine or generic `MatchService` rule.

Before a match has started, the first arriving client must not be able to play cards. `GAME_ACTION` commands are therefore rejected with `MATCH_NOT_READY` while the authoritative `turnDeadlineAtMs` is still `null`. The first turn deadline is created only after both seats have connected.

`SURRENDER` is intentionally different. It is a server lifecycle command, not a card-game move, and remains available to the controlling participant before initial readiness. This prevents durable match recovery from trapping a player in a previously created match when the other participant never connects or never reopens the Mini App. The surrender still goes through normal authenticated ownership, state-version, idempotency and durable persistence checks.

Once the match has started, a later opponent disconnect does not freeze the connected active player: that player may still submit a legal action while the disconnected seat is governed independently by its reconnect deadline. This avoids a fairness failure where the server would keep an active player's turn clock running while simultaneously refusing that player's move.

## Hidden-information broadcasting

There is no shared match snapshot that is blindly broadcast to both sockets.

For every recipient, the runtime asks `MatchService` for that account's fresh snapshot. `MatchService` resolves the seat and builds the payload through:

```text
AuthoritativeMatch
-> projectForPlayer(game, viewerSeat)
-> matchSnapshotSchema
-> WebSocket recipient
```

As a result, player A and player B can receive snapshots at the same state version while the permitted hidden contents differ.

The authoritative persisted snapshot, opponent hand identities, and future deck order never cross the WebSocket boundary.

## Persistence before broadcast

Realtime delivery does not change the established commit ordering.

State-changing commands are processed by `MatchService`, which performs the durable compare-and-set commit before returning an accepted snapshot. Only after that result is available does the WebSocket adapter broadcast fresh projections.

Connection, disconnection, reconnect-deadline, timeout, and no-contest lifecycle changes also advance `stateVersion` through the same durable `MatchStore` CAS boundary.

The transport never broadcasts a speculative state that has not been committed.

## Turn and reconnect deadlines

Deadlines are server-owned absolute millisecond timestamps stored inside the authoritative match snapshot.

The initial runtime configuration is:

```text
TURN_TIMEOUT_SECONDS=60
RECONNECT_GRACE_SECONDS=30
```

These are operational/product defaults, not `packages/game-engine` constants.

The first turn deadline starts only after both players have connected. An accepted non-finishing state-changing command resets the turn deadline from authoritative server time.

When the controlling socket disconnects after the match has started, the seat becomes disconnected and receives a reconnect deadline. A successful reconnect clears that deadline; it does not let the client supply or extend server time. The other connected player is not forced into a transport pause solely because the opponent is inside reconnect grace.

A periodic server sweep checks durable active matches for expired deadlines. Deadline finalization is CAS-protected and therefore idempotent under races.

If the earliest simultaneous expired deadlines imply different losers, the match becomes `NO_CONTEST` rather than arbitrarily choosing one player.

## Restart recovery

Realtime installation runs durable active-match recovery before accepting normal gameplay traffic.

Persisted `connected=true` flags cannot be trusted after a process restart because the old sockets no longer exist. Recovery converts such seats to disconnected state and establishes reconnect grace where a match had started.

Existing absolute turn/reconnect deadlines remain authoritative. If a deadline was already expired when the new process recovered the match, the runtime resolves the infrastructure-ambiguous state as `NO_CONTEST` rather than retroactively awarding a player-caused timeout while the server was unavailable.

No client state is used to reconstruct the match.

## Heartbeat and transport limits

The runtime periodically pings active sockets. Connections that fail the heartbeat are terminated and then pass through normal disconnect persistence when appropriate.

Inbound messages are limited per socket in a short fixed window in addition to the HTTP runtime's existing rate limiting. WebSocket payload size is capped at 16 KiB by the Fastify WebSocket plugin.

These protections are intentionally small and process-local; they do not justify Redis or distributed rate-limiting infrastructure at the current scale.

## Graceful shutdown

The realtime module owns `@fastify/websocket` registration so it can also own the plugin's custom `preClose` behavior. Upgraded WebSocket connections must be closed before Fastify reaches normal `onClose` processing; treating this as an ordinary late cleanup would allow service restart sockets to look like player disconnects.

During realtime `preClose` the runtime:

- marks itself as shutting down before any socket close event can persist a disconnect;
- stops heartbeat/deadline intervals;
- clears process-local control ownership;
- closes sockets with `1012 / SERVICE_RESTART`;
- closes the WebSocket server before Fastify completes shutdown.

Shutdown socket closures do not persist ordinary player-disconnect penalties. The durable match keeps its pre-shutdown connection/deadline state, and the next process performs authoritative restart recovery from that state instead.

## Testing baseline

Automated coverage protects at minimum:

- durable connect/disconnect lifecycle transitions;
- reconnect grace and turn deadlines;
- timeout and no-contest finalization;
- restart recovery semantics;
- authenticated WebSocket handshake;
- `RESYNC` participant ownership;
- `GAME_ACTION` rejection with `MATCH_NOT_READY` before the initial match start;
- pre-start `SURRENDER` remaining available so a recovered waiting match can be finalized;
- legal active-player commands remaining accepted while the opponent is inside reconnect grace;
- controlling-socket takeover and stale-socket rejection;
- state-changing command persistence before peer broadcast;
- viewer-specific hidden-information isolation over the real WebSocket transport;
- graceful service restart closing sockets without persisting player-disconnect penalties;
- final surrender state persisted to PostgreSQL;
- configuration defaults for turn and reconnect timing.

Database-backed realtime integration coverage is mandatory in CI when `CARAVAN_REQUIRE_DATABASE_TESTS=1`.

## Current non-goals

This layer does not implement:

- client-authoritative card rules;
- browser/native authentication;
- ranked/rating/progression systems;
- spectator sockets;
- chat/reactions;
- horizontal multi-process socket coordination.

Matchmaking, private challenges, Mini App recovery UI and rematches build on this authenticated realtime boundary rather than replacing it with a second gameplay transport.
