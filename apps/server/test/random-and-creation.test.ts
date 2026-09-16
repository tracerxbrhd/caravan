import { isValueRank } from '@caravan/game-engine';
import { describe, expect, it } from 'vitest';
import {
  STARTER_DECK_CARD_COUNT,
  createStarterDeckInstances,
  fisherYatesShuffle,
  type MatchRandomSource,
} from '../src/index.js';
import { ACCOUNT_A, ACCOUNT_B, MATCH_ID, createHarness } from './fixtures.js';

class IdentityRandomSource implements MatchRandomSource {
  public uuid(): string {
    return MATCH_ID;
  }

  public nextInt(maxExclusive: number): number {
    return maxExclusive - 1;
  }
}

describe('secure match initialization boundary', () => {
  it('uses an unbiased Fisher-Yates shape without mutating the input', () => {
    const input = [1, 2, 3, 4] as const;
    const shuffled = fisherYatesShuffle(input, new IdentityRandomSource());
    expect(shuffled).toEqual([1, 2, 3, 4]);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it('defines one equal 54-card starter deck for either seat', () => {
    const a = createStarterDeckInstances(MATCH_ID, 'A');
    const b = createStarterDeckInstances(MATCH_ID, 'B');
    expect(a).toHaveLength(STARTER_DECK_CARD_COUNT);
    expect(b).toHaveLength(STARTER_DECK_CARD_COUNT);
    expect(new Set(a.map((card) => card.deckCardId)).size).toBe(STARTER_DECK_CARD_COUNT);
    expect(new Set(b.map((card) => card.deckCardId)).size).toBe(STARTER_DECK_CARD_COUNT);
    expect(a.map((card) => card.face)).toEqual(b.map((card) => card.face));
  });

  it('creates a server-owned active match with accepted private opening hands', async () => {
    const { store, service, matchId } = await createHarness();
    const authoritative = await store.load(matchId);
    expect(authoritative).not.toBeNull();
    if (authoritative === null) throw new Error('Expected authoritative match.');

    expect(authoritative.game.startingPlayer).toBe('A');
    expect(authoritative.game.players.A.hand).toHaveLength(8);
    expect(authoritative.game.players.B.hand).toHaveLength(8);
    expect(authoritative.game.players.A.drawPile).toHaveLength(46);
    expect(authoritative.game.players.B.drawPile).toHaveLength(46);

    for (const seat of ['A', 'B'] as const) {
      const valueCount = authoritative.game.players[seat].hand.filter((cardId) =>
        isValueRank(authoritative.game.cards.byId[cardId]?.face.rank ?? 'JOKER'),
      ).length;
      expect(valueCount).toBeGreaterThanOrEqual(3);
    }

    const viewA = await service.getSnapshot(matchId, ACCOUNT_A);
    const viewB = await service.getSnapshot(matchId, ACCOUNT_B);
    expect(viewA?.game.hand).toHaveLength(8);
    expect(viewB?.game.hand).toHaveLength(8);
    expect(viewA?.game.players.B.handSize).toBe(8);
    expect(viewB?.game.players.A.handSize).toBe(8);
    expect(JSON.stringify(viewA)).not.toContain('drawPile');
    expect(JSON.stringify(viewB)).not.toContain('drawPile');
  });
});
