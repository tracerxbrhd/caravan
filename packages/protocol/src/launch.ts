import { z } from 'zod';
import { inviteTokenSchema, type InviteToken } from './match-entry.js';

const CHALLENGE_PREFIX = 'challenge_';
export const launchParamSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

export type LaunchContext =
  | { readonly kind: 'HOME' }
  | { readonly kind: 'CHALLENGE'; readonly inviteToken: InviteToken }
  | { readonly kind: 'INVALID' };

export function buildChallengeLaunchParam(inviteToken: InviteToken): string {
  return `${CHALLENGE_PREFIX}${inviteTokenSchema.parse(inviteToken)}`;
}

export function parseLaunchParam(value: string | null | undefined): LaunchContext {
  if (value === undefined || value === null || value.length === 0) return { kind: 'HOME' };
  if (!launchParamSchema.safeParse(value).success || !value.startsWith(CHALLENGE_PREFIX)) {
    return { kind: 'INVALID' };
  }

  const parsed = inviteTokenSchema.safeParse(value.slice(CHALLENGE_PREFIX.length));
  return parsed.success ? { kind: 'CHALLENGE', inviteToken: parsed.data } : { kind: 'INVALID' };
}
