import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const telegramUserSchema = z
  .object({
    id: z.number().int().positive().safe(),
    first_name: z.string().min(1).max(128),
    language_code: z.string().max(16).optional(),
  })
  .passthrough();

export interface TelegramIdentity {
  subject: string;
  firstName: string;
  languageCode?: string;
}

function invalidAuth(): never {
  throw new Error('INVALID_AUTH');
}

export function verifyTelegramInitData(
  raw: string,
  botToken: string,
  nowSeconds: number,
  maxAgeSeconds = 300,
): TelegramIdentity {
  const params = new URLSearchParams(raw);
  const keys = [...params.keys()];
  if (keys.length === 0 || new Set(keys).size !== keys.length) invalidAuth();

  const hash = params.get('hash');
  if (hash === null || !/^[a-f0-9]{64}$/i.test(hash)) invalidAuth();

  params.delete('hash');
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(dataCheckString).digest();
  const provided = Buffer.from(hash, 'hex');
  if (!timingSafeEqual(expected, provided)) invalidAuth();

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate)) invalidAuth();
  if (authDate > nowSeconds + 30 || nowSeconds - authDate > maxAgeSeconds) {
    throw new Error('AUTH_EXPIRED');
  }

  let parsedUser: unknown;
  try {
    parsedUser = JSON.parse(params.get('user') ?? 'null') as unknown;
  } catch {
    invalidAuth();
  }

  const user = telegramUserSchema.safeParse(parsedUser);
  if (!user.success) invalidAuth();

  return {
    subject: String(user.data.id),
    firstName: user.data.first_name,
    ...(user.data.language_code === undefined ? {} : { languageCode: user.data.language_code }),
  };
}

export function opaqueSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sessionTokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
