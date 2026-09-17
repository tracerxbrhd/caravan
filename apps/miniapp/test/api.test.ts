import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ResponseValidationError,
  authenticateTelegram,
  bootstrapAccount,
  createChallenge,
  joinMatchmaking,
  matchmakingStatus,
} from '../src/api.js';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('Mini App API boundary', () => {
  it('runtime-validates match-entry responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'QUEUED', leaseExpiresAtMs: 1234 })),
    );
    await expect(matchmakingStatus()).resolves.toEqual({
      status: 'QUEUED',
      leaseExpiresAtMs: 1234,
    });
  });

  it('fails closed on malformed successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ status: 'QUEUED', opponentHand: ['secret'] })),
    );
    await expect(matchmakingStatus()).rejects.toBeInstanceOf(ResponseValidationError);
  });

  it('does not advertise JSON for bodyless POST requests', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ status: 'QUEUED', leaseExpiresAtMs: 90_000 }))
      .mockResolvedValueOnce(
        jsonResponse({
          challenge: {
            id: '00000000-0000-4000-8000-000000000001',
            status: 'PENDING',
            createdAtMs: 1_000,
            expiresAtMs: 2_000,
            matchId: null,
          },
          inviteToken: 'A'.repeat(43),
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    await joinMatchmaking();
    await createChallenge();

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers);
      expect(headers.has('content-type')).toBe(false);
      expect(init?.body).toBeUndefined();
    }
  });

  it('advertises JSON when a request actually has a JSON body', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: '00000000-0000-4000-8000-000000000002',
        displayName: 'Merchant',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await authenticateTelegram('telegram-init-data');

    const [, init] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ initData: 'telegram-init-data' }));
  });

  it('binds bootstrap to fresh Telegram identity instead of trusting a stale cookie session', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: '00000000-0000-4000-8000-0000000000bb',
        displayName: 'Account B',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(bootstrapAccount('signed-init-data-for-account-b')).resolves.toEqual({
      id: '00000000-0000-4000-8000-0000000000bb',
      displayName: 'Account B',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [path, init] = fetchMock.mock.calls[0] ?? [];
    expect(path).toBe('/api/auth/telegram');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(JSON.stringify({ initData: 'signed-init-data-for-account-b' }));
  });

  it('restores the existing application session only when Telegram initData is unavailable', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        id: '00000000-0000-4000-8000-0000000000aa',
        displayName: 'Existing Session',
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(bootstrapAccount('')).resolves.toEqual({
      id: '00000000-0000-4000-8000-0000000000aa',
      displayName: 'Existing Session',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/me');
  });

  it('does not permanently cache a failed account bootstrap attempt', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return jsonResponse({ code: 'TEMPORARY_FAILURE' }, 503);
        }
        return jsonResponse({ id: 'account-1', displayName: 'Merchant' });
      }),
    );

    await expect(bootstrapAccount('')).rejects.toEqual(new ApiError(503, 'TEMPORARY_FAILURE'));
    await expect(bootstrapAccount('')).resolves.toEqual({
      id: 'account-1',
      displayName: 'Merchant',
    });
    expect(calls).toBe(2);
  });
});
