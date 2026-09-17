import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  SESSION_COOKIE_NAME,
  buildServer,
  createPool,
  migrateDatabase,
  sessionTokenHash,
} from '../src/index.js';
import { signedTelegramInitData, testConfig } from './auth-fixtures.js';

const databaseUrl = process.env.DATABASE_URL;
if (process.env.CARAVAN_REQUIRE_DATABASE_TESTS === '1' && databaseUrl === undefined) {
  throw new Error('DATABASE_URL is required when CARAVAN_REQUIRE_DATABASE_TESTS=1.');
}

const describeDatabase = databaseUrl === undefined ? describe.skip : describe;
const profileSchema = z.object({ id: z.string().uuid(), displayName: z.string().min(1) }).strict();
const errorSchema = z.object({ code: z.string() }).strict();

function cookiePair(setCookie: string | string[] | undefined): string {
  const value = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (value === undefined) throw new Error('Expected authentication to set a session cookie.');
  const [pair] = value.split(';');
  if (pair === undefined || !pair.startsWith(`${SESSION_COOKIE_NAME}=`)) {
    throw new Error('Expected CARAVAN session cookie.');
  }
  return pair;
}

describeDatabase('authenticated server runtime', () => {
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

  it('exposes separate liveness and database readiness endpoints', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    expect(health.statusCode).toBe(200);
    expect(health.json()).toEqual({ status: 'ok' });
    expect(ready.statusCode).toBe(200);
    expect(ready.json()).toEqual({ status: 'ready' });
  });

  it('creates one provider-independent account and stores only a hash of the session token', async () => {
    const raw = signedTelegramInitData({ userId: 777, firstName: 'Courier' });
    const auth = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: raw },
    });
    expect(auth.statusCode).toBe(200);
    const profile = profileSchema.parse(auth.json());
    expect(profile.displayName).toBe('Courier');

    const cookie = cookiePair(auth.headers['set-cookie']);
    const token = cookie.slice(`${SESSION_COOKIE_NAME}=`.length);
    const persisted = (
      await pool.query<{
        account_id: string;
        provider: string;
        provider_subject: string;
        token_hash: string;
      }>(
        `SELECT a.id::text AS account_id, i.provider, i.provider_subject, s.token_hash
         FROM accounts a
         JOIN account_identities i ON i.account_id = a.id
         JOIN sessions s ON s.account_id = a.id`,
      )
    ).rows[0];
    if (persisted === undefined)
      throw new Error('Expected persisted account identity and session.');

    expect(persisted.account_id).toBe(profile.id);
    expect(persisted.provider).toBe('TELEGRAM');
    expect(persisted.provider_subject).toBe('777');
    expect(persisted.token_hash).toBe(sessionTokenHash(token));
    expect(persisted.token_hash).not.toBe(token);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(profileSchema.parse(me.json())).toEqual(profile);
  });

  it('reuses the same account for repeated Telegram authentication while rotating sessions', async () => {
    const raw = signedTelegramInitData({ userId: 888, firstName: 'Trader' });
    const first = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: raw },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: raw },
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(profileSchema.parse(second.json()).id).toBe(profileSchema.parse(first.json()).id);

    const counts = (
      await pool.query<{ accounts: number; identities: number; sessions: number }>(
        `SELECT
           (SELECT count(*)::integer FROM accounts) AS accounts,
           (SELECT count(*)::integer FROM account_identities) AS identities,
           (SELECT count(*)::integer FROM sessions) AS sessions`,
      )
    ).rows[0];
    expect(counts).toEqual({ accounts: 1, identities: 1, sessions: 2 });
  });

  it('rebinds the browser cookie to the Telegram identity authenticated on the new launch', async () => {
    const firstAuth = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: signedTelegramInitData({ userId: 1_001, firstName: 'Account A' }) },
    });
    expect(firstAuth.statusCode).toBe(200);
    const firstProfile = profileSchema.parse(firstAuth.json());
    const firstCookie = cookiePair(firstAuth.headers['set-cookie']);

    const secondAuth = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      headers: { cookie: firstCookie },
      payload: { initData: signedTelegramInitData({ userId: 1_002, firstName: 'Account B' }) },
    });
    expect(secondAuth.statusCode).toBe(200);
    const secondProfile = profileSchema.parse(secondAuth.json());
    const secondCookie = cookiePair(secondAuth.headers['set-cookie']);

    expect(secondProfile.id).not.toBe(firstProfile.id);
    expect(secondProfile.displayName).toBe('Account B');
    expect(secondCookie).not.toBe(firstCookie);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie: secondCookie } });
    expect(me.statusCode).toBe(200);
    expect(profileSchema.parse(me.json())).toEqual(secondProfile);
  });

  it('revokes only the presented session on logout and blocks disabled accounts from reauthenticating', async () => {
    const raw = signedTelegramInitData({ userId: 999, firstName: 'Scout' });
    const auth = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: raw },
    });
    const profile = profileSchema.parse(auth.json());
    const cookie = cookiePair(auth.headers['set-cookie']);

    const logout = await app.inject({
      method: 'POST',
      url: '/api/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);

    const me = await app.inject({ method: 'GET', url: '/api/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
    expect(errorSchema.parse(me.json())).toEqual({ code: 'UNAUTHENTICATED' });

    await pool.query("UPDATE accounts SET status = 'BANNED' WHERE id = $1", [profile.id]);
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/telegram',
      payload: { initData: raw },
    });
    expect(blocked.statusCode).toBe(403);
    expect(errorSchema.parse(blocked.json())).toEqual({ code: 'ACCOUNT_DISABLED' });
  });
});
