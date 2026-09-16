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

const challengeViewObjectSchema = z
  .object({
    id: challengeIdSchema,
    status: challengeStatusSchema,
    createdAtMs: serverTimeMsSchema,
    expiresAtMs: serverTimeMsSchema,
    matchId: matchIdSchema.nullable(),
  })
  .strict();

export const challengeViewSchema = challengeViewObjectSchema.superRefine((challenge, context) => {
  if (challenge.expiresAtMs <= challenge.createdAtMs) {
    context.addIssue({
      code: 'custom',
      path: ['expiresAtMs'],
      message: 'Challenge expiry must be after creation.',
    });
  }

  if (challenge.status === 'ACCEPTED' && challenge.matchId === null) {
    context.addIssue({
      code: 'custom',
      path: ['matchId'],
      message: 'An accepted challenge requires a match id.',
    });
  }

  if (challenge.status !== 'ACCEPTED' && challenge.matchId !== null) {
    context.addIssue({
      code: 'custom',
      path: ['matchId'],
      message: 'Only an accepted challenge may reference a match.',
    });
  }
});

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

const acceptedChallengeViewSchema = challengeViewObjectSchema.extend({
  status: z.literal('ACCEPTED'),
  matchId: matchIdSchema,
});

export const acceptedChallengeSchema = z
  .object({
    challenge: acceptedChallengeViewSchema,
    matchId: matchIdSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.challenge.matchId !== value.matchId) {
      context.addIssue({
        code: 'custom',
        path: ['matchId'],
        message: 'Accepted challenge match ids must agree.',
      });
    }

    if (value.challenge.expiresAtMs <= value.challenge.createdAtMs) {
      context.addIssue({
        code: 'custom',
        path: ['challenge', 'expiresAtMs'],
        message: 'Challenge expiry must be after creation.',
      });
    }
  });

export type ChallengeId = z.infer<typeof challengeIdSchema>;
export type InviteToken = z.infer<typeof inviteTokenSchema>;
export type MatchmakingStatus = z.infer<typeof matchmakingStatusSchema>;
export type ChallengeStatus = z.infer<typeof challengeStatusSchema>;
export type ChallengeView = z.infer<typeof challengeViewSchema>;
export type CreateChallengeResponse = z.infer<typeof createChallengeResponseSchema>;
export type ChallengeResolution = z.infer<typeof challengeResolutionSchema>;
export type AcceptedChallenge = z.infer<typeof acceptedChallengeSchema>;
