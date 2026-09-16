import { describe, expect, it } from 'vitest';
import {
  acceptedChallengeSchema,
  challengeViewSchema,
  createChallengeResponseSchema,
  inviteTokenSchema,
  matchmakingStatusSchema,
} from '../src/index.js';

const MATCH_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_MATCH_ID = '00000000-0000-4000-8000-000000000003';
const CHALLENGE_ID = '00000000-0000-4000-8000-000000000002';
const TOKEN = 'A'.repeat(43);

describe('match entry protocol contracts', () => {
  it('accepts explicit idle, queued and match-found matchmaking states', () => {
    expect(matchmakingStatusSchema.parse({ status: 'IDLE' })).toEqual({ status: 'IDLE' });
    expect(matchmakingStatusSchema.parse({ status: 'QUEUED', leaseExpiresAtMs: 123_456 })).toEqual({
      status: 'QUEUED',
      leaseExpiresAtMs: 123_456,
    });
    expect(matchmakingStatusSchema.parse({ status: 'MATCH_FOUND', matchId: MATCH_ID })).toEqual({
      status: 'MATCH_FOUND',
      matchId: MATCH_ID,
    });
  });

  it('requires a high-entropy base64url-shaped invite token', () => {
    expect(inviteTokenSchema.parse(TOKEN)).toBe(TOKEN);
    expect(() => inviteTokenSchema.parse('short')).toThrow();
    expect(() => inviteTokenSchema.parse(`${'A'.repeat(42)}!`)).toThrow();
  });

  it('keeps challenge responses strict and accepted results tied to one match id', () => {
    const challenge = challengeViewSchema.parse({
      id: CHALLENGE_ID,
      status: 'PENDING',
      createdAtMs: 1_000,
      expiresAtMs: 2_000,
      matchId: null,
    });
    expect(createChallengeResponseSchema.parse({ challenge, inviteToken: TOKEN })).toEqual({
      challenge,
      inviteToken: TOKEN,
    });

    expect(
      acceptedChallengeSchema.parse({
        challenge: { ...challenge, status: 'ACCEPTED', matchId: MATCH_ID },
        matchId: MATCH_ID,
      }),
    ).toMatchObject({ matchId: MATCH_ID, challenge: { status: 'ACCEPTED', matchId: MATCH_ID } });

    expect(() =>
      acceptedChallengeSchema.parse({
        challenge: { ...challenge, status: 'ACCEPTED', matchId: MATCH_ID },
        matchId: OTHER_MATCH_ID,
      }),
    ).toThrow();
    expect(() =>
      challengeViewSchema.parse({ ...challenge, status: 'ACCEPTED', matchId: null }),
    ).toThrow();
    expect(() => challengeViewSchema.parse({ ...challenge, matchId: MATCH_ID })).toThrow();
    expect(() =>
      challengeViewSchema.parse({ ...challenge, createdAtMs: 2_000, expiresAtMs: 2_000 }),
    ).toThrow();
    expect(() =>
      challengeViewSchema.parse({ ...challenge, unexpectedPrivilegedState: { hand: ['secret'] } }),
    ).toThrow();
  });
});
