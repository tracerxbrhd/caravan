import { randomUUID } from 'node:crypto';
import { PROTOCOL_VERSION } from '@caravan/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  MatchService,
  PostgresMatchStore,
  RematchService,
  createPool,
  migrateDatabase,
} from '../src/index.js';

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

async function createFinishedMatch(
  pool: ReturnType<typeof createPool>,
  first: string,
  second: string,
) {
  const matches = new MatchService(new PostgresMatchStore(pool));
  const { matchId } = await matches.createMatch({ participants: { A: first, B: second } });
  const result = await matches.handleCommand(first, {
    protocolVersion: PROTOCOL_VERSION,
    type: 'SURRENDER',
    matchId,
    commandId: randomUUID(),
    expectedStateVersion: 0,
  });
  if (result.type !== 'SNAPSHOT' || result.snapshot.status !== 'FINISHED') {
    throw new Error('Expected source match to finish.');
  }
  return matchId;
}

describeDatabase('durable rematch handshake', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);
  const service = new RematchService(pool, { ttlMs: 60_000 });

  beforeAll(async () => {
    await migrateDatabase(pool);
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE caravan_rematch_requests, caravan_private_challenges, caravan_matchmaking_queue, caravan_matches, sessions, account_identities, accounts CASCADE',
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  it('requires both finished-match participants before creating one fresh authoritative match', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');
    const sourceMatchId = await createFinishedMatch(pool, first, second);

    const requested = await service.request(first, sourceMatchId);
    expect(requested).toMatchObject({ status: 'WAITING', requestedBy: 'YOU' });
    expect(await service.status(second, sourceMatchId)).toMatchObject({
      status: 'WAITING',
      requestedBy: 'OPPONENT',
    });

    const accepted = await service.request(second, sourceMatchId);
    expect(accepted.status).toBe('MATCH_FOUND');
    if (accepted.status !== 'MATCH_FOUND') throw new Error('Expected rematch.');

    expect(await service.status(first, sourceMatchId)).toEqual(accepted);
    expect(await service.request(first, sourceMatchId)).toEqual(accepted);

    const counts = (
      await pool.query<{ active: number; finished: number; accepted: number }>(
        `SELECT
           (SELECT count(*)::integer FROM caravan_matches WHERE status = 'ACTIVE') AS active,
           (SELECT count(*)::integer FROM caravan_matches WHERE status = 'FINISHED') AS finished,
           (SELECT count(*)::integer FROM caravan_rematch_requests WHERE status = 'ACCEPTED') AS accepted`,
      )
    ).rows[0];
    expect(counts).toEqual({ active: 1, finished: 1, accepted: 1 });
  });

  it('serializes simultaneous requests so a source match can create only one rematch', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');
    const sourceMatchId = await createFinishedMatch(pool, first, second);

    await Promise.all([
      service.request(first, sourceMatchId),
      service.request(second, sourceMatchId),
    ]);

    const [firstStatus, secondStatus] = await Promise.all([
      service.status(first, sourceMatchId),
      service.status(second, sourceMatchId),
    ]);
    expect(firstStatus.status).toBe('MATCH_FOUND');
    expect(secondStatus).toEqual(firstStatus);

    const activeMatches = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM caravan_matches WHERE status = 'ACTIVE'",
      )
    ).rows[0]?.count;
    expect(activeMatches).toBe(1);
  });

  it('does not create a rematch if either participant already entered another active match', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');
    const third = await createAccount(pool, 'Third');
    const sourceMatchId = await createFinishedMatch(pool, first, second);

    await service.request(first, sourceMatchId);

    const matches = new MatchService(new PostgresMatchStore(pool));
    await matches.createMatch({ participants: { A: second, B: third } });

    await expect(service.request(second, sourceMatchId)).rejects.toThrow('REMATCH_UNAVAILABLE');
    expect(await service.status(first, sourceMatchId)).toEqual({ status: 'IDLE' });

    const activeMatches = (
      await pool.query<{ count: number }>(
        "SELECT count(*)::integer AS count FROM caravan_matches WHERE status = 'ACTIVE'",
      )
    ).rows[0]?.count;
    expect(activeMatches).toBe(1);
  });

  it('hides rematch state from accounts that did not participate in the source match', async () => {
    const first = await createAccount(pool, 'First');
    const second = await createAccount(pool, 'Second');
    const stranger = await createAccount(pool, 'Stranger');
    const sourceMatchId = await createFinishedMatch(pool, first, second);

    await expect(service.status(stranger, sourceMatchId)).rejects.toThrow('MATCH_NOT_FOUND');
    await expect(service.request(stranger, sourceMatchId)).rejects.toThrow('MATCH_NOT_FOUND');
  });
});
