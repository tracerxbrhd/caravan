import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(new URL('../src/main.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../src/pr23.css', import.meta.url), 'utf8');
const matchSession = readFileSync(new URL('../src/MatchSession.tsx', import.meta.url), 'utf8');

describe('PR23 mobile match surface', () => {
  it('loads the stabilization overrides after the existing match styles', () => {
    expect(main.indexOf("import './pr23.css';")).toBeGreaterThan(
      main.indexOf("import './hardening.css';"),
    );
  });

  it('keeps the live table below Telegram chrome using the computed content safe area', () => {
    expect(css).toMatch(/\.shell--match\s*\{[^}]*var\(--app-content-safe-top\)/s);
    expect(css).toMatch(/\.shell--match\s*\{[^}]*var\(--app-content-safe-bottom\)/s);
    expect(css).toMatch(
      /@media \(max-width: 440px\)[\s\S]*?\.shell--match\s*\{[^}]*var\(--app-content-safe-top\)/s,
    );
  });

  it('presents control replacement as an account-scoped screen takeover rather than opponent ownership', () => {
    expect(matchSession).toContain('Only another window or device signed in as this account');
    expect(matchSession).toContain('Your opponent has separate match control.');
    expect(matchSession).not.toContain('Another window took match control');
  });

  it('removes the internal state version from the player-facing match header', () => {
    expect(matchSession).not.toContain('state-version');
  });
});
