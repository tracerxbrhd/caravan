import { loadBotConfig } from './config.js';
import { configureProductionTelegram } from './production-wiring.js';
import { TelegramClient } from './telegram.js';

try {
  const config = loadBotConfig();
  const result = await configureProductionTelegram(config, new TelegramClient(config.BOT_TOKEN));
  process.stdout.write(
    `Telegram production wiring verified for @${result.username}: ${result.webhookUrl}; menu -> ${result.menuButtonUrl}; pending updates: ${result.pendingUpdateCount}\n`,
  );
} catch (error) {
  const message =
    error instanceof Error ? error.message : 'Unknown Telegram production wiring failure.';
  process.stderr.write(`Telegram production wiring failed: ${message}\n`);
  process.exitCode = 1;
}
