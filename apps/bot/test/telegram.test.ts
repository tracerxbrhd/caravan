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
    ).rejects.toThrow('Telegram Bot API rejected sendMessage.');

    try {
      await new TelegramClient(botToken, { fetchImpl: transportFailure }).sendMessage(message);
    } catch (error) {
      expect(String(error)).not.toContain(botToken);
    }
  });
});
