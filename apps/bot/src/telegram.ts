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

export interface TelegramBotIdentity {
  readonly id: number;
  readonly username: string;
  readonly hasMainWebApp: boolean;
}

export interface TelegramWebhookConfiguration {
  readonly url: string;
  readonly secretToken: string;
  readonly allowedUpdates: readonly string[];
}

export interface TelegramWebhookInfo {
  readonly url: string;
  readonly pendingUpdateCount: number;
  readonly allowedUpdates: readonly string[];
}

export interface TelegramMenuButtonConfiguration {
  readonly text: string;
  readonly url: string;
}

export interface TelegramMenuButtonInfo {
  readonly type: string;
  readonly text: string | null;
  readonly webAppUrl: string | null;
}

export interface TelegramProductionAdmin {
  getMe(): Promise<TelegramBotIdentity>;
  setWebhook(configuration: TelegramWebhookConfiguration): Promise<void>;
  getWebhookInfo(): Promise<TelegramWebhookInfo>;
  setChatMenuButton(configuration: TelegramMenuButtonConfiguration): Promise<void>;
  getChatMenuButton(): Promise<TelegramMenuButtonInfo>;
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

function stringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) return [];
  return value;
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

export class TelegramClient implements TelegramMessenger, TelegramProductionAdmin {
  private readonly apiRoot: string;
  private readonly fetchImpl: typeof fetch;

  public constructor(botToken: string, options: TelegramClientOptions = {}) {
    const apiOrigin = (options.apiOrigin ?? 'https://api.telegram.org').replace(/\/$/, '');
    this.apiRoot = `${apiOrigin}/bot${botToken}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async call(method: string, body: Readonly<Record<string, unknown>> = {}): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.apiRoot}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error('Telegram Bot API request failed.');
    }

    if (!response.ok) {
      throw new Error('Telegram Bot API rejected request.');
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('Telegram Bot API returned an invalid response.');
    }

    if (isRecord(payload) && payload.ok === false) {
      throw new Error('Telegram Bot API rejected request.');
    }
    if (!isRecord(payload) || payload.ok !== true || !('result' in payload)) {
      throw new Error('Telegram Bot API returned an invalid response.');
    }
    return payload.result;
  }

  public async sendMessage(request: SendMessageRequest): Promise<void> {
    await this.call('sendMessage', {
      chat_id: request.chatId,
      text: request.text,
      reply_markup: request.replyMarkup,
    });
  }

  public async getMe(): Promise<TelegramBotIdentity> {
    const result = await this.call('getMe');
    if (
      !isRecord(result) ||
      result.is_bot !== true ||
      typeof result.id !== 'number' ||
      !Number.isSafeInteger(result.id) ||
      typeof result.username !== 'string' ||
      result.username.length === 0
    ) {
      throw new Error('Telegram Bot API returned an invalid bot identity.');
    }

    return {
      id: result.id,
      username: result.username,
      hasMainWebApp: result.has_main_web_app === true,
    };
  }

  public async setWebhook(configuration: TelegramWebhookConfiguration): Promise<void> {
    const result = await this.call('setWebhook', {
      url: configuration.url,
      secret_token: configuration.secretToken,
      allowed_updates: configuration.allowedUpdates,
    });
    if (result !== true) {
      throw new Error('Telegram Bot API did not confirm webhook configuration.');
    }
  }

  public async getWebhookInfo(): Promise<TelegramWebhookInfo> {
    const result = await this.call('getWebhookInfo');
    if (
      !isRecord(result) ||
      typeof result.url !== 'string' ||
      typeof result.pending_update_count !== 'number' ||
      !Number.isSafeInteger(result.pending_update_count) ||
      result.pending_update_count < 0
    ) {
      throw new Error('Telegram Bot API returned invalid webhook information.');
    }

    return {
      url: result.url,
      pendingUpdateCount: result.pending_update_count,
      allowedUpdates: stringArray(result.allowed_updates),
    };
  }

  public async setChatMenuButton(configuration: TelegramMenuButtonConfiguration): Promise<void> {
    const result = await this.call('setChatMenuButton', {
      menu_button: {
        type: 'web_app',
        text: configuration.text,
        web_app: { url: configuration.url },
      },
    });
    if (result !== true) {
      throw new Error('Telegram Bot API did not confirm menu-button configuration.');
    }
  }

  public async getChatMenuButton(): Promise<TelegramMenuButtonInfo> {
    const result = await this.call('getChatMenuButton');
    if (!isRecord(result) || typeof result.type !== 'string') {
      throw new Error('Telegram Bot API returned invalid menu-button information.');
    }

    const webApp = isRecord(result.web_app) ? result.web_app : null;
    return {
      type: result.type,
      text: typeof result.text === 'string' ? result.text : null,
      webAppUrl: webApp !== null && typeof webApp.url === 'string' ? webApp.url : null,
    };
  }
}
