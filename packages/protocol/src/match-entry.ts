import { z } from 'zod';
import { matchIdSchema, serverTimeMsSchema } from './common.js';

export const challengeIdSchema = z.uuid();
export const inviteTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const matchmakingStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('IDLE') }).strict(),
  z
    .object({
      status: z.literal('QUEUED'),
      leaseExpiresAtMs: serverTimeMsSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal('MATCH_FOUND'),
      matchId: matchIdSchema,
    })
    .strict(),
]);

export const challengeStatusSchema = z.enum([
  'PENDING',
  'ACCEPTED',
  'DECLINED',
  'CANCELLED',
  'EXPIRED',
]);

export const challengeViewSchema = z
  .object({
    id: challengeIdSchema,
    status: challengeStatusSchema,
    createdAtMs: serverTimeMsSchema,
    expiresAtMs: serverTimeMsSchema,
    matchId: matchIdSchema.nullable(),
  })
  .strict();

export const createChallengeResponseSchema = z
  .object({
    challenge: challengeViewSchema,
    inviteToken: inviteTokenSchema,
  })
  .strict();

export const inviteTokenRequestSchema = z
  .object({
    inviteToken: inviteTokenSchema,
  })
  .strict();

export const challengeResolutionSchema = z
  .object({
    challenge: challengeViewSchema,
  })
  .strict();

export const acceptedChallengeSchema = z
  .object({
    challenge: challengeViewSchema.extend({
      status: z.literal('ACCEPTED'),
      matchId: matchIdSchema,
    }),
    matchId: matchIdSchema,
  })
  .strict();

export type ChallengeId = z.infer<typeof challengeIdSchema>;
export type InviteToken = z.infer<typeof inviteTokenSchema>;
export type MatchmakingStatus = z.infer<typeof matchmakingStatusSchema>;
export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;
export type ChallengeView = z.infer<typeof challengeViewSchema>;
export type CreateChallengeResponse = z.infer<typeof createChallengeResponseSchema>;
export type ChallengeResolution = z.infer<typeof challengeResolutionSchema>;
export type AcceptedChallenge = z.infer<typeof acceptedChallengeSchema>;
