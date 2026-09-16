import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  challengeIdSchema,
  challengeViewSchema,
  inviteTokenSchema,
  matchIdSchema,
  matchmakingStatusSchema,
  type AcceptedChallenge,
  type ChallengeId,
  type ChallengeResolution,
  type ChallengeStatus,
  type ChallengeView,
  type CreateChallengeResponse,
  type InviteToken,
  type MatchId,
  type MatchmakingStatus,
} from '@caravan/protocol';
import { transaction } from './db.js';
import { MatchService } from './match-service.js';
import { PostgresMatchStore } from './postgres-match-store.js';

export interface MatchEntryServiceOptions {
  readonly matchmakingLeaseMs?: number;
  readonly challengeTtlMs?: number;
  readonly now?: () => number;
}

interface QueueRow extends pg.QueryResultRow {
  readonly account_id: string;
  readonly joined_at: Date;
  readonly lease_expires_at: Date;
}

interface ActiveMatchRow extends pg.QueryResultRow {
  readonly id: string;
}

interface ChallengeRow extends pg.QueryResultRow {
  readonly id: string;
  readonly inviter_account_id: string;
  readonly status: ChallengeStatus;
  readonly resolved_by_account_id: string | null;
  readonly match_id: string | null;
  readonly created_at: Date;
  readonly expires_at: Date;
}

const DEFAULT_MATCHMAKING_LEASE_MS = 90_000;
const DEFAULT_CHALLENGE_TTL_MS = 15 * 60_000;

function positiveDuration(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer number of milliseconds.`);
  }
  return value;
}

function tokenHash(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function newInviteToken(): InviteToken {
  return inviteTokenSchema.parse(randomBytes(32).toString('base64url'));
}

function challengeView(row: ChallengeRow): ChallengeView {
  return challengeViewSchema.parse({
    id: row.id,
    status: row.status,
    createdAtMs: row.created_at.getTime(),
    expiresAtMs: row.expires_at.getTime(),
    matchId: row.match_id,
  });
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
    await db.query<ActiveMatchRow>(
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

async function loadChallengeByIdForUpdate(
  db: pg.PoolClient,
  challengeId: ChallengeId,
): Promise<ChallengeRow | null> {
  const row = (
    await db.query<ChallengeRow>(
      `SELECT id::text,
              inviter_account_id::text,
              status,
              resolved_by_account_id::text,
              match_id::text,
              created_at,
              expires_at
         FROM caravan_private_challenges
        WHERE id = $1
        FOR UPDATE`,
      [challengeId],
    )
  ).rows[0];
  return row ?? null;
}

export class MatchEntryService {
  readonly #pool: pg.Pool;
  readonly #matchmakingLeaseMs: number;
  readonly #challengeTtlMs: number;
  readonly #now: () => number;

  public constructor(pool: pg.Pool, options: MatchEntryServiceOptions = {}) {
    this.#pool = pool;
    this.#matchmakingLeaseMs = positiveDuration(
      options.matchmakingLeaseMs ?? DEFAULT_MATCHMAKING_LEASE_MS,
      'matchmakingLeaseMs',
    );
    this.#challengeTtlMs = positiveDuration(
      options.challengeTtlMs ?? DEFAULT_CHALLENGE_TTL_MS,
      'challengeTtlMs',
    );
    this.#now = options.now ?? Date.now;
  }

  public async matchmakingStatus(accountId: string): Promise<MatchmakingStatus> {
    const matchId = await activeMatchId(this.#pool, accountId);
    if (matchId !== null) return matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId });

    const row = (
      await this.#pool.query<QueueRow>(
        `SELECT account_id::text, joined_at, lease_expires_at
           FROM caravan_matchmaking_queue
          WHERE account_id = $1
            AND lease_expires_at > $2`,
        [accountId, new Date(this.#now())],
      )
    ).rows[0];

    if (row === undefined) return matchmakingStatusSchema.parse({ status: 'IDLE' });
    return matchmakingStatusSchema.parse({
      status: 'QUEUED',
      leaseExpiresAtMs: row.lease_expires_at.getTime(),
    });
  }

  public async joinMatchmaking(accountId: string): Promise<MatchmakingStatus> {
    return transaction(this.#pool, async (db) => {
      await lockAccount(db, accountId);
      const now = new Date(this.#now());
      const existingMatchId = await activeMatchId(db, accountId);
      if (existingMatchId !== null) {
        await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
        return matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId: existingMatchId });
      }

      await db.query('DELETE FROM caravan_matchmaking_queue WHERE lease_expires_at <= $1', [now]);
      const leaseExpiresAt = new Date(now.getTime() + this.#matchmakingLeaseMs);
      await db.query(
        `INSERT INTO caravan_matchmaking_queue (account_id, joined_at, lease_expires_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (account_id) DO UPDATE
           SET joined_at = CASE
                 WHEN caravan_matchmaking_queue.lease_expires_at <= $2 THEN $2
                 ELSE caravan_matchmaking_queue.joined_at
               END,
               lease_expires_at = $3`,
        [accountId, now, leaseExpiresAt],
      );

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = (
          await db.query<QueueRow>(
            `SELECT q.account_id::text, q.joined_at, q.lease_expires_at
               FROM caravan_matchmaking_queue q
               JOIN accounts a ON a.id = q.account_id
              WHERE q.account_id <> $1
                AND q.lease_expires_at > $2
                AND a.status = 'ACTIVE'
              ORDER BY q.joined_at ASC, q.account_id ASC
              FOR UPDATE OF q SKIP LOCKED
              LIMIT 1`,
            [accountId, now],
          )
        ).rows[0];

        if (candidate === undefined) {
          return matchmakingStatusSchema.parse({
            status: 'QUEUED',
            leaseExpiresAtMs: leaseExpiresAt.getTime(),
          });
        }

        await lockAccount(db, candidate.account_id);
        const candidateMatchId = await activeMatchId(db, candidate.account_id);
        if (candidateMatchId !== null) {
          await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [
            candidate.account_id,
          ]);
          continue;
        }

        const ownMatchId = await activeMatchId(db, accountId);
        if (ownMatchId !== null) {
          await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
          return matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId: ownMatchId });
        }

        const matchService = new MatchService(new PostgresMatchStore(db));
        const { matchId } = await matchService.createMatch({
          participants: { A: candidate.account_id, B: accountId },
        });

        await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = ANY($1::uuid[])', [
          [candidate.account_id, accountId],
        ]);
        await cancelOutgoingChallenges(db, [candidate.account_id, accountId], now);
        return matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId });
      }

      return matchmakingStatusSchema.parse({
        status: 'QUEUED',
        leaseExpiresAtMs: leaseExpiresAt.getTime(),
      });
    });
  }

  public async heartbeatMatchmaking(accountId: string): Promise<MatchmakingStatus> {
    return transaction(this.#pool, async (db) => {
      await lockAccount(db, accountId);
      const matchId = await activeMatchId(db, accountId);
      if (matchId !== null) {
        await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
        return matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId });
      }

      const now = new Date(this.#now());
      const leaseExpiresAt = new Date(now.getTime() + this.#matchmakingLeaseMs);
      const result = await db.query<QueueRow>(
        `UPDATE caravan_matchmaking_queue
            SET lease_expires_at = $3
          WHERE account_id = $1
            AND lease_expires_at > $2
        RETURNING account_id::text, joined_at, lease_expires_at`,
        [accountId, now, leaseExpiresAt],
      );
      if (result.rows[0] === undefined) throw new Error('MATCHMAKING_NOT_QUEUED');
      return matchmakingStatusSchema.parse({
        status: 'QUEUED',
        leaseExpiresAtMs: leaseExpiresAt.getTime(),
      });
    });
  }

  public async leaveMatchmaking(accountId: string): Promise<MatchmakingStatus> {
    await transaction(this.#pool, async (db) => {
      await lockAccount(db, accountId);
      await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
    });
    return matchmakingStatusSchema.parse({ status: 'IDLE' });
  }

  public async createChallenge(accountId: string): Promise<CreateChallengeResponse> {
    const id = challengeIdSchema.parse(randomUUID());
    const inviteToken = newInviteToken();

    return transaction(this.#pool, async (db) => {
      await lockAccount(db, accountId);
      if ((await activeMatchId(db, accountId)) !== null) throw new Error('MATCH_ALREADY_ACTIVE');

      const now = new Date(this.#now());
      const expiresAt = new Date(now.getTime() + this.#challengeTtlMs);
      await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = $1', [accountId]);
      await cancelOutgoingChallenges(db, [accountId], now);

      const row = (
        await db.query<ChallengeRow>(
          `INSERT INTO caravan_private_challenges
             (id, inviter_account_id, invite_token_hash, status, created_at, expires_at)
           VALUES ($1, $2, $3, 'PENDING', $4, $5)
           RETURNING id::text,
                     inviter_account_id::text,
                     status,
                     resolved_by_account_id::text,
                     match_id::text,
                     created_at,
                     expires_at`,
          [id, accountId, tokenHash(inviteToken), now, expiresAt],
        )
      ).rows[0];
      if (row === undefined) throw new Error('INTERNAL_ERROR');
      return { challenge: challengeView(row), inviteToken };
    });
  }

  public async challengeStatus(accountId: string, challengeId: ChallengeId): Promise<ChallengeView> {
    const row = (
      await this.#pool.query<ChallengeRow>(
        `SELECT id::text,
                inviter_account_id::text,
                status,
                resolved_by_account_id::text,
                match_id::text,
                created_at,
                expires_at
           FROM caravan_private_challenges
          WHERE id = $1
            AND (inviter_account_id = $2 OR resolved_by_account_id = $2)`,
        [challengeId, accountId],
      )
    ).rows[0];
    if (row === undefined) throw new Error('CHALLENGE_NOT_FOUND');

    if (row.status === 'PENDING' && row.expires_at.getTime() <= this.#now()) {
      return transaction(this.#pool, async (db) => {
        await lockAccount(db, row.inviter_account_id);
        const locked = await loadChallengeByIdForUpdate(db, challengeId);
        if (locked === null) throw new Error('CHALLENGE_NOT_FOUND');
        if (locked.status === 'PENDING' && locked.expires_at.getTime() <= this.#now()) {
          const expired = (
            await db.query<ChallengeRow>(
              `UPDATE caravan_private_challenges
                  SET status = 'EXPIRED', resolved_at = $2
                WHERE id = $1
                RETURNING id::text,
                          inviter_account_id::text,
                          status,
                          resolved_by_account_id::text,
                          match_id::text,
                          created_at,
                          expires_at`,
              [challengeId, new Date(this.#now())],
            )
          ).rows[0];
          if (expired === undefined) throw new Error('INTERNAL_ERROR');
          return challengeView(expired);
        }
        return challengeView(locked);
      });
    }

    return challengeView(row);
  }

  public async acceptChallenge(accountId: string, inviteToken: InviteToken): Promise<AcceptedChallenge> {
    return transaction(this.#pool, async (db) => {
      const initial = (
        await db.query<ChallengeRow>(
          `SELECT id::text,
                  inviter_account_id::text,
                  status,
                  resolved_by_account_id::text,
                  match_id::text,
                  created_at,
                  expires_at
             FROM caravan_private_challenges
            WHERE invite_token_hash = $1`,
          [tokenHash(inviteToken)],
        )
      ).rows[0];
      if (initial === undefined) throw new Error('CHALLENGE_NOT_FOUND');
      if (initial.inviter_account_id === accountId) throw new Error('CANNOT_ACCEPT_OWN_CHALLENGE');

      await lockAccounts(db, [initial.inviter_account_id, accountId]);
      const row = await loadChallengeByIdForUpdate(db, challengeIdSchema.parse(initial.id));
      if (row === null) throw new Error('CHALLENGE_NOT_FOUND');

      if (row.status === 'ACCEPTED' && row.resolved_by_account_id === accountId && row.match_id !== null) {
        const matchId = matchIdSchema.parse(row.match_id);
        return { challenge: challengeView(row) as AcceptedChallenge['challenge'], matchId };
      }
      if (row.status !== 'PENDING') throw new Error('CHALLENGE_UNAVAILABLE');

      const now = new Date(this.#now());
      if (row.expires_at.getTime() <= now.getTime()) {
        await db.query(
          `UPDATE caravan_private_challenges
              SET status = 'EXPIRED', resolved_at = $2
            WHERE id = $1`,
          [row.id, now],
        );
        throw new Error('CHALLENGE_EXPIRED');
      }

      if ((await activeMatchId(db, row.inviter_account_id)) !== null) {
        throw new Error('CHALLENGE_UNAVAILABLE');
      }
      if ((await activeMatchId(db, accountId)) !== null) throw new Error('MATCH_ALREADY_ACTIVE');

      const matchService = new MatchService(new PostgresMatchStore(db));
      const { matchId } = await matchService.createMatch({
        participants: { A: row.inviter_account_id, B: accountId },
      });

      const accepted = (
        await db.query<ChallengeRow>(
          `UPDATE caravan_private_challenges
              SET status = 'ACCEPTED',
                  resolved_by_account_id = $2,
                  match_id = $3,
                  resolved_at = $4
            WHERE id = $1
            RETURNING id::text,
                      inviter_account_id::text,
                      status,
                      resolved_by_account_id::text,
                      match_id::text,
                      created_at,
                      expires_at`,
          [row.id, accountId, matchId, now],
        )
      ).rows[0];
      if (accepted === undefined) throw new Error('INTERNAL_ERROR');

      await db.query('DELETE FROM caravan_matchmaking_queue WHERE account_id = ANY($1::uuid[])', [
        [row.inviter_account_id, accountId],
      ]);
      await cancelOutgoingChallenges(db, [row.inviter_account_id, accountId], now);
      return { challenge: challengeView(accepted) as AcceptedChallenge['challenge'], matchId };
    });
  }

  public async declineChallenge(accountId: string, inviteToken: InviteToken): Promise<ChallengeResolution> {
    return transaction(this.#pool, async (db) => {
      const row = (
        await db.query<ChallengeRow>(
          `SELECT id::text,
                  inviter_account_id::text,
                  status,
                  resolved_by_account_id::text,
                  match_id::text,
                  created_at,
                  expires_at
             FROM caravan_private_challenges
            WHERE invite_token_hash = $1
            FOR UPDATE`,
          [tokenHash(inviteToken)],
        )
      ).rows[0];
      if (row === undefined) throw new Error('CHALLENGE_NOT_FOUND');
      if (row.inviter_account_id === accountId) throw new Error('CANNOT_DECLINE_OWN_CHALLENGE');
      if (row.status !== 'PENDING') throw new Error('CHALLENGE_UNAVAILABLE');

      const now = new Date(this.#now());
      const status: ChallengeStatus = row.expires_at.getTime() <= now.getTime() ? 'EXPIRED' : 'DECLINED';
      const resolved = (
        await db.query<ChallengeRow>(
          `UPDATE caravan_private_challenges
              SET status = $2,
                  resolved_by_account_id = CASE WHEN $2 = 'DECLINED' THEN $3::uuid ELSE NULL END,
                  resolved_at = $4
            WHERE id = $1
            RETURNING id::text,
                      inviter_account_id::text,
                      status,
                      resolved_by_account_id::text,
                      match_id::text,
                      created_at,
                      expires_at`,
          [row.id, status, accountId, now],
        )
      ).rows[0];
      if (resolved === undefined) throw new Error('INTERNAL_ERROR');
      return { challenge: challengeView(resolved) };
    });
  }

  public async cancelChallenge(accountId: string, challengeId: ChallengeId): Promise<ChallengeResolution> {
    return transaction(this.#pool, async (db) => {
      await lockAccount(db, accountId);
      const row = await loadChallengeByIdForUpdate(db, challengeId);
      if (row === null || row.inviter_account_id !== accountId) throw new Error('CHALLENGE_NOT_FOUND');
      if (row.status === 'CANCELLED') return { challenge: challengeView(row) };
      if (row.status !== 'PENDING') throw new Error('CHALLENGE_UNAVAILABLE');

      const now = new Date(this.#now());
      const status: ChallengeStatus = row.expires_at.getTime() <= now.getTime() ? 'EXPIRED' : 'CANCELLED';
      const resolved = (
        await db.query<ChallengeRow>(
          `UPDATE caravan_private_challenges
              SET status = $2, resolved_at = $3
            WHERE id = $1
            RETURNING id::text,
                      inviter_account_id::text,
                      status,
                      resolved_by_account_id::text,
                      match_id::text,
                      created_at,
                      expires_at`,
          [challengeId, status, now],
        )
      ).rows[0];
      if (resolved === undefined) throw new Error('INTERNAL_ERROR');
      return { challenge: challengeView(resolved) };
    });
  }
}
