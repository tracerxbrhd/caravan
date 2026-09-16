import { describe, expect, it } from 'vitest';
import { buildChallengeLaunchParam, parseLaunchParam } from '../src/index.js';

const TOKEN = 'A'.repeat(43);

describe('launch context', () => {
  it('round-trips private challenge launch context', () => {
    const launchParam = buildChallengeLaunchParam(TOKEN);
    expect(launchParam).toBe(`challenge_${TOKEN}`);
    expect(parseLaunchParam(launchParam)).toEqual({ kind: 'CHALLENGE', inviteToken: TOKEN });
  });

  it('treats missing context as home', () => {
    expect(parseLaunchParam(undefined)).toEqual({ kind: 'HOME' });
    expect(parseLaunchParam('')).toEqual({ kind: 'HOME' });
  });

  it('fails closed for unknown or malformed context', () => {
    expect(parseLaunchParam('profile_abc')).toEqual({ kind: 'INVALID' });
    expect(parseLaunchParam('challenge_short')).toEqual({ kind: 'INVALID' });
    expect(parseLaunchParam(`challenge_${'A'.repeat(60)}`)).toEqual({ kind: 'INVALID' });
  });
});
