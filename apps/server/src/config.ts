import { z } from 'zod';

const configSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVER_HOST: z.string().min(1).default('0.0.0.0'),
    SERVER_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    BOT_TOKEN: z.string().regex(/^\d{5,}:[A-Za-z0-9_-]{20,}$/),
    PUBLIC_ORIGIN: z.string().url().default('http://localhost:5173'),
    SESSION_HOURS: z.coerce.number().int().min(1).max(720).default(168),
    TELEGRAM_AUTH_MAX_AGE_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    TURN_TIMEOUT_SECONDS: z.coerce.number().int().min(15).max(600).default(60),
    RECONNECT_GRACE_SECONDS: z.coerce.number().int().min(5).max(300).default(30),
    MATCHMAKING_LEASE_SECONDS: z.coerce.number().int().min(30).max(600).default(90),
    CHALLENGE_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
    REMATCH_TTL_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),
  })
  .passthrough()
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.PUBLIC_ORIGIN.startsWith('https://')) {
      ctx.addIssue({
        code: 'custom',
        path: ['PUBLIC_ORIGIN'],
        message: 'PUBLIC_ORIGIN must use HTTPS in production.',
      });
    }
  });

export type Config = z.infer<typeof configSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): Config {
  return configSchema.parse(environment);
}
