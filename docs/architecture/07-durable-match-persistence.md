# 07. Durable Match Persistence

## Status

Implemented as the first PostgreSQL-backed persistence layer for authoritative CARAVAN matches.

This layer replaces process-local-only match durability without changing the deterministic engine or client/server protocol contracts.

## Persistence boundary

`apps/server` keeps `MatchStore` as the domain-facing storage port.

Two adapters exist:

- `InMemoryMatchStore` for focused unit/service tests;
- `PostgresMatchStore` for durable authoritative state.

The match service does not contain PostgreSQL-specific logic.

## Durable snapshot model

A match is stored as one versioned authoritative JSONB snapshot plus row metadata used for transactional compare-and-set:

- match id;
- authoritative `stateVersion`;
- lifecycle status;
- persistence schema version;
- complete privileged authoritative snapshot.

The privileged snapshot includes both players' hidden deck order and hands, lifecycle/deadline state, and processed command identities. It is a server/database boundary only and must never be reused as a client wire payload.

Persistence schema versioning is deliberately separate from `CaravanGameState.schemaVersion`. Either format may evolve without pretending they are the same compatibility contract.

## Validation on write and restore

Every persisted snapshot is runtime-validated before storage and again after loading.

Restore validation checks:

- persistence envelope version;
- match id and state version agree with row metadata;
- lifecycle status agrees with row metadata;
- participant identities are non-empty and distinct;
- processed command identities are valid, unique per account, and belong to match participants;
- processed command accepted versions belong to the persisted state history;
- lifecycle result and rule-engine result are mutually consistent;
- the restored `CaravanGameState` passes the engine's structural invariant validation.

Corrupt or unsupported authoritative state fails closed instead of being projected to a client.

## Transactional compare-and-set

`PostgresMatchStore.compareAndSet(matchId, expectedStateVersion, next)` is implemented as one PostgreSQL `UPDATE` guarded by the expected state version.

The same statement updates:

- `state_version`;
- lifecycle status;
- persistence schema version;
- the complete authoritative JSONB snapshot;
- update timestamp.

Therefore two workers may calculate from the same state version, but PostgreSQL permits at most one to commit. The loser observes a failed CAS and the match service reloads under its normal stale/duplicate handling.

No Redis/distributed lock is required for this invariant.

## Retry durability

Processed accepted commands live inside the authoritative snapshot committed with the resulting state.

This means an accepted command and its idempotency record cannot be durably separated. After a normal process/container restart, retrying the same command id with the same fingerprint returns the already-committed state instead of applying the action again.

## Restart recovery

A new server process can instantiate a new PostgreSQL pool/store/service and load the same authoritative match by id without trusting any client-provided state.

Realtime connection ownership and deadline scheduling are later runtime concerns. When those layers arrive, they must rebuild from these durable snapshots and preserve already-stored authoritative deadlines rather than inventing new client-derived timers.

## Database migrations

Committed SQL migrations under `apps/server/migrations/` are the only supported schema evolution path.

The initial migration creates `caravan_matches` with:

- UUID primary key;
- non-negative JavaScript-safe `state_version`;
- constrained lifecycle status;
- persistence schema version;
- JSONB authoritative snapshot;
- created/updated timestamps;
- lifecycle-status index for future recovery/scheduling scans.

Migrations run through Drizzle's PostgreSQL migrator. Drizzle is used for migration management here; the match store intentionally uses small explicit SQL statements where the concurrency contract is clearer than an ORM abstraction.

## Development and CI

`compose.yaml` currently provides PostgreSQL only. It is a development/integration-test dependency, not yet the final CARAVAN production deployment stack.

CI starts isolated PostgreSQL 18, applies committed migrations, validates the Compose file, and runs integration coverage for:

- authoritative snapshot round-trip;
- same-version CAS races;
- process/pool recreation recovery;
- duplicate-command idempotency after restart;
- rejection of row/snapshot metadata divergence.

Full server/bot/web production containers should be added only when those runtimes actually exist.

## Security boundary

Database snapshots contain hidden information and must be treated as privileged server data.

Do not expose raw snapshots through HTTP/WebSocket responses, logs, analytics, debug endpoints, exception payloads, or client bundles. Client-visible match state continues to be produced only through `projectForPlayer` and protocol validation.
