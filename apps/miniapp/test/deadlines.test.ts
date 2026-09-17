import type { MatchSnapshot } from '@caravan/protocol';
import { describe, expect, it } from 'vitest';
import {
  estimatedServerNow,
  matchDeadlineNotices,
  remainingDeadlineSeconds,
} from '../src/deadlines.js';

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
  return {
    matchId: '00000000-0000-4000-8000-000000000001',
    stateVersion: 3,
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
          remainingDeckCount: 20,
          discardPile: [],
          routes: [route(), route(), route()],
        },
        B: {
          seat: 'B',
          handSize: 5,
          remainingDeckCount: 20,
          discardPile: [],
          routes: [route(), route(), route()],
        },
      },
      laneOwners: [null, null, null],
      result: null,
      actionSequence: 0,
      legalActions: [],
    },
    connected: { A: true, B: false },
    turnDeadlineAtMs: 120_000,
    reconnectDeadlineAtMs: { A: null, B: 95_000 },
    result: null,
  };
}

describe('match deadline presentation', () => {
  it('prioritizes the earliest authoritative deadline and identifies who it affects', () => {
    expect(matchDeadlineNotices(snapshot())).toEqual([
      {
        key: 'reconnect-B',
        label: 'Opponent reconnect',
        deadlineAtMs: 95_000,
        kind: 'RECONNECT',
        subject: 'OPPONENT',
      },
      {
        key: 'turn',
        label: 'Your turn',
        deadlineAtMs: 120_000,
        kind: 'TURN',
        subject: 'YOU',
      },
    ]);
  });

  it('uses a server clock anchor plus monotonic client elapsed time', () => {
    const anchor = { serverTimeMs: 50_000, clientMonotonicMs: 1_000_000 };
    expect(estimatedServerNow(anchor, 1_005_500)).toBe(55_500);
    expect(remainingDeadlineSeconds(60_001, 55_500)).toBe(5);
    expect(remainingDeadlineSeconds(55_000, 55_500)).toBe(0);
  });

  it('does not expose deadlines after the match has finished', () => {
    const finished = snapshot();
    finished.status = 'FINISHED';
    finished.turnDeadlineAtMs = null;
    finished.reconnectDeadlineAtMs = { A: null, B: null };
    finished.result = { reason: 'TIMEOUT', winner: 'B', loser: 'A' };
    expect(matchDeadlineNotices(finished)).toEqual([]);
  });
});
