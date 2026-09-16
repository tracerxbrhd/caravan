import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Config } from './config.js';
import { transaction } from './db.js';
import {
  opaqueSessionToken,
  sessionTokenHash,
  verifyTelegramInitData,
  type TelegramIdentity,
} from './auth.js';

export const SESSION_COOKIE_NAME = 'caravan_session';

interface AccountRow {
  id: string;
  display_name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'BANNED';
}

export interface AccountProfile {
  id: string;
  displayName: string;
}

export interface AuthenticatedSession {
  accountId: string;
  token: string;
  expiresAt: Date;
}

function initialDisplayName(identity: TelegramIdentity): string {
  const compact = identity.firstName.trim().replace(/\s+/g, ' ');
  const limited = Array.from(compact).slice(0, 64).join('');
  return limited.length === 0 ? 'Merchant' : limited;
}

export async function authenticateTelegram(
  pool: pg.Pool,
  config: Config,
  rawInitData: string,
  nowMs = Date.now(),
): Promise<AuthenticatedSession> {
  const identity = verifyTelegramInitData(
    rawInitData,
    config.BOT_TOKEN,
    Math.floor(nowMs / 1000),
    config.TELEGRAM_AUTH_MAX_AGE_SECONDS,
  );

  return transaction(pool, async (db) => {
    const lockKey = `TELEGRAM:${identity.subject}`;
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [lockKey]);

    let accountId = (
      await db.query<{ account_id: string }>(
        `SELECT account_id::text
         FROM account_identities
         WHERE provider = 'TELEGRAM' AND provider_subject = $1`,
        [identity.subject],
      )
    ).rows[0]?.account_id;

    if (accountId === undefined) {
      accountId = randomUUID();
      await db.query(
        `INSERT INTO accounts (id, display_name)
         VALUES ($1, $2)`,
        [accountId, initialDisplayName(identity)],
      );
      await db.query(
        `INSERT INTO account_identities (id, account_id, provider, provider_subject)
         VALUES ($1, $2, 'TELEGRAM', $3)`,
        [randomUUID(), accountId, identity.subject],
      );
    }

    const account = (
      await db.query<AccountRow>(
        `SELECT id::text, display_name, status
         FROM accounts
         WHERE id = $1
         FOR UPDATE`,
        [accountId],
      )
    ).rows[0];

    if (account === undefined) throw new Error('ACCOUNT_NOT_FOUND');
    if (account.status !== 'ACTIVE') throw new Error('ACCOUNT_DISABLED');

    const token = opaqueSessionToken();
    const expiresAt = new Date(nowMs + config.SESSION_HOURS * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO sessions (token_hash, account_id, expires_at)
       VALUES ($1, $2, $3)`,
      [sessionTokenHash(token), account.id, expiresAt],
    );

    return { accountId: account.id, token, expiresAt };
  });
}

export async function sessionAccount(pool: pg.Pool, token: string | undefined): Promise<string> {
  if (token === undefined || token.length === 0) throw new Error('UNAUTHENTICATED');

  const found = (
    await pool.query<{ account_id: string }>(
      `SELECT s.account_id::text
       FROM sessions s
       JOIN accounts a ON a.id = s.account_id
       WHERE s.token_hash = $1
         AND s.revoked_at IS NULL
         AND s.expires_at > now()
         AND a.status = 'ACTIVE'`,
      [sessionTokenHash(token)],
    )
  ).rows[0];

  if (found === undefined) throw new Error('UNAUTHENTICATED');
  return found.account_id;
}

export async function accountProfile(pool: pg.Pool, accountId: string): Promise<AccountProfile> {
  const account = (
    await pool.query<AccountRow>(
      `SELECT id::text, display_name, status
       FROM accounts
       WHERE id = $1`,
      [accountId],
    )
  ).rows[0];

  if (account === undefined) throw new Error('ACCOUNT_NOT_FOUND');
  if (account.status !== 'ACTIVE') throw new Error('ACCOUNT_DISABLED');
  return { id: account.id, displayName: account.display_name };
}

export async function revokeSession(pool: pg.Pool, token: string | undefined): Promise<void> {
  if (token === undefined || token.length === 0) return;
  await pool.query(
    `UPDATE sessions
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE token_hash = $1`,
    [sessionTokenHash(token)],
  );
}
