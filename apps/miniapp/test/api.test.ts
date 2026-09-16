import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResponseValidationError, matchmakingStatus } from '../src/api.js';

afterEach(() => vi.unstubAllGlobals());

describe('Mini App API boundary', () => {
  it('runtime-validates match-entry responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'QUEUED', leaseExpiresAtMs: 1234 }), {
            status: 200,
          }),
      ),
    );
    await expect(matchmakingStatus()).resolves.toEqual({
      status: 'QUEUED',
      leaseExpiresAtMs: 1234,
    });
  });

  it('fails closed on malformed successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'QUEUED', opponentHand: ['secret'] }), {
            status: 200,
          }),
      ),
    );
    await expect(matchmakingStatus()).rejects.toBeInstanceOf(ResponseValidationError);
  });
});
