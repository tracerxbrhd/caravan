import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  clientCommandSchema,
  commandRejectedMessageSchema,
  matchFinishResultSchema,
  matchSnapshotSchema,
  playerViewSchema,
  serverMessageSchema,
} from '../src/index.js';
import { COMMAND_ID, MATCH_ID, makeSnapshot, makeState } from './fixtures.js';

describe('client command contracts', () => {
  it('accepts a versioned gameplay command with expected state version', () => {
    const parsed = clientCommandSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'GAME_ACTION',
      matchId: MATCH_ID,
      commandId: COMMAND_ID,
      expectedStateVersion: 7,
      action: {
        type: 'PLAY_VALUE_CARD',
        cardId: 'A-0',
        route: 0,
      },
    });

    expect(parsed.type).toBe('GAME_ACTION');
    if (parsed.type !== 'GAME_ACTION') throw new Error('Expected gameplay command.');
    expect(parsed.expectedStateVersion).toBe(7);
  });

  it('rejects unsupported protocol versions and client-supplied replacement state', () => {
    expect(
      clientCommandSchema.safeParse({
        protocolVersion: 2,
        type: 'GAME_ACTION',
        matchId: MATCH_ID,
        commandId: COMMAND_ID,
        expectedStateVersion: 0,
        action: { type: 'DISCARD_HAND_CARD', cardId: 'A-0' },
      }).success,
    ).toBe(false);

    expect(
      clientCommandSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'GAME_ACTION',
        matchId: MATCH_ID,
        commandId: COMMAND_ID,
        expectedStateVersion: 0,
        action: { type: 'DISCARD_HAND_CARD', cardId: 'A-0' },
        state: makeState(),
      }).success,
    ).toBe(false);
  });

  it('supports surrender and resync without pretending they are game actions', () => {
    expect(
      clientCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'SURRENDER',
        matchId: MATCH_ID,
        commandId: COMMAND_ID,
        expectedStateVersion: 4,
      }).type,
    ).toBe('SURRENDER');

    expect(
      clientCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'RESYNC',
        matchId: MATCH_ID,
        commandId: COMMAND_ID,
        knownStateVersion: null,
      }).type,
    ).toBe('RESYNC');
  });
});

describe('server message contracts', () => {
  it('accepts an actual engine PlayerView inside a sanitized match snapshot', () => {
    const snapshot = makeSnapshot();
    expect(playerViewSchema.parse(snapshot.game)).toEqual(snapshot.game);
    expect(matchSnapshotSchema.parse(snapshot)).toEqual(snapshot);

    const message = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'SNAPSHOT' as const,
      serverTimeMs: 123456,
      commandId: COMMAND_ID,
      snapshot,
    };
    expect(serverMessageSchema.parse(message)).toEqual(message);
  });

  it('rejects privileged engine state as a PlayerView', () => {
    expect(playerViewSchema.safeParse(makeState()).success).toBe(false);
  });

  it('enforces active/finished result consistency', () => {
    const activeWithResult = {
      ...makeSnapshot(),
      result: { reason: 'SURRENDER' as const, winner: 'A' as const, loser: 'B' as const },
    };
    expect(matchSnapshotSchema.safeParse(activeWithResult).success).toBe(false);

    const finishedWithoutResult = {
      ...makeSnapshot(),
      status: 'FINISHED' as const,
    };
    expect(matchSnapshotSchema.safeParse(finishedWithoutResult).success).toBe(false);

    const finished = {
      ...makeSnapshot(),
      status: 'FINISHED' as const,
      result: { reason: 'TIMEOUT' as const, winner: 'A' as const, loser: 'B' as const },
    };
    expect(matchSnapshotSchema.parse(finished)).toEqual(finished);
  });

  it('rejects impossible winner/loser pairs', () => {
    expect(
      matchFinishResultSchema.safeParse({
        reason: 'SURRENDER',
        winner: 'A',
        loser: 'A',
      }).success,
    ).toBe(false);
  });

  it('accepts stable engine rule codes only through an explicit rejection payload', () => {
    const rejection = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'COMMAND_REJECTED' as const,
      serverTimeMs: 100,
      matchId: MATCH_ID,
      commandId: COMMAND_ID,
      stateVersion: 3,
      code: 'ILLEGAL_ACTION' as const,
      retryable: false,
      gameErrorCode: 'QUEEN_REQUIRES_TERMINAL' as const,
    };
    expect(commandRejectedMessageSchema.parse(rejection)).toEqual(rejection);

    expect(
      commandRejectedMessageSchema.safeParse({
        ...rejection,
        gameErrorCode: 'NOT_A_REAL_ENGINE_CODE',
      }).success,
    ).toBe(false);
  });

  it('requires rejection snapshots to match the advertised match and state version', () => {
    const snapshot = { ...makeSnapshot(), stateVersion: 4 };
    const rejection = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'COMMAND_REJECTED' as const,
      serverTimeMs: 100,
      matchId: MATCH_ID,
      commandId: COMMAND_ID,
      stateVersion: 3,
      code: 'STALE_STATE_VERSION' as const,
      retryable: true,
      gameErrorCode: null,
      snapshot,
    };

    expect(commandRejectedMessageSchema.safeParse(rejection).success).toBe(false);
    expect(
      commandRejectedMessageSchema.safeParse({
        ...rejection,
        stateVersion: 4,
      }).success,
    ).toBe(true);
  });
});
