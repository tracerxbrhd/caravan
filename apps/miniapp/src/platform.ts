import { buildChallengeLaunchParam, type InviteToken } from '@caravan/protocol';

export type HapticCue = 'SELECTION' | 'LIGHT' | 'MEDIUM' | 'SUCCESS' | 'ERROR';

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe?: { start_param?: string };
        ready(): void;
        expand(): void;
        openTelegramLink?(url: string): void;
        HapticFeedback?: {
          impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
          notificationOccurred(type: 'error' | 'success' | 'warning'): void;
          selectionChanged(): void;
        };
      };
    };
  }
}

export interface PlatformAdapter {
  initData(): string;
  launchParam(): string | undefined;
  ready(): void;
  expand(): void;
  challengeInviteUrl(inviteToken: InviteToken): string | null;
  shareUrl(url: string, text: string): void;
  copyText(text: string): Promise<boolean>;
  hapticsAvailable(): boolean;
  haptic(cue: HapticCue): void;
}

const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;

function configuredBotUsername(): string | null {
  const raw = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return raw !== undefined && BOT_USERNAME_PATTERN.test(raw) ? raw : null;
}

function telegramLaunchParam(): string | undefined {
  const direct = window.Telegram?.WebApp.initDataUnsafe?.start_param;
  if (direct !== undefined && direct.length > 0) return direct;
  const query = new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  return query ?? undefined;
}

function browserVibrationAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function browserVibration(cue: HapticCue): void {
  if (!browserVibrationAvailable()) return;
  const pattern =
    cue === 'SUCCESS'
      ? [12, 35, 20]
      : cue === 'ERROR'
        ? [25, 30, 25]
        : cue === 'MEDIUM'
          ? 18
          : 8;
  navigator.vibrate(pattern);
}

export const platform: PlatformAdapter = {
  initData: () => window.Telegram?.WebApp.initData ?? '',
  launchParam: telegramLaunchParam,
  ready: () => window.Telegram?.WebApp.ready(),
  expand: () => window.Telegram?.WebApp.expand(),
  challengeInviteUrl: (inviteToken) => {
    const username = configuredBotUsername();
    if (username === null) return null;
    const launchParam = buildChallengeLaunchParam(inviteToken);
    return `https://t.me/${username}?startapp=${encodeURIComponent(launchParam)}`;
  },
  shareUrl: (url, text) => {
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const openTelegramLink = window.Telegram?.WebApp.openTelegramLink;
    if (openTelegramLink !== undefined) openTelegramLink(share);
    else window.open(share, '_blank', 'noopener,noreferrer');
  },
  copyText: async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  hapticsAvailable: () =>
    window.Telegram?.WebApp.HapticFeedback !== undefined || browserVibrationAvailable(),
  haptic: (cue) => {
    const haptics = window.Telegram?.WebApp.HapticFeedback;
    if (haptics === undefined) {
      browserVibration(cue);
      return;
    }

    if (cue === 'SELECTION') haptics.selectionChanged();
    else if (cue === 'SUCCESS') haptics.notificationOccurred('success');
    else if (cue === 'ERROR') haptics.notificationOccurred('error');
    else haptics.impactOccurred(cue === 'MEDIUM' ? 'medium' : 'light');
  },
};
