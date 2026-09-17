import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const TELEGRAM_BRIDGE = '<script src="https://telegram.org/js/telegram-web-app.js"></script>';
const APP_ENTRY = '<script type="module" src="/src/main.tsx"></script>';
const indexHtmlPath = fileURLToPath(new URL('../index.html', import.meta.url));
const productionCaddyfilePath = fileURLToPath(
  new URL('../../../infra/caddy/Caddyfile', import.meta.url),
);

describe('Mini App Telegram shell', () => {
  it('loads the Telegram WebApp bridge before application bootstrap', async () => {
    const html = await readFile(indexHtmlPath, 'utf8');
    const telegramBridgeIndex = html.indexOf(TELEGRAM_BRIDGE);
    const appEntryIndex = html.indexOf(APP_ENTRY);

    expect(telegramBridgeIndex).toBeGreaterThanOrEqual(0);
    expect(appEntryIndex).toBeGreaterThan(telegramBridgeIndex);
  });

  it('allows the Telegram WebApp bridge through the production CSP', async () => {
    const caddyfile = await readFile(productionCaddyfilePath, 'utf8');

    expect(caddyfile).toContain("script-src 'self' https://telegram.org;");
  });
});
