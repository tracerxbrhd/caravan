import { afterEach, describe, expect, it, vi } from 'vitest';
import { declineChallenge } from '../src/api.js';

const INVITE_TOKEN = 'A'.repeat(43);

function response(status: number, payload: object): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('inbound challenge decline', () => {
  it('posts the invite token and accepts a normal decline resolution', async () => {
    const fetchMock = vi.fn(async (_path: string, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.credentials).toBe('include');
      expect(init?.body).toBe(JSON.stringify({ inviteToken: INVITE_TOKEN }));
      return response(200, {
        challenge: {
          id: '00000000-0000-4000-8000-000000000101',
          status: 'DECLINED',
          createdAtMs: 1_000,
          expiresAtMs: 2_000,
          matchId: null,
        },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(declineChallenge(INVITE_TOKEN)).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith('/api/challenges/decline', expect.any(Object));
  });

  it.each([
    ['CHALLENGE_NOT_FOUND', 404],
    ['CHALLENGE_EXPIRED', 410],
    ['CHALLENGE_UNAVAILABLE', 409],
  ] as const)(
    'treats %s as an already-closed invitation instead of trapping the player on an error screen',
    async (code, status) => {
      vi.stubGlobal('fetch', vi.fn(async () => response(status, { code })));

      await expect(declineChallenge(INVITE_TOKEN)).resolves.toBeUndefined();
    },
  );

  it('still surfaces authentication failures so the normal session recovery path runs', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response(401, { code: 'UNAUTHENTICATED' })));

    await expect(declineChallenge(INVITE_TOKEN)).rejects.toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
    });
  });
});
