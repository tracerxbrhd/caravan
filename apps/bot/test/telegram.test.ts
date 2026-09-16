import { describe, expect, it } from 'vitest';
import { TelegramClient } from '../src/telegram.js';

const botToken = '123456789:abcdefghijklmnopqrstuvwxyzABCDE';
const message = {
  chatId: 42,
  text: 'CARAVAN',
  replyMarkup: { inline_keyboard: [] },
} as const;

describe('TelegramClient', () => {
  it('sends the expected minimal Bot API payload', async () => {
    let capturedUrl = '';
    let capturedBody = '';
    const fetchImpl: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ ok: true, result: {} }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    await new TelegramClient(botToken, { fetchImpl }).sendMessage(message);

    expect(capturedUrl).toBe(`https://api.telegram.org/bot${botToken}/sendMessage`);
    expect(JSON.parse(capturedBody)).toEqual({
      chat_id: 42,
      text: 'CARAVAN',
      reply_markup: { inline_keyboard: [] },
    });
  });

  it('uses strict production configuration payloads for webhook and menu button', async () => {
    const requests: { url: string; body: unknown }[] = [];
    const responses: unknown[] = [
      {
        id: 99,
        is_bot: true,
        username: 'CaravanExampleBot',
        has_main_web_app: true,
      },
      true,
      true,
      {
        url: 'https://caravan.example.com/telegram/webhook',
        pending_update_count: 0,
        allowed_updates: ['message'],
      },
      {
        type: 'web_app',
        text: 'CARAVAN',
        web_app: { url: 'https://caravan.example.com' },
      },
    ];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), body: JSON.parse(String(init?.body ?? '{}')) as unknown });
      return new Response(JSON.stringify({ ok: true, result: responses.shift() }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };
    const client = new TelegramClient(botToken, { fetchImpl });

    await expect(client.getMe()).resolves.toEqual({
      id: 99,
      username: 'CaravanExampleBot',
      hasMainWebApp: true,
    });
    await client.setWebhook({
      url: 'https://caravan.example.com/telegram/webhook',
      secretToken: 'a'.repeat(32),
      allowedUpdates: ['message'],
    });
    await client.setChatMenuButton({ text: 'CARAVAN', url: 'https://caravan.example.com' });
    await expect(client.getWebhookInfo()).resolves.toEqual({
      url: 'https://caravan.example.com/telegram/webhook',
      pendingUpdateCount: 0,
      allowedUpdates: ['message'],
    });
    await expect(client.getChatMenuButton()).resolves.toEqual({
      type: 'web_app',
      text: 'CARAVAN',
      webAppUrl: 'https://caravan.example.com',
    });

    expect(requests.map((request) => request.url.split('/').at(-1))).toEqual([
      'getMe',
      'setWebhook',
      'setChatMenuButton',
      'getWebhookInfo',
      'getChatMenuButton',
    ]);
    expect(requests[1]?.body).toEqual({
      url: 'https://caravan.example.com/telegram/webhook',
      secret_token: 'a'.repeat(32),
      allowed_updates: ['message'],
    });
    expect(requests[2]?.body).toEqual({
      menu_button: {
        type: 'web_app',
        text: 'CARAVAN',
        web_app: { url: 'https://caravan.example.com' },
      },
    });
  });

  it('replaces transport and API response failures with generic errors', async () => {
    const transportFailure: typeof fetch = async () => {
      throw new Error(`request to /bot${botToken}/sendMessage failed`);
    };
    const apiFailure: typeof fetch = async () =>
      new Response(`sensitive upstream detail containing ${botToken}`, { status: 500 });

    await expect(
      new TelegramClient(botToken, { fetchImpl: transportFailure }).sendMessage(message),
    ).rejects.toThrow('Telegram Bot API request failed.');
    await expect(
      new TelegramClient(botToken, { fetchImpl: apiFailure }).sendMessage(message),
    ).rejects.toThrow('Telegram Bot API rejected request.');

    try {
      await new TelegramClient(botToken, { fetchImpl: transportFailure }).sendMessage(message);
    } catch (error) {
      expect(String(error)).not.toContain(botToken);
    }
  });
});
