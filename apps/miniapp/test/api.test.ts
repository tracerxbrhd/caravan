import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  ResponseValidationError,
  bootstrapAccount,
  matchmakingStatus,
} from '../src/api.js';

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

  it('does not permanently cache a failed account bootstrap attempt', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls === 1) {
          return new Response(JSON.stringify({ code: 'TEMPORARY_FAILURE' }), { status: 503 });
        }
        return new Response(JSON.stringify({ id: 'account-1', displayName: 'Merchant' }), {
          status: 200,
        });
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
