export type BotEnvironment = 'development' | 'test' | 'production';

export interface BotConfig {
  readonly NODE_ENV: BotEnvironment;
  readonly PUBLIC_ORIGIN: string;
  readonly BOT_TOKEN: string;
  readonly BOT_USERNAME: string;
  readonly BOT_HOST: string;
  readonly BOT_PORT: number;
  readonly TELEGRAM_WEBHOOK_SECRET: string;
}

const BOT_TOKEN_PATTERN = /^\d{5,}:[A-Za-z0-9_-]{20,}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const WEBHOOK_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseEnvironment(value: string | undefined): BotEnvironment {
  const environment = value?.trim() ?? 'development';
  if (environment === 'development' || environment === 'test' || environment === 'production') {
    return environment;
  }
  throw new Error('NODE_ENV must be development, test, or production.');
}

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim().length === 0) return 3001;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('BOT_PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parsePublicOrigin(value: string, environment: BotEnvironment): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('PUBLIC_ORIGIN must be a valid URL.');
  }

  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('PUBLIC_ORIGIN must be an origin without credentials, query, or fragment.');
  }
  if (url.pathname !== '/' && url.pathname !== '') {
    throw new Error('PUBLIC_ORIGIN must not include a path.');
  }
  if (environment === 'production' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN must use HTTPS in production.');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('PUBLIC_ORIGIN must use HTTP or HTTPS.');
  }

  return url.origin;
}

export function loadBotConfig(env: NodeJS.ProcessEnv = process.env): BotConfig {
  const NODE_ENV = parseEnvironment(env.NODE_ENV);
  const BOT_TOKEN = required(env, 'BOT_TOKEN');
  const BOT_USERNAME = required(env, 'BOT_USERNAME').replace(/^@/, '');
  const TELEGRAM_WEBHOOK_SECRET = required(env, 'TELEGRAM_WEBHOOK_SECRET');

  if (!BOT_TOKEN_PATTERN.test(BOT_TOKEN)) {
    throw new Error('BOT_TOKEN has an invalid Telegram bot-token shape.');
  }
  if (!BOT_USERNAME_PATTERN.test(BOT_USERNAME)) {
    throw new Error('BOT_USERNAME must contain 5-32 Telegram username characters without @.');
  }
  if (!WEBHOOK_SECRET_PATTERN.test(TELEGRAM_WEBHOOK_SECRET)) {
    throw new Error('TELEGRAM_WEBHOOK_SECRET must contain 32-256 URL-safe characters.');
  }

  return {
    NODE_ENV,
    PUBLIC_ORIGIN: parsePublicOrigin(required(env, 'PUBLIC_ORIGIN'), NODE_ENV),
    BOT_TOKEN,
    BOT_USERNAME,
    BOT_HOST: env.BOT_HOST?.trim() || '0.0.0.0',
    BOT_PORT: parsePort(env.BOT_PORT),
    TELEGRAM_WEBHOOK_SECRET,
  };
}
