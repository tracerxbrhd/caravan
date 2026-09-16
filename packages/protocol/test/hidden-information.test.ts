import { describe, expect, it } from 'vitest';
import { PROTOCOL_VERSION, matchSnapshotSchema, serverMessageSchema } from '../src/index.js';
import { MATCH_ID, makeSnapshot, makeState } from './fixtures.js';

describe('hidden-information protocol boundary', () => {
  it('does not serialize opponent hand identities or either future draw order', () => {
    const snapshot = matchSnapshotSchema.parse(makeSnapshot());
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain('B-0');
    expect(serialized).not.toContain('B-7');
    expect(serialized).not.toContain('A-8');
    expect(serialized).not.toContain('B-8');
    expect(serialized).not.toContain('drawPile');
  });

  it('rejects attempts to add opponent hand contents to a public player view', () => {
    const snapshot = makeSnapshot();
    const poisoned = {
      ...snapshot,
      game: {
        ...snapshot.game,
        players: {
          ...snapshot.game.players,
          B: {
            ...snapshot.game.players.B,
            hand: makeState().players.B.hand,
          },
        },
      },
    };

    expect(matchSnapshotSchema.safeParse(poisoned).success).toBe(false);
  });

  it('rejects attempts to add future deck order to a wire snapshot', () => {
    const snapshot = makeSnapshot();
    const poisoned = {
      ...snapshot,
      game: {
        ...snapshot.game,
        drawPile: makeState().players.A.drawPile,
      },
    };

    expect(matchSnapshotSchema.safeParse(poisoned).success).toBe(false);
  });

  it('rejects privileged state smuggled beside a valid snapshot', () => {
    const message = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'SNAPSHOT' as const,
      serverTimeMs: 10,
      commandId: null,
      snapshot: makeSnapshot(),
      authoritativeState: makeState(),
    };

    expect(serverMessageSchema.safeParse(message).success).toBe(false);
  });

  it('keeps match identifiers unrelated to card identities', () => {
    expect(matchSnapshotSchema.parse(makeSnapshot()).matchId).toBe(MATCH_ID);
  });
});
