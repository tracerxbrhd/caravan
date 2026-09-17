import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TELEGRAM_TOP_CHROME_FALLBACK, effectiveContentSafeTop } from '../src/platform.js';

describe('effectiveContentSafeTop', () => {
  it('prefers a meaningful Telegram content safe area', () => {
    expect(effectiveContentSafeTop(true, 24, 96)).toBe(96);
  });

  it.each([0, 40])('uses the Telegram chrome fallback for an insufficient %ipx inset', (top) => {
    expect(effectiveContentSafeTop(true, 24, top)).toBe(TELEGRAM_TOP_CHROME_FALLBACK);
  });

  it('does not add Telegram chrome spacing in a normal browser', () => {
    expect(effectiveContentSafeTop(false, 20, 0)).toBe(20);
    expect(effectiveContentSafeTop(false, 0, 0)).toBe(0);
  });
});

describe('Telegram content safe-area consumers', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

  it('uses stable viewport height and content safe-area insets for the shell', () => {
    expect(css).toMatch(/\.shell\s*{[^}]*var\(--app-viewport-stable-height/s);
    expect(css).toMatch(/\.shell\s*{[^}]*var\(--app-content-safe-top\)/s);
    expect(css).toMatch(/\.shell\s*{[^}]*var\(--app-content-safe-bottom\)/s);
  });
});
