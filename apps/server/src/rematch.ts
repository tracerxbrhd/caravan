import type pg from 'pg';
import {
  matchIdSchema,
  rematchStatusSchema,
  type MatchId,
  type RematchStatus,
} from '@caravan/protocol';
import { transaction } from './db.js';
import { MatchService } from './match-service.js';
import { PostgresMatchStore } from './postgres-match-store.js';

export interface RematchServiceOptions {
  readonly ttlMs?: number;
  readonly now?: () => number;
}

interface SourceMatchRow extends pg.QueryResultRow {
  readonly status: 'ACTIVE' | 'FINISHED';
  readonly player_a: string;
  readonly player_b: string;
}

interface RematchRow extends pg.QueryResultRow {
  readonly requester_account_id: string;
  readonly status: 'PENDING' | 'ACCEPTED' | 'CANCELLED' | 'EXPIRED';
  readonly match_id: string | null;
  readonly created_at: Date;
  readonly expires_at: Date;
}

const DEFAULT_REMATCH_TTL_MS = 15 * 60_000;

type RematchTransactionResult = RematchStatus | 'UNAVAILABLE';

function positiveDuration(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError('ttlMs must be a positive safe integer number of milliseconds.');
  }
  return value;
}

async function lockMatchmakingQueue(db: pg.PoolClient): Promise<void> {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('MATCHMAKING_QUEUE', 0))");
}

async function lockAccount(db: pg.PoolClient, accountId: string): Promise<void> {
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `MATCH_ENTRY:${accountId}`,
  ]);
}

async function lockAccounts(db: pg.PoolClient, accountIds: readonly string[]): Promise<void> {
  for (const accountId of [...new Set(accountIds)].sort()) {
    await lockAccount(db, accountId);
  }
}

async function activeMatchId(
  db: pg.Pool | pg.PoolClient,
  accountId: string,
): Promise<MatchId | null> {
  const row = (
    await db.query<{ id: string }>(
      `SELECT id::text
         FROM caravan_matches
        WHERE status = 'ACTIVE'
          AND (
            snapshot #>> '{match,participants,A}' = $1
            OR snapshot #>> '{match,participants,B}' = $1
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      [accountId],
    )
  ).rows[0];
  return row === undefined ? null : matchIdSchema.parse(row.id);
}

async function sourceMatch(
  db: pg.Pool | pg.PoolClient,
  sourceMatchId: MatchId,
): Promise<SourceMatchRow | null> {
  const row = (
    await db.query<SourceMatchRow>(
      `SELECT status,
              snapshot #>> '{match,participants,A}' AS player_a,
              snapshot #>> '{match,participants,B}' AS player_b
         FROM caravan_matches
        WHERE id = $1`,
      [sourceMatchId],
    )
  ).rows[0];
  return row ?? null;
}

function participantsForAccount(source: SourceMatchRow, accountId: string): readonly [string, string] {
  if (source.player_a !== accountId && source.player_b !== accountId) {
    throw new Error('MATCH_NOT_FOUND');
  }
  if (source.status !== 'FINISHED') throw new Error('REMATCH_NOT_ALLOWED');
  return [source.player_a, source.player_b];
}

async function cancelOutgoingChallenges(
  db: pg.PoolClient,
  accountIds: readonly string[],
  now: Date,
): Promise<void> {
  await db.query(
    `UPDATE caravan_private_challenges
        SET status = 'CANCELLED',
            resolved_at = $2
      WHERE inviter_account_id = ANY($1::uuid[])
        AND status = 'PENDING'`,
    [accountIds, now],
  );
}

function statusFromRow(row: RematchRow, accountId: string): RematchStatus {
  if (row.status === 'ACCEPTED' && row.match_id !== null) {
    return rematchStatusSchema.parse({ status: 'MATCH_FOUND', matchId: row.match_id });
  }
  if (row.status === 'PENDING') {
    return rematchStatusSchema.parse({
      status: 'WAITING',
      requestedBy: row.requester_account_id === accountId ? 'YOU' : 'OPPONENT',
      expiresAtMs: row.expires_at.getTime(),
    });
  }
  return rematchStatusSchema.parse({ status: 'IDLE' });
}

export class RematchService {
  readonly #pool: pg.Pool;
  readonly #ttlMs: number;
  readonly #now: () => number;

  public constructor(pool: pg.Pool, options: RematchServiceOptions = {}) {
    this.#pool = pool;
    this.#ttlMs = positiveDuration(options.ttlMs ?? DEFAULT_REMATCH_TTL_MS);
    this.#now = options.now ?? Date.now;
  }

  public async status(accountId: string, sourceMatchId: MatchId): Promise<RematchStatus> {
    const source = await sourceMatch(this.#pool, sourceMatchId);
    if (source === null) throw new Error('MATCH_NOT_FOUND');
    participantsForAccount(source, accountId);

    const row = (
      await this.#pool.query<RematchRow>(
        `SELECT requester_account_id::text,
                status,
                match_id::text,
                created_at,
                expires_at
           FROM caravan_rematch_requests
          WHERE source_match_id = $1`,
        [sourceMatchId],
      )
    ).rows[0];
    if (row === undefined) return rematchStatusSchema.parse({ status: 'IDLE' });

    if (row.status === 'PENDING' && row.expires_at.getTime() <= this.#now()) {
      await this.#pool.query(
        `UPDATE caravan_rematch_requests
            SET status = 'EXPIRED', resolved_at = $2
          WHERE source_match_id = $1
            AND status = 'PENDING'
            AND expires_at <= $2`,
        [sourceMatchId, new Date(this.#now())],
      );
      return rematchStatusSchema.parse({ status: 'IDLE' });
    }

    return statusFromRow(row, accountId);
  }

  public async request(accountId: string, sourceMatchId: MatchId): Promise<RematchStatus> {
    const result = await transaction(this.#pool, async (db): Promise<RematchTransactionResult> => {
      const source = await sourceMatch(db, sourceMatchId);
      if (source === null) throw new Error('MATCH_NOT_FOUND');
      const participants = participantsForAccount(source, accountId);

      await lockMatchmakingQueue(db);
      await lockAccounts(db, participants);

      const row = (
        await db.query<RematchRow>(
          `SELECT requester_account_id::text,
                  status,
                  match_id::text,
                  created_at,
                  expires_at
             FROM caravan_rematch_requests
            WHERE source_match_id = $1
            FOR UPDATE`,
          [sourceMatchId],
        )
      ).rows[0];
      const now = new Date(this.#now());

      if (row?.status === 'ACCEPTED') return statusFromRow(row, accountId);

      if (row?.status === 'PENDING' && row.expires_at.getTime() <= now.getTime()) {
        await db.query(
          `UPDATE caravan_rematch_requests
              SET status = 'EXPIRED', resolved_at = $2
            WHERE source_match_id = $1`,
          [sourceMatchId, now],
        );
      } else if (row?.status === 'PENDING') {
        if (row.requester_account_id === accountId) return statusFromRow(row, accountId);

        if (
          (await activeMatchId(db, participants[0])) !== null ||
          (await activeMatchId(db, participants[1])) !== null
        ) {
          await db.query(
            `UPDATE caravan_rematch_requests
                SET status = 'CANCELLED', resolved_at = $2
              WHERE source_match_id = $1`,
            [sourceMatchId, now],
          );
          return 'UNAVAILABLE';
        }

        const matchService = new MatchService(new PostgresMatchStore(db));
        const { matchId } = await matchService.createMatch({
          participants: { A: participants[0], B: participants[1] },
        });
        await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = ANY($1::uuid[])', [
          participants,
        ]);
        await cancelOutgoingChallenges(db, participants, now);
        await db.query(
          `UPDATE caravan_rematch_requests
              SET status = 'ACCEPTED',
                  match_id = $2,
                  resolved_at = $3
            WHERE source_match_id = $1`,
          [sourceMatchId, matchId, now],
        );
        return rematchStatusSchema.parse({ status: 'MATCH_FOUND', matchId });
      }

      if (
        (await activeMatchId(db, participants[0])) !== null ||
        (await activeMatchId(db, participants[1])) !== null
      ) {
        return 'UNAVAILABLE';
      }

      const expiresAt = new Date(now.getTime() + this.#ttlMs);
      await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
      await cancelOutgoingChallenges(db, [accountId], now);
      await db.query(
        `INSERT INTO caravan_rematch_requests
           (source_match_id, requester_account_id, status, match_id, created_at, expires_at, resolved_at)
         VALUES ($1, $2, 'PENDING', NULL, $3, $4, NULL)
         ON CONFLICT (source_match_id) DO UPDATE
           SET requester_account_id = EXCLUDED.requester_account_id,
               status = 'PENDING',
               match_id = NULL,
               created_at = EXCLUDED.created_at,
               expires_at = EXCLUDED.expires_at,
               resolved_at = NULL`,
        [sourceMatchId, accountId, now, expiresAt],
      );
      return rematchStatusSchema.parse({
        status: 'WAITING',
        requestedBy: 'YOU',
        expiresAtMs: expiresAt.getTime(),
      });
    });

    if (result === 'UNAVAILABLE') throw new Error('REMATCH_UNAVAILABLE');
    return result;
  }

  public async cancel(accountId: string, sourceMatchId: MatchId): Promise<RematchStatus> {
    return transaction(this.#pool, async (db) => {
      const source = await sourceMatch(db, sourceMatchId);
      if (source === null) throw new Error('MATCH_NOT_FOUND');
      participantsForAccount(source, accountId);

      const row = (
        await db.query<RematchRow>(
          `SELECT requester_account_id::text,
                  status,
                  match_id::text,
                  created_at,
                  expires_at
             FROM caravan_rematch_requests
            WHERE source_match_id = $1
            FOR UPDATE`,
          [sourceMatchId],
        )
      ).rows[0];
      if (row === undefined) return rematchStatusSchema.parse({ status: 'IDLE' });
      if (row.status === 'ACCEPTED') return statusFromRow(row, accountId);
      if (row.status !== 'PENDING') return rematchStatusSchema.parse({ status: 'IDLE' });

      await db.query(
        `UPDATE caravan_rematch_requests
            SET status = 'CANCELLED', resolved_at = $2
          WHERE source_match_id = $1`,
        [sourceMatchId, new Date(this.#now())],
      );
      return rematchStatusSchema.parse({ status: 'IDLE' });
    });
  }
}
