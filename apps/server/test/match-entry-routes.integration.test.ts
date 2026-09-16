import { randomUUID } from 'node:crypto';
import {
  PROTOCOL_VERSION,
  acceptedChallengeSchema,
  createChallengeResponseSchema,
  matchmakingStatusSchema,
  rematchStatusSchema,
} from '@caravan/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE_NAME,
  MatchService,
  PostgresMatchStore,
  buildServer,
  createPool,
  migrateDatabase,
} from '../src/index.js';
import { signedTelegramInitData, testConfig } from './auth-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CARAVAN_REQUIRE_DATABASE_TESTS === '1' && databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required when CARAVAN_REQUIRE_DATABASE_TESTS=1.');
}

const describeDatabase = databaseUrl === undefined ? describe.skip : describe;

function cookiePair(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) throw new Error('Expected authentication to set a session cookie.');
  const [pair] = value.split(';');
  if (pair === undefined || !pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Expected CARAVAN session cookie.');
  }
  return pair;
}

describeDatabase('authenticated match entry routes', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);
  const config = testConfig(requiredDatabaseUrl);
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    await migrateDatabase(pool);
    app = await buildServer(pool, config, { realtime: false });
  });

  beforeEach(async () => {
    await pool.query('TRUNCATE TABLE sessions, account_identities, accounts CASCADE');
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function authenticate(userId: number, firstName: string): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: signedTelegramInitData({ userId, firstName }) },
    });
    expect(response.statusCode).toBe(200);
    return cookiePair(response.headers['set-cookie']);
  }

  async function accountId(displayName: string): Promise<string> {
    const row = (
      await pool.query<{ id: string }>('SELECT id::text FROM accounts WHERE display_name = $1', [
        displayName,
      ])
    ).rows[0];
    if (row === undefined) throw new Error('Expected account.');
    return row.id;
  }

  it('requires an authenticated CARAVAN session for match entry', async () => {
    const matchmaking = await app.inject({ method: 'GET', url: '/api/matchmaking' });
    const challenge = await app.inject({ method: 'POST', url: '/api/challenges' });
    const rematch = await app.inject({
      method: 'GET',
      url: '/api/matches/00000000-0000-4000-8000-000000000001/rematch',
    });

    expect(matchmaking.statusCode).toBe(401);
    expect(matchmaking.json()).toEqual({ code: 'UNAUTHENTICATED' });
    expect(challenge.statusCode).toBe(401);
    expect(challenge.json()).toEqual({ code: 'UNAUTHENTICATED' });
    expect(rematch.statusCode).toBe(401);
    expect(rematch.json()).toEqual({ code: 'UNAUTHENTICATED' });
  });

  it('pairs two authenticated accounts through the casual HTTP API', async () => {
    const first = await authenticate(10_001, 'First');
    const second = await authenticate(10_002, 'Second');

    const firstJoin = await app.inject({
      method: 'POST',
      url: '/api/matchmaking/join',
      headers: { cookie: first },
    });
    expect(firstJoin.statusCode).toBe(200);
    expect(matchmakingStatusSchema.parse(firstJoin.json()).status).toBe('QUEUED');

    const secondJoin = await app.inject({
      method: 'POST',
      url: '/api/matchmaking/join',
      headers: { cookie: second },
    });
    expect(secondJoin.statusCode).toBe(200);
    const found = matchmakingStatusSchema.parse(secondJoin.json());
    expect(found.status).toBe('MATCH_FOUND');

    const firstStatus = await app.inject({
      method: 'GET',
      url: '/api/matchmaking',
      headers: { cookie: first },
    });
    expect(firstStatus.statusCode).toBe(200);
    expect(matchmakingStatusSchema.parse(firstStatus.json())).toEqual(found);
  });

  it('creates and accepts a private invite without exposing its status to a third account', async () => {
    const inviter = await authenticate(20_001, 'Inviter');
    const invitee = await authenticate(20_002, 'Invitee');
    const stranger = await authenticate(20_003, 'Stranger');

    const create = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      headers: { cookie: inviter },
    });
    expect(create.statusCode).toBe(200);
    const created = createChallengeResponseSchema.parse(create.json());

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.challenge.id}`,
      headers: { cookie: stranger },
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ code: 'CHALLENGE_NOT_FOUND' });

    const accept = await app.inject({
      method: 'POST',
      url: '/api/challenges/accept',
      headers: { cookie: invitee },
      payload: { inviteToken: created.inviteToken },
    });
    expect(accept.statusCode).toBe(200);
    const accepted = acceptedChallengeSchema.parse(accept.json());
    expect(accepted.challenge.id).toBe(created.challenge.id);
    expect(accepted.challenge.status).toBe('ACCEPTED');

    const inviterStatus = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.challenge.id}`,
      headers: { cookie: inviter },
    });
    expect(inviterStatus.statusCode).toBe(200);
    expect(inviterStatus.json()).toMatchObject({
      id: created.challenge.id,
      status: 'ACCEPTED',
      matchId: accepted.matchId,
    });
  });

  it('completes a rematch handshake through authenticated HTTP without exposing it to strangers', async () => {
    const firstCookie = await authenticate(30_001, 'First');
    const secondCookie = await authenticate(30_002, 'Second');
    const strangerCookie = await authenticate(30_003, 'Stranger');
    const first = await accountId('First');
    const second = await accountId('Second');

    const matches = new MatchService(new PostgresMatchStore(pool));
    const { matchId } = await matches.createMatch({ participants: { A: first, B: second } });
    await matches.handleCommand(first, {
      protocolVersion: PROTOCOL_VERSION,
      type: 'SURRENDER',
      matchId,
      commandId: randomUUID(),
      expectedStateVersion: 0,
    });

    const hidden = await app.inject({
      method: 'GET',
      url: `/api/matches/${matchId}/rematch`,
      headers: { cookie: strangerCookie },
    });
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ code: 'MATCH_NOT_FOUND' });

    const request = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/rematch`,
      headers: { cookie: firstCookie },
    });
    expect(request.statusCode).toBe(200);
    expect(rematchStatusSchema.parse(request.json())).toMatchObject({
      status: 'WAITING',
      requestedBy: 'YOU',
    });

    const opponentStatus = await app.inject({
      method: 'GET',
      url: `/api/matches/${matchId}/rematch`,
      headers: { cookie: secondCookie },
    });
    expect(opponentStatus.statusCode).toBe(200);
    expect(rematchStatusSchema.parse(opponentStatus.json())).toMatchObject({
      status: 'WAITING',
      requestedBy: 'OPPONENT',
    });

    const accept = await app.inject({
      method: 'POST',
      url: `/api/matches/${matchId}/rematch`,
      headers: { cookie: secondCookie },
    });
    expect(accept.statusCode).toBe(200);
    expect(rematchStatusSchema.parse(accept.json()).status).toBe('MATCH_FOUND');
  });
});
