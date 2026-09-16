import { describe, expect, it } from 'vitest';
import { loadBotConfig } from '../src/config.js';

function baseEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'development',
    PUBLIC_ORIGIN: 'http://localhost:5173',
    BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
    BOT_USERNAME: '@CaravanExampleBot',
    TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
  };
}

describe('bot configuration', () => {
  it('loads safe defaults and normalizes the bot username', () => {
    expect(loadBotConfig(baseEnv())).toEqual({
      NODE_ENV: 'development',
      PUBLIC_ORIGIN: 'http://localhost:5173',
      BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
      BOT_USERNAME: 'CaravanExampleBot',
      BOT_HOST: '0.0.0.0',
      BOT_PORT: 3001,
      TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
    });
  });

  it('requires HTTPS for the public origin in production', () => {
    const env = baseEnv();
    env.NODE_ENV = 'production';
    expect(() => loadBotConfig(env)).toThrow('PUBLIC_ORIGIN must use HTTPS in production.');
  });

  it('rejects weak webhook secrets without echoing them', () => {
    const env = baseEnv();
    env.TELEGRAM_WEBHOOK_SECRET = 'secret';
    expect(() => loadBotConfig(env)).toThrow(
      'TELEGRAM_WEBHOOK_SECRET must contain 32-256 URL-safe characters.',
    );
  });
});
