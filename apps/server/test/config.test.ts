import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';
import { TEST_BOT_TOKEN } from './auth-fixtures.js';

const required = {
  DATABASE_URL: 'postgresql://caravan:test@127.0.0.1:5432/caravan_test',
  BOT_TOKEN: TEST_BOT_TOKEN,
};

describe('server configuration', () => {
  it('applies safe development defaults around required secrets and database configuration', () => {
    const config = loadConfig(required);
    expect(config.NODE_ENV).toBe('development');
    expect(config.SERVER_HOST).toBe('0.0.0.0');
    expect(config.SERVER_PORT).toBe(3000);
    expect(config.PUBLIC_ORIGIN).toBe('http://localhost:5173');
    expect(config.SESSION_HOURS).toBe(168);
    expect(config.TELEGRAM_AUTH_MAX_AGE_SECONDS).toBe(300);
    expect(config.TURN_TIMEOUT_SECONDS).toBe(60);
    expect(config.RECONNECT_GRACE_SECONDS).toBe(30);
    expect(config.MATCHMAKING_LEASE_SECONDS).toBe(90);
    expect(config.CHALLENGE_TTL_SECONDS).toBe(900);
    expect(config.REMATCH_TTL_SECONDS).toBe(900);
  });

  it('fails fast when required backend identity configuration is missing', () => {
    expect(() => loadConfig({ DATABASE_URL: required.DATABASE_URL })).toThrow();
    expect(() => loadConfig({ BOT_TOKEN: required.BOT_TOKEN })).toThrow();
  });

  it('requires HTTPS public origin in production', () => {
    expect(() =>
      loadConfig({
        ...required,
        NODE_ENV: 'production',
        PUBLIC_ORIGIN: 'http://caravan.example',
      }),
    ).toThrow(/HTTPS/);
  });
});
