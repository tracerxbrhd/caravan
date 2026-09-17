import { challengeResolutionSchema, createChallengeResponseSchema } from '@caravan/protocol';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SESSION_COOKIE_NAME, buildServer, createPool, migrateDatabase } from '../src/index.js';
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

describeDatabase('private challenge decline route', () => {
  const requiredDatabaseUrl = databaseUrl as string;
  const pool = createPool(requiredDatabaseUrl);
  const config = testConfig(requiredDatabaseUrl);
  let app: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    await migrateDatabase(pool);
    app = await buildServer(pool, config, { realtime: false });
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE TABLE caravan_private_challenges, caravan_matchmaking_queue, caravan_matches, sessions, account_identities, accounts CASCADE',
    );
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

  it('lets an authenticated invitee decline a pending deep-link invitation', async () => {
    const inviter = await authenticate(40_001, 'Inviter');
    const invitee = await authenticate(40_002, 'Invitee');

    const create = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      headers: { cookie: inviter },
    });
    expect(create.statusCode).toBe(200);
    const created = createChallengeResponseSchema.parse(create.json());

    const decline = await app.inject({
      method: 'POST',
      url: '/api/challenges/decline',
      headers: { cookie: invitee },
      payload: { inviteToken: created.inviteToken },
    });
    expect(decline.statusCode).toBe(200);
    expect(challengeResolutionSchema.parse(decline.json()).challenge).toMatchObject({
      id: created.challenge.id,
      status: 'DECLINED',
      matchId: null,
    });

    const inviterStatus = await app.inject({
      method: 'GET',
      url: `/api/challenges/${created.challenge.id}`,
      headers: { cookie: inviter },
    });
    expect(inviterStatus.statusCode).toBe(200);
    expect(inviterStatus.json()).toMatchObject({
      id: created.challenge.id,
      status: 'DECLINED',
      matchId: null,
    });
  });

  it('rejects accepting an invitation after it was declined', async () => {
    const inviter = await authenticate(40_011, 'Inviter');
    const invitee = await authenticate(40_012, 'Invitee');

    const create = await app.inject({
      method: 'POST',
      url: '/api/challenges',
      headers: { cookie: inviter },
    });
    const created = createChallengeResponseSchema.parse(create.json());

    const decline = await app.inject({
      method: 'POST',
      url: '/api/challenges/decline',
      headers: { cookie: invitee },
      payload: { inviteToken: created.inviteToken },
    });
    expect(decline.statusCode).toBe(200);

    const accept = await app.inject({
      method: 'POST',
      url: '/api/challenges/accept',
      headers: { cookie: invitee },
      payload: { inviteToken: created.inviteToken },
    });
    expect(accept.statusCode).toBe(409);
    expect(accept.json()).toEqual({ code: 'CHALLENGE_UNAVAILABLE' });
  });
});
