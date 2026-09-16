import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify from 'fastify';
import type pg from 'pg';
import { z } from 'zod';
import {
  SESSION_COOKIE_NAME,
  accountProfile,
  authenticateTelegram,
  revokeSession,
  sessionAccount,
} from './accounts.js';
import type { Config } from './config.js';

const telegramAuthBodySchema = z
  .object({
    initData: z.string().min(1).max(12_000),
  })
  .strict();

function publicErrorCode(error: unknown): string {
  if (error instanceof z.ZodError) return 'INVALID_INPUT';
  if (!(error instanceof Error)) return 'INTERNAL_ERROR';
  return /^[A-Z_]+$/.test(error.message) ? error.message : 'INTERNAL_ERROR';
}

function statusForError(code: string): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'ACCOUNT_DISABLED') return 403;
  if (code === 'INTERNAL_ERROR' || code === 'ACCOUNT_NOT_FOUND') return 500;
  return 400;
}

export async function buildServer(pool: pg.Pool, config: Config) {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: [
        'req.headers.cookie',
        'req.headers.authorization',
        'req.body.initData',
        'res.headers.set-cookie',
      ],
    },
    bodyLimit: 16_384,
    disableRequestLogging: true,
  });

  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });

  const expectedOrigin = new URL(config.PUBLIC_ORIGIN);
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url === '/ready' || config.NODE_ENV !== 'production') {
      return;
    }

    if (request.headers.host !== expectedOrigin.host) {
      return reply.code(403).send({ code: 'INVALID_HOST' });
    }

    if (
      request.method !== 'GET' &&
      request.method !== 'HEAD' &&
      request.method !== 'OPTIONS' &&
      request.headers.origin !== config.PUBLIC_ORIGIN
    ) {
      return reply.code(403).send({ code: 'INVALID_ORIGIN' });
    }
  });

  app.setErrorHandler((error, request, reply) => {
    const code = publicErrorCode(error);
    app.log.warn({ code, path: request.routeOptions.url }, 'Request rejected');
    return reply.code(statusForError(code)).send({ code });
  });

  app.get('/health', async () => ({ status: 'ok' as const }));

  app.get('/ready', async () => {
    await pool.query('SELECT 1');
    return { status: 'ready' as const };
  });

  app.post(
    '/api/auth/telegram',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const body = telegramAuthBodySchema.parse(request.body);
      const session = await authenticateTelegram(pool, config, body.initData);
      reply.setCookie(SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: config.SESSION_HOURS * 60 * 60,
      });
      return accountProfile(pool, session.accountId);
    },
  );

  app.get('/api/me', async (request) => {
    const accountId = await sessionAccount(pool, request.cookies[SESSION_COOKIE_NAME]);
    return accountProfile(pool, accountId);
  });

  app.post('/api/logout', async (request, reply) => {
    await revokeSession(pool, request.cookies[SESSION_COOKIE_NAME]);
    reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { ok: true as const };
  });

  return app;
}
