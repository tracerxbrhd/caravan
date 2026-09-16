export interface InlineKeyboardWebAppButton {
  readonly text: string;
  readonly web_app: { readonly url: string };
}

export interface InlineKeyboardUrlButton {
  readonly text: string;
  readonly url: string;
}

export type InlineKeyboardButton = InlineKeyboardWebAppButton | InlineKeyboardUrlButton;

export interface InlineKeyboardMarkup {
  readonly inline_keyboard: readonly (readonly InlineKeyboardButton[])[];
}

export interface SendMessageRequest {
  readonly chatId: number;
  readonly text: string;
  readonly replyMarkup: InlineKeyboardMarkup;
}

export interface TelegramMessenger {
  sendMessage(request: SendMessageRequest): Promise<void>;
}

export interface IncomingTelegramMessage {
  readonly chatId: number;
  readonly chatType: string;
  readonly languageCode: string | undefined;
  readonly text: string | undefined;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function extractIncomingMessage(update: unknown): IncomingTelegramMessage | null {
  if (!isRecord(update) || !isRecord(update.message)) return null;
  const message = update.message;
  if (!isRecord(message.chat) || typeof message.chat.id !== 'number') return null;

  const from = isRecord(message.from) ? message.from : undefined;
  return {
    chatId: message.chat.id,
    chatType: typeof message.chat.type === 'string' ? message.chat.type : 'unknown',
    languageCode:
      from !== undefined && typeof from.language_code === 'string' ? from.language_code : undefined,
    text: typeof message.text === 'string' ? message.text : undefined,
  };
}

export interface TelegramClientOptions {
  readonly apiOrigin?: string;
  readonly fetchImpl?: typeof fetch;
}

export class TelegramClient implements TelegramMessenger {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(botToken: string, options: TelegramClientOptions = {}) {
    const apiOrigin = (options.apiOrigin ?? 'https://api.telegram.org').replace(/\/$/, '');
    this.endpoint = `${apiOrigin}/bot${botToken}/sendMessage`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  public async sendMessage(request: SendMessageRequest): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: request.chatId,
          text: request.text,
          reply_markup: request.replyMarkup,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('Telegram Bot API request failed.');
    }

    if (!response.ok) {
      throw new Error('Telegram Bot API rejected sendMessage.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Telegram Bot API returned an invalid response.');
    }
    if (!isRecord(payload) || payload.ok !== true) {
      throw new Error('Telegram Bot API did not confirm sendMessage.');
    }
  }
}
