import type pg from 'pg';
import { matchIdSchema, type MatchId, type StateVersion } from '@caravan/protocol';
import {
  MATCH_PERSISTENCE_SCHEMA_VERSION,
  parsePersistedMatch,
  serializePersistedMatch,
} from './match-persistence.js';
import type { MatchStore } from './match-store.js';
import type { AuthoritativeMatch } from './match-types.js';

interface MatchRow extends pg.QueryResultRow {
  readonly id: string;
  readonly state_version: string;
  readonly status: AuthoritativeMatch['status'];
  readonly snapshot_schema_version: number;
  readonly snapshot: unknown;
}

interface MatchIdRow extends pg.QueryResultRow {
  readonly id: string;
}

function databaseStateVersion(value: string): StateVersion {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid persisted stateVersion ${value}.`);
  }
  return parsed;
}

function assertSafeStateVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('stateVersion must be a non-negative safe integer.');
  }
}

export class PostgresMatchStore implements MatchStore {
  readonly #database: pg.Pool | pg.PoolClient;

  public constructor(database: pg.Pool | pg.PoolClient) {
    this.#database = database;
  }

  public async create(match: AuthoritativeMatch): Promise<void> {
    assertSafeStateVersion(match.stateVersion);
    const snapshot = serializePersistedMatch(match);
    await this.#database.query(
      `INSERT INTO caravan_matches
        (id, state_version, status, snapshot_schema_version, snapshot)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [
        match.id,
        match.stateVersion,
        match.status,
        MATCH_PERSISTENCE_SCHEMA_VERSION,
        JSON.stringify(snapshot),
      ],
    );
  }

  public async load(matchId: MatchId): Promise<AuthoritativeMatch | null> {
    const result = await this.#database.query<MatchRow>(
      `SELECT id::text,
              state_version::text,
              status,
              snapshot_schema_version,
              snapshot
         FROM caravan_matches
        WHERE id = $1`,
      [matchId],
    );
    const row = result.rows[0];
    if (row === undefined) return null;

    return parsePersistedMatch(row.snapshot, {
      id: row.id,
      stateVersion: databaseStateVersion(row.state_version),
      status: row.status,
      persistenceSchemaVersion: row.snapshot_schema_version,
    });
  }

  public async listActiveMatchIds(): Promise<readonly MatchId[]> {
    const result = await this.#database.query<MatchIdRow>(
      `SELECT id::text
         FROM caravan_matches
        WHERE status = 'ACTIVE'
        ORDER BY updated_at ASC, id ASC`,
    );
    return result.rows.map((row) => matchIdSchema.parse(row.id));
  }

  public async compareAndSet(
    matchId: MatchId,
    expectedStateVersion: StateVersion,
    next: AuthoritativeMatch,
  ): Promise<boolean> {
    assertSafeStateVersion(expectedStateVersion);
    assertSafeStateVersion(next.stateVersion);
    if (next.id !== matchId) throw new Error('Cannot commit a match under a different id.');
    if (next.stateVersion !== expectedStateVersion + 1) {
      throw new Error('Committed match stateVersion must advance by exactly one.');
    }

    const snapshot = serializePersistedMatch(next);
    const result = await this.#database.query(
      `UPDATE caravan_matches
          SET state_version = $3,
              status = $4,
              snapshot_schema_version = $5,
              snapshot = $6::jsonb,
              updated_at = now()
        WHERE id = $1
          AND state_version = $2`,
      [
        matchId,
        expectedStateVersion,
        next.stateVersion,
        next.status,
        MATCH_PERSISTENCE_SCHEMA_VERSION,
        JSON.stringify(snapshot),
      ],
    );
    return result.rowCount === 1;
  }
}
