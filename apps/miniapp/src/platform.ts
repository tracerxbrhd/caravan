import { buildChallengeLaunchParam, type InviteToken } from '@caravan/protocol';

export type HapticCue = 'SELECTION' | 'LIGHT' | 'MEDIUM' | 'SUCCESS' | 'ERROR';

type TelegramHapticFeedback = {
  impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
  notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  selectionChanged(): void;
};

type TelegramInsets = {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
};

type TelegramLayoutEvent = 'viewportChanged' | 'safeAreaChanged' | 'contentSafeAreaChanged';

type TelegramWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  openTelegramLink?(url: string): void;
  HapticFeedback?: TelegramHapticFeedback;
  viewportStableHeight?: number;
  safeAreaInset?: TelegramInsets;
  contentSafeAreaInset?: TelegramInsets;
  onEvent?(event: TelegramLayoutEvent, listener: () => void): void;
  offEvent?(event: TelegramLayoutEvent, listener: () => void): void;
};

declare global {
  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp;
    };
  }
}

export interface LayoutInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PlatformLayout {
  stableViewportHeight: number;
  safeArea: LayoutInsets;
  contentSafeArea: LayoutInsets;
}

export interface PlatformAdapter {
  initData(): string;
  launchParam(): string | undefined;
  ready(): void;
  expand(): void;
  subscribeLayout(listener: (layout: PlatformLayout) => void): () => void;
  challengeInviteUrl(inviteToken: InviteToken): string | null;
  shareUrl(url: string, text: string): void;
  copyText(text: string): Promise<boolean>;
  hapticsAvailable(): boolean;
  haptic(cue: HapticCue): void;
}

const BOT_USERNAME_PATTERN = /^[A-Za-z0-9_]{5,32}$/;
export const TELEGRAM_TOP_CHROME_FALLBACK = 72;

export function effectiveContentSafeTop(
  isTelegram: boolean,
  safeAreaTop: number,
  contentSafeAreaTop: number,
): number {
  const safeTop = Math.max(0, safeAreaTop);
  const contentTop = Math.max(0, contentSafeAreaTop);

  if (isTelegram && contentTop < TELEGRAM_TOP_CHROME_FALLBACK) {
    return Math.max(safeTop, TELEGRAM_TOP_CHROME_FALLBACK);
  }

  return Math.max(safeTop, contentTop);
}

function configuredBotUsername(): string | null {
  const raw = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim().replace(/^@/, '');
  return raw !== undefined && BOT_USERNAME_PATTERN.test(raw) ? raw : null;
}

function telegramLaunchParam(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const direct = window.Telegram?.WebApp.initDataUnsafe?.start_param;
  if (direct !== undefined && direct.length > 0) return direct;
  const query = new URLSearchParams(window.location.search).get('tgWebAppStartParam');
  return query ?? undefined;
}

function telegramHaptics(): TelegramHapticFeedback | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.Telegram?.WebApp.HapticFeedback;
}

function browserVibrationAvailable(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

function browserVibration(cue: HapticCue): void {
  if (!browserVibrationAvailable()) return;
  const pattern =
    cue === 'SUCCESS' ? [12, 35, 20] : cue === 'ERROR' ? [25, 30, 25] : cue === 'MEDIUM' ? 18 : 8;
  navigator.vibrate(pattern);
}

function layoutInsets(value?: TelegramInsets): LayoutInsets {
  return {
    top: value?.top ?? 0,
    right: value?.right ?? 0,
    bottom: value?.bottom ?? 0,
    left: value?.left ?? 0,
  };
}

export const platform: PlatformAdapter = {
  initData: () => (typeof window === 'undefined' ? '' : (window.Telegram?.WebApp.initData ?? '')),
  launchParam: telegramLaunchParam,
  ready: () => {
    if (typeof window !== 'undefined') window.Telegram?.WebApp.ready();
  },
  expand: () => {
    if (typeof window !== 'undefined') window.Telegram?.WebApp.expand();
  },
  subscribeLayout: (listener) => {
    if (typeof window === 'undefined') return () => undefined;

    const webApp = window.Telegram?.WebApp;
    let previous = '';
    const update = (): void => {
      const safeArea = layoutInsets(webApp?.safeAreaInset);
      const contentSafeArea = layoutInsets(webApp?.contentSafeAreaInset);
      contentSafeArea.top = effectiveContentSafeTop(
        webApp !== undefined,
        safeArea.top,
        contentSafeArea.top,
      );
      const layout: PlatformLayout = {
        stableViewportHeight: webApp?.viewportStableHeight ?? window.innerHeight,
        safeArea,
        contentSafeArea,
      };
      const serialized = JSON.stringify(layout);
      if (serialized === previous) return;
      previous = serialized;
      listener(layout);
    };

    update();
    window.addEventListener('resize', update);
    webApp?.onEvent?.('viewportChanged', update);
    webApp?.onEvent?.('safeAreaChanged', update);
    webApp?.onEvent?.('contentSafeAreaChanged', update);

    return () => {
      window.removeEventListener('resize', update);
      webApp?.offEvent?.('viewportChanged', update);
      webApp?.offEvent?.('safeAreaChanged', update);
      webApp?.offEvent?.('contentSafeAreaChanged', update);
    };
  },
  challengeInviteUrl: (inviteToken) => {
    const username = configuredBotUsername();
    if (username === null) return null;
    const launchParam = buildChallengeLaunchParam(inviteToken);
    return `https://t.me/${username}?startapp=${encodeURIComponent(launchParam)}`;
  },
  shareUrl: (url, text) => {
    if (typeof window === 'undefined') return;
    const share = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
    const openTelegramLink = window.Telegram?.WebApp.openTelegramLink;
    if (openTelegramLink !== undefined) openTelegramLink(share);
    else window.open(share, '_blank', 'noopener,noreferrer');
  },
  copyText: async (text) => {
    if (typeof navigator === 'undefined') return false;
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  },
  hapticsAvailable: () => telegramHaptics() !== undefined || browserVibrationAvailable(),
  haptic: (cue) => {
    const haptics = telegramHaptics();
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
