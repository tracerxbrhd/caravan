# 05. Protocol Contracts

## Status

Implemented initially by `packages/protocol` in PR #4 and consumed by the authenticated realtime runtime in PR #8.

This document defines the CARAVAN client/server wire boundary. The protocol is intentionally narrow: it transports player intent and sanitized authoritative projections without becoming a second rules engine or exposing privileged match state.

## Protocol version

Every client command and server message carries `protocolVersion`.

The initial protocol version is `1`.

Unknown versions fail explicitly rather than being interpreted as the current version. Breaking wire changes require a deliberate protocol-version decision; additive backward-compatible fields should still be evaluated carefully because schemas are strict by default.

## Identifiers and concurrency

State-changing commands carry:

- `matchId` — stable match identifier;
- `commandId` — unique command identifier used for retry/idempotency handling;
- `expectedStateVersion` — the authoritative version the client believes it is acting on.

The protocol validates identifier shape and non-negative versions, but the server owns semantic checks such as account/seat ownership, controlling-connection ownership, duplicate-command handling, stale-version rejection, deadlines, and transactional commit order.

`stateVersion` is a server concurrency/persistence version. It is not the same concept as the game engine's `actionSequence`.

## Client commands

The initial command union contains:

- `GAME_ACTION` — wraps one typed `GameAction` from the deterministic engine;
- `SURRENDER` — server match-lifecycle intent, deliberately outside `GameAction`;
- `RESYNC` — requests a fresh authoritative projection and may provide the last known state version.

Clients never send replacement game state, deck order, hand contents, winner claims, timers, connection state, or server-side lifecycle state.

Schemas are strict. Unknown properties are rejected instead of silently stripped so accidental attempts to expand client authority are visible during development.

## Sanitized snapshots

The protocol has no schema for `CaravanGameState`.

Server snapshots contain only the engine-produced `PlayerView` plus server-owned public lifecycle metadata:

- `matchId`;
- `stateVersion`;
- active/finished status;
- viewer-safe game projection;
- connection flags;
- authoritative turn/reconnect deadlines where relevant;
- finalized match result when finished.

A snapshot must never contain:

- opponent hand identities;
- either future draw order;
- rejected opening/mulligan orders;
- privileged RNG material;
- raw authoritative engine state;
- server-only audit data.

`playerViewSchema` is intentionally an explicit runtime schema. Tests parse real `projectForPlayer(...)` output and also verify that privileged engine state and injected hidden fields are rejected.

## Rule result versus match result

`PlayerView.result` represents only a pure game-engine outcome such as route victory or deck exhaustion.

The server-level snapshot result represents the broader match lifecycle and may additionally finish through:

- surrender;
- timeout/forfeit;
- no-contest/abort.

A server-finished match therefore does not require inventing a fake game action or mutating pure card-rule semantics.

## Server messages

The initial server-message union contains:

### `SNAPSHOT`

Carries one sanitized authoritative `MatchSnapshot`.

`commandId` is nullable:

- when present, the snapshot can acknowledge the command that produced it;
- when null, it may represent an unsolicited authoritative update or broadcast state.

Rather than defining a separate accepted-command payload that can drift from snapshot state, successful state changes converge on a fresh authoritative snapshot.

### `COMMAND_REJECTED`

Carries:

- the command correlation identifiers;
- current `stateVersion`;
- a stable server rejection code;
- whether retry is meaningful;
- an optional stable game-rule error code when rejection came from the engine;
- an optional sanitized fresh snapshot for immediate resynchronization.

The realtime layer additionally uses stable rejection codes for transport-owned conditions such as `MATCH_NOT_READY` and `CONNECTION_NOT_OWNER`. These conditions do not become card-game rules.

Human-facing/internal exception strings are not part of the stable protocol contract.

### `PROTOCOL_ERROR`

Represents malformed messages or unsupported protocol versions without leaking internal exception details.

The WebSocket runtime uses this message for invalid JSON/schema input and explicit unsupported protocol versions rather than guessing at client intent.

## Strict runtime validation

`packages/protocol` uses Zod schemas for runtime boundaries in addition to TypeScript types.

TypeScript protects compile-time callers; it does not make network input trustworthy. WebSocket/HTTP adapters parse unknown input through exported schemas before using it.

Likewise, outbound message construction is validated at high-risk boundaries and in tests rather than assuming any server object is automatically safe to serialize.

## Hidden information is a protocol invariant

Strict schema rejection is defense in depth, not the primary projection mechanism.

The authoritative server must still call the game engine's explicit `projectForPlayer(state, viewer)` boundary. Protocol schemas then verify that the resulting wire shape contains only allowed fields.

Raw `GameEvent` values are not broadcast blindly because private draw events may contain card identities that are legal only for one seat. The implemented realtime adapter sends fresh per-recipient snapshots instead.

## Current non-goals

The protocol intentionally does not define:

- Telegram authentication/session payloads;
- matchmaking or private-challenge HTTP contracts;
- player profile/rating/economy schemas;
- chat/reactions;
- persistence snapshot format;
- database models;
- socket IDs or process-local connection-control maps;
- binary protocol/Protobuf;
- compression/version negotiation beyond the explicit protocol version.

Those should be added only when their owning implementation arrives.

## Testing contract

Protocol/realtime tests must cover at minimum:

- valid engine `PlayerView` parsing;
- command protocol/version/identifier validation;
- rejection of unknown properties;
- rejection of client-provided replacement state;
- rejection of privileged engine state as `PlayerView`;
- rejection of injected opponent hand/future-deck data;
- active/finished snapshot-result consistency;
- stable engine rule-error codes remaining accepted by the wire schema;
- JSON-serializable sanitized snapshots containing no hidden card identities;
- real WebSocket delivery remaining viewer-specific;
- malformed or unsupported-version WebSocket messages producing stable protocol errors.
