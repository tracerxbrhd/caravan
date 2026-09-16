import type { BotConfig } from './config.js';
import type { TelegramProductionAdmin } from './telegram.js';

const MENU_BUTTON_TEXT = 'CARAVAN';
const ALLOWED_UPDATES = ['message'] as const;

export interface TelegramProductionWiringResult {
  readonly username: string;
  readonly webhookUrl: string;
  readonly menuButtonUrl: string;
  readonly pendingUpdateCount: number;
}

function sameUsername(actual: string, configured: string): boolean {
  return actual.toLowerCase() === configured.toLowerCase();
}

function expectedWebhookUrl(publicOrigin: string): string {
  return new URL('/telegram/webhook', `${publicOrigin}/`).toString();
}

export async function configureProductionTelegram(
  config: BotConfig,
  telegram: TelegramProductionAdmin,
): Promise<TelegramProductionWiringResult> {
  if (config.NODE_ENV !== 'production') {
    throw new Error('Telegram production wiring requires NODE_ENV=production.');
  }

  const identity = await telegram.getMe();
  if (!sameUsername(identity.username, config.BOT_USERNAME)) {
    throw new Error('BOT_USERNAME does not match the bot authenticated by BOT_TOKEN.');
  }
  if (!identity.hasMainWebApp) {
    throw new Error('Telegram Main Mini App is not configured for this bot.');
  }

  const webhookUrl = expectedWebhookUrl(config.PUBLIC_ORIGIN);
  await telegram.setWebhook({
    url: webhookUrl,
    secretToken: config.TELEGRAM_WEBHOOK_SECRET,
    allowedUpdates: ALLOWED_UPDATES,
  });
  await telegram.setChatMenuButton({
    text: MENU_BUTTON_TEXT,
    url: config.PUBLIC_ORIGIN,
  });

  const [webhookInfo, menuButton] = await Promise.all([
    telegram.getWebhookInfo(),
    telegram.getChatMenuButton(),
  ]);

  if (webhookInfo.url !== webhookUrl) {
    throw new Error('Telegram webhook verification did not return the configured URL.');
  }
  if (
    webhookInfo.allowedUpdates.length !== ALLOWED_UPDATES.length ||
    webhookInfo.allowedUpdates[0] !== ALLOWED_UPDATES[0]
  ) {
    throw new Error('Telegram webhook verification returned unexpected allowed updates.');
  }
  if (
    menuButton.type !== 'web_app' ||
    menuButton.text !== MENU_BUTTON_TEXT ||
    menuButton.webAppUrl !== config.PUBLIC_ORIGIN
  ) {
    throw new Error('Telegram menu-button verification did not match production configuration.');
  }

  return {
    username: identity.username,
    webhookUrl,
    menuButtonUrl: config.PUBLIC_ORIGIN,
    pendingUpdateCount: webhookInfo.pendingUpdateCount,
  };
}
