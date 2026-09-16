import {
  buildChallengeLaunchParam,
  launchParamSchema,
  parseLaunchParam,
  type LaunchContext,
} from '@caravan/protocol';

const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

export { buildChallengeLaunchParam, parseLaunchParam, type LaunchContext };

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

export function buildMainMiniAppLink(botUsername: string, launchParam?: string): string {
  const username = normalizedBotUsername(botUsername);
  if (launchParam === undefined) return `https://t.me/${username}?startapp`;
  if (!launchParamSchema.safeParse(launchParam).success) {
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
