import { describe, expect, it } from 'vitest';
import { verifyTelegramInitData } from '../src/auth.js';
import { TEST_BOT_TOKEN, signedTelegramInitData } from './auth-fixtures.js';

describe('Telegram initData verification', () => {
  it('accepts a valid signed payload and returns only the identity fields CARAVAN needs', () => {
    const now = 2_000_000;
    const raw = signedTelegramInitData({
      userId: 42,
      firstName: '  Ada   Lovelace  ',
      languageCode: 'en',
      authDate: now - 10,
    });

    expect(verifyTelegramInitData(raw, TEST_BOT_TOKEN, now, 300)).toEqual({
      subject: '42',
      firstName: '  Ada   Lovelace  ',
      languageCode: 'en',
    });
  });

  it('rejects tampering even when the Telegram-shaped fields remain parseable', () => {
    const now = 2_000_000;
    const raw = signedTelegramInitData({ authDate: now });
    const tampered = raw.replace('Ada', 'Eve');

    expect(() => verifyTelegramInitData(tampered, TEST_BOT_TOKEN, now, 300)).toThrow(
      'INVALID_AUTH',
    );
  });

  it('rejects expired and implausibly future-dated payloads', () => {
    const now = 2_000_000;
    expect(() =>
      verifyTelegramInitData(
        signedTelegramInitData({ authDate: now - 301 }),
        TEST_BOT_TOKEN,
        now,
        300,
      ),
    ).toThrow('AUTH_EXPIRED');
    expect(() =>
      verifyTelegramInitData(
        signedTelegramInitData({ authDate: now + 31 }),
        TEST_BOT_TOKEN,
        now,
        300,
      ),
    ).toThrow('AUTH_EXPIRED');
  });

  it('rejects duplicate parameters instead of accepting ambiguous signed input', () => {
    const now = 2_000_000;
    const raw = `${signedTelegramInitData({ authDate: now })}&auth_date=${now}`;
    expect(() => verifyTelegramInitData(raw, TEST_BOT_TOKEN, now, 300)).toThrow('INVALID_AUTH');
  });
});
