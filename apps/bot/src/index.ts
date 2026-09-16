import { once } from 'node:events';
import { loadBotConfig } from './config.js';
import { createBotServer } from './server.js';
import { TelegramClient } from './telegram.js';

const config = loadBotConfig();
const telegram = new TelegramClient(config.BOT_TOKEN);
const server = createBotServer(config, telegram);

server.listen(config.BOT_PORT, config.BOT_HOST);
await once(server, 'listening');
process.stdout.write(`CARAVAN bot listening on ${config.BOT_HOST}:${config.BOT_PORT}\n`);

let shuttingDown = false;
async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) reject(error);
      else resolve();
    });
  });
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});
