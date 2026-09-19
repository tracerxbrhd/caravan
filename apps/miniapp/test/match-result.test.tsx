import { readFileSync } from 'node:fs';
import type { MatchSnapshot, RematchStatus } from '@caravan/protocol';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatchResult } from '../src/MatchResult.js';

const resultCss = readFileSync(new URL('../src/result.css', import.meta.url), 'utf8');
const matchSurfaceCss = readFileSync(new URL('../src/match-surface.css', import.meta.url), 'utf8');

function route(value: number, status: 'LIGHT' | 'IN_RANGE' | 'OVERLOADED') {
  return {
    cards: [],
    direction: null,
    activeSuit: null,
    value,
    status,
  } as const;
}

function routeFinishedSnapshot(): MatchSnapshot {
  return {
    matchId: '00000000-0000-4000-8000-000000000001',
    stateVersion: 12,
    status: 'FINISHED',
    game: {
      schemaVersion: 1,
      viewer: 'A',
      phase: 'FINISHED',
      startingPlayer: 'B',
      activePlayer: 'A',
      hand: [],
      players: {
        A: {
          seat: 'A',
          handSize: 0,
          remainingDeckCount: 8,
          discardPile: [],
          routes: [route(24, 'IN_RANGE'), route(25, 'IN_RANGE'), route(19, 'LIGHT')],
        },
        B: {
          seat: 'B',
          handSize: 0,
          remainingDeckCount: 11,
          discardPile: [],
          routes: [route(22, 'IN_RANGE'), route(23, 'IN_RANGE'), route(26, 'IN_RANGE')],
        },
      },
      laneOwners: ['A', 'A', 'B'],
      result: { reason: 'ROUTES', winner: 'A' },
      actionSequence: 18,
      legalActions: [],
    },
    connected: { A: true, B: true },
    turnDeadlineAtMs: null,
    reconnectDeadlineAtMs: { A: null, B: null },
    result: { reason: 'ROUTES', winner: 'A' },
  };
}

function noContestSnapshot(): MatchSnapshot {
  const snapshot = routeFinishedSnapshot();
  return {
    ...snapshot,
    game: {
      ...snapshot.game,
      phase: 'PLAYING',
      result: null,
      laneOwners: [null, null, null],
      legalActions: [],
    },
    result: { reason: 'NO_CONTEST', winner: null },
  };
}

function render(snapshot: MatchSnapshot, rematch: RematchStatus): string {
  return renderToStaticMarkup(
    <MatchResult
      snapshot={snapshot}
      rematch={rematch}
      rematchBusy={false}
      rematchError={null}
      onRematch={() => undefined}
      onExit={() => undefined}
    />,
  );
}

describe('MatchResult', () => {
  it('shows the authoritative winner, route explanation and all three final lane values', () => {
    const html = render(routeFinishedSnapshot(), { status: 'IDLE' });

    expect(html).toContain('You won');
    expect(html).toContain('secured at least two of the three trade lanes');
    expect(html).toContain('Lane 1');
    expect(html).toContain('Lane 2');
    expect(html).toContain('Lane 3');
    expect(html).toContain('24');
    expect(html).toContain('22');
    expect(html).toContain('Play again');
    expect(html).toContain('Return to Play');
  });

  it('renders the final result as a modal overlay above the preserved table', () => {
    const html = render(routeFinishedSnapshot(), { status: 'IDLE' });

    expect(html).toContain('class="match-result-overlay"');
    expect(html).toContain('class="match-result-backdrop"');
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(resultCss).toMatch(/\.match-result-overlay\s*\{[\s\S]*?position:\s*fixed/);
    expect(resultCss).toMatch(/\.match-result-overlay\s*\{[\s\S]*?place-items:\s*center/);
    expect(resultCss).toMatch(/\.match-result\s*\{[\s\S]*?max-height:/);
    expect(resultCss).toMatch(/\.match-result\s*\{[\s\S]*?overflow-y:\s*auto/);
    expect(matchSurfaceCss).not.toMatch(/\.match-result\s*\{/);
  });

  it('turns a waiting opponent request into an explicit accept-rematch action', () => {
    const html = render(routeFinishedSnapshot(), {
      status: 'WAITING',
      requestedBy: 'OPPONENT',
      expiresAtMs: 123_456,
    });

    expect(html).toContain('Your opponent wants another match.');
    expect(html).toContain('Accept rematch');
  });

  it('presents infrastructure no-contest without blaming either player', () => {
    const html = render(noContestSnapshot(), { status: 'IDLE' });

    expect(html).toContain('No contest');
    expect(html).toContain('without assigning a winner');
    expect(html).toContain('No player is blamed for this result');
    expect(html).not.toContain('Final trade lane outcomes');
  });
});
