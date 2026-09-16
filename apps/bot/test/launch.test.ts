import { describe, expect, it } from 'vitest';
import {
  buildChallengeLaunchParam,
  buildMainMiniAppLink,
  parseLaunchParam,
  parseStartCommand,
} from '../src/launch.js';

const inviteToken = 'A'.repeat(43);

describe('Telegram Mini App launch context', () => {
  it('builds and parses a private challenge context', () => {
    const parameter = buildChallengeLaunchParam(inviteToken);
    expect(parameter).toBe(`challenge_${inviteToken}`);
    expect(parseLaunchParam(parameter)).toEqual({ kind: 'CHALLENGE', inviteToken });
    expect(buildMainMiniAppLink('CaravanExampleBot', parameter)).toBe(
      `https://t.me/CaravanExampleBot?startapp=challenge_${inviteToken}`,
    );
  });

  it('fails closed for unsupported or malformed launch context', () => {
    expect(parseLaunchParam(undefined)).toEqual({ kind: 'HOME' });
    expect(parseLaunchParam('ranked')).toEqual({ kind: 'INVALID' });
    expect(parseLaunchParam('challenge_short')).toEqual({ kind: 'INVALID' });
    expect(() => buildChallengeLaunchParam('short')).toThrow('Invalid private challenge invite token.');
  });

  it('parses /start only for this bot and preserves a bounded payload', () => {
    expect(parseStartCommand(`/start@CaravanExampleBot challenge_${inviteToken}`, 'CaravanExampleBot')).toEqual({
      payload: `challenge_${inviteToken}`,
    });
    expect(parseStartCommand('/start', 'CaravanExampleBot')).toEqual({ payload: undefined });
    expect(parseStartCommand('/start@AnotherBot', 'CaravanExampleBot')).toBeNull();
  });
});
