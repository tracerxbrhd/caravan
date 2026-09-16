import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { MatchEntryService, createPool, migrateDatabase } from '../src/index.js';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CARAVAN_REQUIRE_DATABASE_TESTS === '1' && databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required when CARAVAN_REQUIRE_DATABASE_TESTS=1.');
}

const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

async function createAccount(
  pool: ReturnType<typeof createPool>,
  displayName: string,
): Promise<string> {
  const id = randomUUID();
  await pool.query('INSERT INTO accounts (id, display_name) VALUES ($1, $2)', [id, displayName]);
  return id;
}

describeDatabase('durable match entry', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);
  const service = new MatchEntryService(pool, {
    matchmakingLeaseMs: 60_000,
    challengeTtlMs: 60_000,
  });

  beforeAll(async () => {
    await migrateDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE sessions, account_identities, accounts CASCADE');
  });

  afterAll(async () => {
    await pool.end();
  });

  it('pairs the oldest waiting player and exposes the same durable match to both accounts', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');

    expect((await service.joinMatchmaking(first)).status).toBe('QUEUED');
    const paired = await service.joinMatchmaking(second);
    expect(paired.status).toBe('MATCH_FOUND');
    if (paired.status !== 'MATCH_FOUND') throw new Error('Expected a match.');

    expect(await service.matchmakingStatus(first)).toEqual(paired);
    expect(await service.matchmakingStatus(second)).toEqual(paired);

    const counts = (
      await pool.query<{ matches: number; queued: number }>(
        `SELECT
           (SELECT count(*)::integer FROM caravan_matches WHERE status = 'ACTIVE') AS matches,
           (SELECT count(*)::integer FROM caravan_matchmaking_queue) AS queued`,
      )
    ).rows[0];
    expect(counts).toEqual({ matches: 1, queued: 0 });
  });

  it('serializes simultaneous queue joins so they cannot create duplicate or stranded pairings', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');

    await Promise.all([service.joinMatchmaking(first), service.joinMatchmaking(second)]);

    const [firstStatus, secondStatus] = await Promise.all([
      service.matchmakingStatus(first),
      service.matchmakingStatus(second),
    ]);
    expect(firstStatus.status).toBe('MATCH_FOUND');
    expect(secondStatus).toEqual(firstStatus);

    const matchCount = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM caravan_matches WHERE status = 'ACTIVE'",
      )
    ).rows[0]?.count;
    expect(matchCount).toBe(1);
  });

  it('accepts a private challenge idempotently and never persists the raw invite token', async () => {
    const inviter = await createAccount(pool, 'Inviter');
    const invitee = await createAccount(pool, 'Invitee');

    const created = await service.createChallenge(inviter);
    const persistedToken = (
      await pool.query<{ token_hex: string }>(
        `SELECT encode(invite_token_hash, 'hex') AS token_hex
         FROM caravan_private_challenges
         WHERE id = $1`,
        [created.challenge.id],
      )
    ).rows[0]?.token_hex;
    expect(persistedToken).toBeDefined();
    expect(persistedToken).not.toContain(created.inviteToken);

    const firstAccept = await service.acceptChallenge(invitee, created.inviteToken);
    const retry = await service.acceptChallenge(invitee, created.inviteToken);
    expect(retry.matchId).toBe(firstAccept.matchId);
    expect(retry.challenge.status).toBe('ACCEPTED');

    const matchCount = (
      await pool.query<{ count: number }>('SELECT count(*)::integer AS count FROM caravan_matches')
    ).rows[0]?.count;
    expect(matchCount).toBe(1);
  });

  it('allows only one winner when two accounts race to accept the same challenge', async () => {
    const inviter = await createAccount(pool, 'Inviter');
    const firstInvitee = await createAccount(pool, 'One');
    const secondInvitee = await createAccount(pool, 'Two');
    const created = await service.createChallenge(inviter);

    const results = await Promise.allSettled([
      service.acceptChallenge(firstInvitee, created.inviteToken),
      service.acceptChallenge(secondInvitee, created.inviteToken),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);

    const state = (
      await pool.query<{ matches: number; accepted: number }>(
        `SELECT
           (SELECT count(*)::integer FROM caravan_matches) AS matches,
           (SELECT count(*)::integer FROM caravan_private_challenges WHERE status = 'ACCEPTED') AS accepted`,
      )
    ).rows[0];
    expect(state).toEqual({ matches: 1, accepted: 1 });
  });

  it('prevents a player with an active match from opening a second match entry path', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');
    await service.joinMatchmaking(first);
    const match = await service.joinMatchmaking(second);
    expect(match.status).toBe('MATCH_FOUND');

    await expect(service.createChallenge(first)).rejects.toThrow('MATCH_ALREADY_ACTIVE');
    const rejoin = await service.joinMatchmaking(first);
    expect(rejoin.status).toBe('MATCH_FOUND');
  });
});
