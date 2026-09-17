import { describe, expect, it } from 'vitest';
import type { BotConfig } from '../src/config.js';
import { configureProductionTelegram } from '../src/production-wiring.js';
import type {
  TelegramMenuButtonConfiguration,
  TelegramProductionAdmin,
  TelegramWebhookConfiguration,
} from '../src/telegram.js';

function productionConfig(): BotConfig {
  return {
    NODE_ENV: 'production',
    PUBLIC_ORIGIN: 'https://caravan.example.com',
    BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
    BOT_USERNAME: 'CaravanExampleBot',
    BOT_HOST: '0.0.0.0',
    BOT_PORT: 3001,
    TELEGRAM_WEBHOOK_SECRET: 'a'.repeat(32),
  };
}

function fakeAdmin(options: {
  readonly username?: string;
  readonly hasMainWebApp?: boolean;
  readonly webhookUrl?: string;
  readonly allowedUpdates?: readonly string[];
  readonly menuButtonUrl?: string;
}) {
  const webhookConfigurations: TelegramWebhookConfiguration[] = [];
  const menuConfigurations: TelegramMenuButtonConfiguration[] = [];
  const admin: TelegramProductionAdmin = {
    getMe: async () => ({
      id: 99,
      username: options.username ?? 'CaravanExampleBot',
      hasMainWebApp: options.hasMainWebApp ?? true,
    }),
    setWebhook: async (configuration) => {
      webhookConfigurations.push(configuration);
    },
    getWebhookInfo: async () => ({
      url: options.webhookUrl ?? 'https://caravan.example.com/telegram/webhook',
      pendingUpdateCount: 2,
      allowedUpdates: options.allowedUpdates ?? ['message'],
    }),
    setChatMenuButton: async (configuration) => {
      menuConfigurations.push(configuration);
    },
    getChatMenuButton: async () => ({
      type: 'web_app',
      text: 'CARAVAN',
      webAppUrl: options.menuButtonUrl ?? 'https://caravan.example.com',
    }),
  };
  return { admin, webhookConfigurations, menuConfigurations };
}

describe('production Telegram wiring', () => {
  it('configures and verifies the production webhook and default Mini App menu button', async () => {
    const fake = fakeAdmin({});

    await expect(configureProductionTelegram(productionConfig(), fake.admin)).resolves.toEqual({
      username: 'CaravanExampleBot',
      webhookUrl: 'https://caravan.example.com/telegram/webhook',
      menuButtonUrl: 'https://caravan.example.com',
      pendingUpdateCount: 2,
    });
    expect(fake.webhookConfigurations).toEqual([
      {
        url: 'https://caravan.example.com/telegram/webhook',
        secretToken: 'a'.repeat(32),
        allowedUpdates: ['message'],
      },
    ]);
    expect(fake.menuConfigurations).toEqual([
      { text: 'CARAVAN', url: 'https://caravan.example.com' },
    ]);
  });

  it('accepts Telegram canonicalizing the root menu-button URL with a trailing slash', async () => {
    const fake = fakeAdmin({ menuButtonUrl: 'https://caravan.example.com/' });

    await expect(
      configureProductionTelegram(productionConfig(), fake.admin),
    ).resolves.toMatchObject({
      menuButtonUrl: 'https://caravan.example.com',
    });
  });

  it('still rejects a menu button URL that points somewhere else', async () => {
    const fake = fakeAdmin({ menuButtonUrl: 'https://caravan.example.com/other' });

    await expect(configureProductionTelegram(productionConfig(), fake.admin)).rejects.toThrow(
      'Telegram menu-button verification did not match production configuration.',
    );
  });

  it('fails before mutation when BOT_USERNAME belongs to a different bot token', async () => {
    const fake = fakeAdmin({ username: 'DifferentBot' });

    await expect(configureProductionTelegram(productionConfig(), fake.admin)).rejects.toThrow(
      'BOT_USERNAME does not match the bot authenticated by BOT_TOKEN.',
    );
    expect(fake.webhookConfigurations).toEqual([]);
    expect(fake.menuConfigurations).toEqual([]);
  });

  it('requires the Telegram Main Mini App prerequisite before mutation', async () => {
    const fake = fakeAdmin({ hasMainWebApp: false });

    await expect(configureProductionTelegram(productionConfig(), fake.admin)).rejects.toThrow(
      'Telegram Main Mini App is not configured for this bot.',
    );
    expect(fake.webhookConfigurations).toEqual([]);
    expect(fake.menuConfigurations).toEqual([]);
  });

  it('fails closed when Telegram reports different effective wiring', async () => {
    const fake = fakeAdmin({ allowedUpdates: ['message', 'callback_query'] });

    await expect(configureProductionTelegram(productionConfig(), fake.admin)).rejects.toThrow(
      'Telegram webhook verification returned unexpected allowed updates.',
    );
  });

  it('cannot mutate Telegram from a non-production configuration', async () => {
    const config = productionConfig();
    const fake = fakeAdmin({});

    await expect(
      configureProductionTelegram({ ...config, NODE_ENV: 'development' }, fake.admin),
    ).rejects.toThrow('Telegram production wiring requires NODE_ENV=production.');
    expect(fake.webhookConfigurations).toEqual([]);
    expect(fake.menuConfigurations).toEqual([]);
  });
});
