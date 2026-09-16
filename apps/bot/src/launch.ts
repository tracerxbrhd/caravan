const INVITE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
const LAUNCH_PARAMETER_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const CHALLENGE_PREFIX = 'challenge_';

export type LaunchContext =
  | { readonly kind: 'HOME' }
  | { readonly kind: 'CHALLENGE'; readonly inviteToken: string }
  | { readonly kind: 'INVALID' };

export interface StartCommand {
  readonly payload: string | undefined;
}

function normalizedBotUsername(botUsername: string): string {
  const normalized = botUsername.replace(/^@/, '');
  if (!BOT_USERNAME_PATTERN.test(normalized)) {
    throw new Error('Invalid Telegram bot username.');
  }
  return normalized;
}

export function buildChallengeLaunchParam(inviteToken: string): string {
  if (!INVITE_TOKEN_PATTERN.test(inviteToken)) {
    throw new Error('Invalid private challenge invite token.');
  }
  return `${CHALLENGE_PREFIX}${inviteToken}`;
}

export function parseLaunchParam(value: string | undefined): LaunchContext {
  if (value === undefined || value.length === 0) return { kind: 'HOME' };
  if (!LAUNCH_PARAMETER_PATTERN.test(value)) return { kind: 'INVALID' };
  if (!value.startsWith(CHALLENGE_PREFIX)) return { kind: 'INVALID' };

  const inviteToken = value.slice(CHALLENGE_PREFIX.length);
  if (!INVITE_TOKEN_PATTERN.test(inviteToken)) return { kind: 'INVALID' };
  return { kind: 'CHALLENGE', inviteToken };
}

export function buildMainMiniAppLink(botUsername: string, launchParam?: string): string {
  const username = normalizedBotUsername(botUsername);
  if (launchParam === undefined) return `https://t.me/${username}?startapp`;
  if (!LAUNCH_PARAMETER_PATTERN.test(launchParam)) {
    throw new Error('Invalid Mini App launch parameter.');
  }
  return `https://t.me/${username}?startapp=${encodeURIComponent(launchParam)}`;
}

export function parseStartCommand(text: string, botUsername: string): StartCommand | null {
  const match = /^\/start(?:@([A-Za-z0-9_]{5,32}))?(?:\s+([A-Za-z0-9_-]{1,64}))?\s*$/.exec(
    text.trim(),
  );
  if (match === null) return null;

  const addressedUsername = match[1];
  if (
    addressedUsername !== undefined &&
    addressedUsername.toLowerCase() !== normalizedBotUsername(botUsername).toLowerCase()
  ) {
    return null;
  }

  return { payload: match[2] };
}
