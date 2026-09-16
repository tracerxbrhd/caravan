declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        ready(): void;
        expand(): void;
      };
    };
  }
}

export interface PlatformAdapter {
  initData(): string;
  ready(): void;
  expand(): void;
}

export const platform: PlatformAdapter = {
  initData: () => window.Telegram?.WebApp.initData ?? '',
  ready: () => window.Telegram?.WebApp.ready(),
  expand: () => window.Telegram?.WebApp.expand(),
};
