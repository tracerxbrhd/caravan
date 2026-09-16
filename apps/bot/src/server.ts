import { timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { BotConfig } from './config.js';
import {
  buildChallengeLaunchParam,
  buildMainMiniAppLink,
  parseLaunchParam,
  parseStartCommand,
  type LaunchContext,
} from './launch.js';
import {
  extractIncomingMessage,
  type InlineKeyboardButton,
  type SendMessageRequest,
  type TelegramMessenger,
} from './telegram.js';

const DEFAULT_MAX_BODY_BYTES = 65_536;

class PayloadTooLargeError extends Error {}
class MalformedJsonError extends Error {}

export interface BotServerOptions {
  readonly maxBodyBytes?: number;
  readonly onProcessingError?: () => void;
}

interface StartReply {
  readonly text: string;
  readonly replyMarkup: SendMessageRequest['replyMarkup'];
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(body));
}

function webhookSecretMatches(header: string | string[] | undefined, expected: string): boolean {
  if (typeof header !== 'string') return false;
  const actualBytes = Buffer.from(header, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function readJsonBody(request: IncomingMessage, maxBodyBytes: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodyBytes) throw new PayloadTooLargeError();
    chunks.push(buffer);
  }

  if (size === 0) throw new MalformedJsonError();
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new MalformedJsonError();
  }
}

function isRussian(languageCode: string | undefined): boolean {
  return languageCode?.toLowerCase().startsWith('ru') ?? false;
}

function normalLaunchButton(
  config: BotConfig,
  privateChat: boolean,
  russian: boolean,
): InlineKeyboardButton {
  const text = russian ? 'Играть' : 'Play';
  if (privateChat) return { text, web_app: { url: config.PUBLIC_ORIGIN } };
  return { text, url: buildMainMiniAppLink(config.BOT_USERNAME) };
}

function startReply(
  config: BotConfig,
  context: LaunchContext,
  languageCode: string | undefined,
  privateChat: boolean,
): StartReply {
  const russian = isRussian(languageCode);

  if (context.kind === 'CHALLENGE') {
    const launchParam = buildChallengeLaunchParam(context.inviteToken);
    return {
      text: russian
        ? 'CARAVAN\nВас пригласили на матч. Откройте игру, чтобы принять вызов.'
        : 'CARAVAN\nYou have been challenged to a match. Open the game to respond.',
      replyMarkup: {
        inline_keyboard: [
          [
            {
              text: russian ? 'Открыть вызов' : 'Open challenge',
              url: buildMainMiniAppLink(config.BOT_USERNAME, launchParam),
            },
          ],
        ],
      },
    };
  }

  if (context.kind === 'INVALID') {
    return {
      text: russian
        ? 'CARAVAN\nСсылка приглашения недействительна или устарела. Откройте игру обычным способом.'
        : 'CARAVAN\nThis invitation link is invalid or no longer usable. Open the game normally.',
      replyMarkup: { inline_keyboard: [[normalLaunchButton(config, privateChat, russian)]] },
    };
  }

  return {
    text: russian
      ? 'CARAVAN\nСоревновательная карточная игра о торговых маршрутах.'
      : 'CARAVAN\nA competitive card game built around rival trade routes.',
    replyMarkup: { inline_keyboard: [[normalLaunchButton(config, privateChat, russian)]] },
  };
}

async function processTelegramUpdate(
  update: unknown,
  config: BotConfig,
  messenger: TelegramMessenger,
): Promise<void> {
  const message = extractIncomingMessage(update);
  if (message === null || message.text === undefined) return;

  const command = parseStartCommand(message.text, config.BOT_USERNAME);
  if (command === null) return;

  const reply = startReply(
    config,
    parseLaunchParam(command.payload),
    message.languageCode,
    message.chatType === 'private',
  );
  await messenger.sendMessage({ chatId: message.chatId, ...reply });
}

export function createBotServer(
  config: BotConfig,
  messenger: TelegramMessenger,
  options: BotServerOptions = {},
): Server {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
  if (!Number.isSafeInteger(maxBodyBytes) || maxBodyBytes <= 0) {
    throw new RangeError('maxBodyBytes must be a positive safe integer.');
  }
  const onProcessingError =
    options.onProcessingError ?? (() => process.stderr.write('Telegram update failed\n'));

  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;

    if (request.method === 'GET' && pathname === '/health') {
      writeJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method !== 'POST' || pathname !== '/telegram/webhook') {
      writeJson(response, 404, { error: 'not_found' });
      return;
    }

    if (
      !webhookSecretMatches(
        request.headers['x-telegram-bot-api-secret-token'],
        config.TELEGRAM_WEBHOOK_SECRET,
      )
    ) {
      writeJson(response, 401, { error: 'unauthorized' });
      return;
    }

    let update: unknown;
    try {
      update = await readJsonBody(request, maxBodyBytes);
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        writeJson(response, 413, { error: 'payload_too_large' });
        return;
      }
      writeJson(response, 400, { error: 'invalid_json' });
      return;
    }

    try {
      await processTelegramUpdate(update, config, messenger);
      writeJson(response, 200, { ok: true });
    } catch {
      onProcessingError();
      writeJson(response, 500, { error: 'update_failed' });
    }
  });
}
