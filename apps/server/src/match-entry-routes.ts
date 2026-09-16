import type { FastifyInstance } from 'fastify';
import type pg from 'pg';
import {
  challengeIdSchema,
  inviteTokenRequestSchema,
  matchIdSchema,
  type ChallengeId,
  type MatchId,
} from '@caravan/protocol';
import { z } from 'zod';
import { SESSION_COOKIE_NAME, sessionAccount } from './accounts.js';
import type { Config } from './config.js';
import { MatchEntryService } from './match-entry.js';
import { RematchService } from './rematch.js';

const challengeParamsSchema = z.object({ challengeId: challengeIdSchema }).strict();
const matchParamsSchema = z.object({ matchId: matchIdSchema }).strict();

async function authenticatedAccount(
  app: FastifyInstance,
  pool: pg.Pool,
  cookie: string | undefined,
) {
  try {
    return await sessionAccount(pool, cookie);
  } catch (error) {
    app.log.debug({ err: error }, 'Match entry authentication rejected');
    throw error;
  }
}

export async function installMatchEntryRoutes(
  app: FastifyInstance,
  pool: pg.Pool,
  config: Config,
): Promise<void> {
  const service = new MatchEntryService(pool, {
    matchmakingLeaseMs: config.MATCHMAKING_LEASE_SECONDS * 1_000,
    challengeTtlMs: config.CHALLENGE_TTL_SECONDS * 1_000,
  });
  const rematches = new RematchService(pool, {
    ttlMs: config.REMATCH_TTL_SECONDS * 1_000,
  });

  app.get('/api/matchmaking', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    return service.matchmakingStatus(accountId);
  });

  app.post(
    '/api/matchmaking/join',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request) => {
      const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
      return service.joinMatchmaking(accountId);
    },
  );

  app.post(
    '/api/matchmaking/heartbeat',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
      return service.heartbeatMatchmaking(accountId);
    },
  );

  app.delete('/api/matchmaking', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    return service.leaveMatchmaking(accountId);
  });

  app.post(
    '/api/challenges',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
      return service.createChallenge(accountId);
    },
  );

  app.get('/api/challenges/:challengeId', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { challengeId } = challengeParamsSchema.parse(request.params) as {
      challengeId: ChallengeId;
    };
    return service.challengeStatus(accountId, challengeId);
  });

  app.post('/api/challenges/accept', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { inviteToken } = inviteTokenRequestSchema.parse(request.body);
    return service.acceptChallenge(accountId, inviteToken);
  });

  app.post('/api/challenges/decline', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { inviteToken } = inviteTokenRequestSchema.parse(request.body);
    return service.declineChallenge(accountId, inviteToken);
  });

  app.post('/api/challenges/:challengeId/cancel', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { challengeId } = challengeParamsSchema.parse(request.params) as {
      challengeId: ChallengeId;
    };
    return service.cancelChallenge(accountId, challengeId);
  });

  app.get('/api/matches/:matchId/rematch', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { matchId } = matchParamsSchema.parse(request.params) as { matchId: MatchId };
    return rematches.status(accountId, matchId);
  });

  app.post(
    '/api/matches/:matchId/rematch',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    async (request) => {
      const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
      const { matchId } = matchParamsSchema.parse(request.params) as { matchId: MatchId };
      return rematches.request(accountId, matchId);
    },
  );

  app.delete('/api/matches/:matchId/rematch', async (request) => {
    const accountId = await authenticatedAccount(app, pool, request.cookies[SESSION_COOKIE_NAME]);
    const { matchId } = matchParamsSchema.parse(request.params) as { matchId: MatchId };
    return rematches.cancel(accountId, matchId);
  });
}
