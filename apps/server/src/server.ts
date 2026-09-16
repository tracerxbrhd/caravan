import { buildServer } from './app.js';
import { loadConfig } from './config.js';
import { createPool } from './db.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const pool = createPool(config.DATABASE_URL);
  const app = await buildServer(pool, config);
  let closing = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Shutting down CARAVAN server');
    await app.close();
    await pool.end();
  };

  process.once('SIGINT', () => {
    void shutdown('SIGINT').then(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM').then(() => process.exit(0));
  });

  try {
    await app.listen({ host: config.SERVER_HOST, port: config.SERVER_PORT });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start CARAVAN server');
    await pool.end();
    process.exitCode = 1;
  }
}

void main();
