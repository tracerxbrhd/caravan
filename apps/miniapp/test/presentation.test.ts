import type { MatchSnapshot } from '@caravan/protocol';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRESENTATION_PREFERENCES,
  cardTransitionName,
  deriveTableFeedbackCue,
  parsePresentationPreferences,
} from '../src/presentation.js';

type PublicCard = MatchSnapshot['game']['hand'][number];
type RouteView = MatchSnapshot['game']['players']['A']['routes'][number];

function card(id: string, rank: PublicCard['face']['rank'] = 5): PublicCard {
  if (rank === 'JOKER') return { id, owner: 'A', face: { rank, suit: null } };
  return { id, owner: 'A', face: { rank, suit: 'CLUBS' } };
}

function route(): RouteView {
  return {
    cards: [],
    direction: null,
    activeSuit: null,
    value: 0,
    status: 'LIGHT',
  };
}

function activeSnapshot(): MatchSnapshot {
  return {
    matchId: '00000000-0000-4000-8000-000000000001',
    stateVersion: 1,
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
    connected: { A: true, B: true },
    turnDeadlineAtMs: null,
    reconnectDeadlineAtMs: { A: null, B: null },
    result: null,
  };
}

function advance(snapshot: MatchSnapshot): MatchSnapshot {
  const next = structuredClone(snapshot);
  next.stateVersion += 1;
  next.game.actionSequence += 1;
  return next;
}

describe('tactile presentation model', () => {
  it('classifies confirmed placement, modifier, discard and removal from sanitized snapshots', () => {
    const placementBefore = activeSnapshot();
    const valueCard = card('value-5');
    placementBefore.game.hand = [valueCard];
    placementBefore.game.players.A.handSize = 1;
    const placementAfter = advance(placementBefore);
    placementAfter.game.hand = [];
    placementAfter.game.players.A.handSize = 0;
    placementAfter.game.players.A.routes[0].cards = [{ card: valueCard, modifiers: [] }];
    placementAfter.game.players.A.routes[0].value = 5;

    expect(deriveTableFeedbackCue(placementBefore, placementAfter)).toBe('PLACE');

    const modifierBefore = placementAfter;
    const king = card('king-clubs', 'KING');
    modifierBefore.game.hand = [king];
    modifierBefore.game.players.A.handSize = 1;
    const modifierAfter = advance(modifierBefore);
    modifierAfter.game.hand = [];
    modifierAfter.game.players.A.handSize = 0;
    modifierAfter.game.players.A.routes[0].cards[0].modifiers = [king];

    expect(deriveTableFeedbackCue(modifierBefore, modifierAfter)).toBe('MODIFIER');

    const discardBefore = modifierAfter;
    const discarded = card('discard-me', 7);
    discardBefore.game.hand = [discarded];
    discardBefore.game.players.A.handSize = 1;
    const discardAfter = advance(discardBefore);
    discardAfter.game.hand = [];
    discardAfter.game.players.A.handSize = 0;
    discardAfter.game.players.A.discardPile = [discarded];

    expect(deriveTableFeedbackCue(discardBefore, discardAfter)).toBe('DISCARD');

    const removalBefore = discardAfter;
    const removalAfter = advance(removalBefore);
    removalAfter.game.players.A.routes[0].cards = [];
    removalAfter.game.players.A.routes[0].value = 0;
    removalAfter.game.players.A.discardPile = [discarded, valueCard, king];

    expect(deriveTableFeedbackCue(removalBefore, removalAfter)).toBe('REMOVE');
  });

  it('recognizes player-safe draws and authoritative match completion', () => {
    const beforeDraw = activeSnapshot();
    const afterDraw = advance(beforeDraw);
    afterDraw.game.players.B.handSize += 1;
    afterDraw.game.players.B.remainingDeckCount -= 1;

    expect(deriveTableFeedbackCue(beforeDraw, afterDraw)).toBe('DRAW');

    const finished = advance(afterDraw);
    finished.status = 'FINISHED';
    finished.result = { reason: 'SURRENDER', winner: 'A', loser: 'B' };

    expect(deriveTableFeedbackCue(afterDraw, finished)).toBe('RESULT');
  });

  it('does not replay effects for the same state and keeps transition names CSS-safe', () => {
    const snapshot = activeSnapshot();
    expect(deriveTableFeedbackCue(null, snapshot)).toBeNull();
    expect(deriveTableFeedbackCue(snapshot, snapshot)).toBeNull();
    expect(cardTransitionName('card:five/hearts')).toBe('caravan-card-card-five-hearts');
  });

  it('parses persisted preferences fail-closed without making them authoritative', () => {
    expect(parsePresentationPreferences(null)).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
    expect(parsePresentationPreferences('{broken')).toEqual(DEFAULT_PRESENTATION_PREFERENCES);
    expect(
      parsePresentationPreferences(
        JSON.stringify({ sound: false, haptics: false, motion: 'REDUCED', ignored: true }),
      ),
    ).toEqual({ sound: false, haptics: false, motion: 'REDUCED' });
  });
});
