import { createHmac } from 'node:crypto';
import type { Config } from '../src/config.js';

export const TEST_BOT_TOKEN = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';

interface SignedInitDataOptions {
  userId?: number;
  firstName?: string;
  languageCode?: string;
  authDate?: number;
}

export function signedTelegramInitData(options: SignedInitDataOptions = {}): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(options.authDate ?? Math.floor(Date.now() / 1000)));
  params.set('query_id', 'AAE-test-query');
  params.set(
    'user',
    JSON.stringify({
      id: options.userId ?? 1_234_567,
      first_name: options.firstName ?? 'Ada',
      language_code: options.languageCode ?? 'en',
    }),
  );

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(TEST_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

export function testConfig(databaseUrl: string): Config {
  return {
    NODE_ENV: 'test',
    SERVER_HOST: '127.0.0.1',
    SERVER_PORT: 3000,
    DATABASE_URL: databaseUrl,
    BOT_TOKEN: TEST_BOT_TOKEN,
    PUBLIC_ORIGIN: 'http://localhost:5173',
    SESSION_HOURS: 24,
    TELEGRAM_AUTH_MAX_AGE_SECONDS: 300,
    TURN_TIMEOUT_SECONDS: 60,
    RECONNECT_GRACE_SECONDS: 30,
  };
}
