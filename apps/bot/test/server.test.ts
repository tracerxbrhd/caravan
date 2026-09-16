import { once } from 'node:events';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import type { BotConfig } from '../src/config.js';
import { createBotServer } from '../src/server.js';
import type { SendMessageRequest, TelegramMessenger } from '../src/telegram.js';

const config: BotConfig = {
  NODE_ENV: 'test',
  PUBLIC_ORIGIN: 'http://localhost:5173',
  BOT_TOKEN: '123456789:abcdefghijklmnopqrstuvwxyzABCDE',
  BOT_USERNAME: 'CaravanExampleBot',
  BOT_HOST: '127.0.0.1',
  BOT_PORT: 3001,
  TELEGRAM_WEBHOOK_SECRET: 's'.repeat(32),
};

class FakeMessenger implements TelegramMessenger {
  public readonly messages: SendMessageRequest[] = [];

  public async sendMessage(request: SendMessageRequest): Promise<void> {
    this.messages.push(request);
  }
}

const servers: Server[] = [];

async function listen(server: Server): Promise<string> {
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('Expected TCP server address.');
  return `http://127.0.0.1:${address.port}`;
}

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.close(() => resolve());
        }),
    ),
  );
});

describe('Telegram bot HTTP runtime', () => {
  it('exposes health without exposing Telegram configuration', async () => {
    const messenger = new FakeMessenger();
    const origin = await listen(createBotServer(config, messenger));
    const response = await fetch(`${origin}/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(messenger.messages).toHaveLength(0);
  });

  it('rejects webhook calls without the configured Telegram secret before processing the body', async () => {
    const messenger = new FakeMessenger();
    const origin = await listen(createBotServer(config, messenger));
    const response = await fetch(`${origin}/telegram/webhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: { chat: { id: 1, type: 'private' }, text: '/start' } }),
    });
    expect(response.status).toBe(401);
    expect(messenger.messages).toHaveLength(0);
  });

  it('turns a valid challenge /start fallback into a Main Mini App deep link', async () => {
    const messenger = new FakeMessenger();
    const origin = await listen(createBotServer(config, messenger));
    const inviteToken = 'B'.repeat(43);
    const response = await fetch(`${origin}/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': config.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        message: {
          chat: { id: 42, type: 'private' },
          from: { language_code: 'en' },
          text: `/start challenge_${inviteToken}`,
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(messenger.messages).toHaveLength(1);
    expect(messenger.messages[0]).toEqual({
      chatId: 42,
      text: 'CARAVAN\nYou have been challenged to a match. Open the game to respond.',
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: 'Open challenge',
              url: `https://t.me/CaravanExampleBot?startapp=challenge_${inviteToken}`,
            },
          ],
        ],
      },
    });
  });

  it('does not echo unsupported launch payloads into replies', async () => {
    const messenger = new FakeMessenger();
    const origin = await listen(createBotServer(config, messenger));
    const response = await fetch(`${origin}/telegram/webhook`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-telegram-bot-api-secret-token': config.TELEGRAM_WEBHOOK_SECRET,
      },
      body: JSON.stringify({
        message: {
          chat: { id: 42, type: 'private' },
          from: { language_code: 'ru' },
          text: '/start something_private',
        },
      }),
    });

    expect(response.status).toBe(200);
    expect(JSON.stringify(messenger.messages)).not.toContain('something_private');
    expect(messenger.messages[0]?.text).toContain('недействительна');
  });
});
