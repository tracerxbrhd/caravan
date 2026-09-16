import type { MatchSnapshot } from '@caravan/protocol';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CardTable } from '../src/CardTable.js';

type RouteView = MatchSnapshot['game']['players']['A']['routes'][number];

function route(): RouteView {
  return {
    cards: [],
    direction: null,
    activeSuit: null,
    value: 0,
    status: 'LIGHT',
  };
}

function snapshot(): MatchSnapshot {
  const discarded = {
    id: 'discarded-7-clubs',
    owner: 'A' as const,
    face: { rank: 7 as const, suit: 'CLUBS' as const },
  };

  return {
    matchId: '00000000-0000-4000-8000-000000000001',
    stateVersion: 4,
    status: 'ACTIVE',
    game: {
      schemaVersion: 1,
      viewer: 'A',
      phase: 'PLAYING',
      startingPlayer: 'A',
      activePlayer: 'A',
      hand: [],
      players: {
        A: {
          seat: 'A',
          handSize: 0,
          remainingDeckCount: 18,
          discardPile: [discarded],
          routes: [route(), route(), route()],
        },
        B: {
          seat: 'B',
          handSize: 5,
          remainingDeckCount: 19,
          discardPile: [],
          routes: [route(), route(), route()],
        },
      },
      laneOwners: [null, null, null],
      result: null,
      actionSequence: 4,
      legalActions: [],
    },
    connected: { A: true, B: true },
    turnDeadlineAtMs: null,
    reconnectDeadlineAtMs: { A: null, B: null },
    result: null,
  };
}

describe('CardTable tactile presentation', () => {
  it('renders public discard state and optional feel controls without a browser runtime', () => {
    const html = renderToStaticMarkup(
      <CardTable
        snapshot={snapshot()}
        connectionReady
        pending={false}
        rejection={null}
        onAction={() => false}
        onSurrender={() => false}
      />,
    );

    expect(html).toContain('Your discard pile, 1 cards');
    expect(html).toContain('Table feel settings');
    expect(html).toContain('Sound on');
    expect(html).toContain('Motion system');
    expect(html).toContain('view-transition-name:caravan-card-discarded-7-clubs');
  });
});
