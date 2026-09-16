import { PROTOCOL_VERSION, type ClientCommand } from '@caravan/protocol';
import { describe, expect, it } from 'vitest';
import { ACCOUNT_A, ACCOUNT_B, createHarness, surrenderCommand } from './fixtures.js';

const SURRENDER_ID = '00000000-0000-4000-8000-000000000201';
const RESYNC_ID = '00000000-0000-4000-8000-000000000202';
const AFTER_FINISH_ID = '00000000-0000-4000-8000-000000000203';

describe('server-owned match lifecycle', () => {
  it('finalizes surrender outside the pure game engine and keeps retries idempotent', async () => {
    const { store, service, matchId } = await createHarness();
    const command = surrenderCommand(SURRENDER_ID, 0);

    const first = await service.handleCommand(ACCOUNT_A, command);
    expect(first.type).toBe('SNAPSHOT');
    if (first.type !== 'SNAPSHOT') throw new Error('Expected surrender snapshot.');
    expect(first.snapshot.status).toBe('FINISHED');
    expect(first.snapshot.stateVersion).toBe(1);
    expect(first.snapshot.result).toEqual({
      reason: 'SURRENDER',
      winner: 'B',
      loser: 'A',
    });
    expect(first.snapshot.game.phase).toBe('OPENING');
    expect(first.snapshot.game.result).toBeNull();

    const retry = await service.handleCommand(ACCOUNT_A, command);
    expect(retry.type).toBe('SNAPSHOT');
    if (retry.type !== 'SNAPSHOT') throw new Error('Expected idempotent surrender snapshot.');
    expect(retry.snapshot.stateVersion).toBe(1);
    expect((await store.load(matchId))?.stateVersion).toBe(1);
  });

  it('rejects new state-changing commands after a lifecycle finish but still allows resync', async () => {
    const { service, matchId } = await createHarness();
    await service.handleCommand(ACCOUNT_A, surrenderCommand(SURRENDER_ID, 0));

    const afterFinish = await service.handleCommand(
      ACCOUNT_B,
      surrenderCommand(AFTER_FINISH_ID, 1),
    );
    expect(afterFinish.type).toBe('COMMAND_REJECTED');
    if (afterFinish.type !== 'COMMAND_REJECTED') throw new Error('Expected finished rejection.');
    expect(afterFinish.code).toBe('MATCH_FINISHED');

    const resync: ClientCommand = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'RESYNC',
      matchId,
      commandId: RESYNC_ID,
      knownStateVersion: 0,
    };
    const synced = await service.handleCommand(ACCOUNT_B, resync);
    expect(synced.type).toBe('SNAPSHOT');
    if (synced.type !== 'SNAPSHOT') throw new Error('Expected resync snapshot.');
    expect(synced.snapshot.stateVersion).toBe(1);
    expect(synced.snapshot.result?.reason).toBe('SURRENDER');
  });

  it('supports authoritative timeout finalization without inventing a game action', async () => {
    const { store, service, matchId } = await createHarness();
    expect(await service.finalizeTimeout(matchId, 'B')).toBe(true);
    expect(await service.finalizeTimeout(matchId, 'B')).toBe(false);

    const stored = await store.load(matchId);
    expect(stored?.stateVersion).toBe(1);
    expect(stored?.result).toEqual({ reason: 'TIMEOUT', winner: 'A', loser: 'B' });
    expect(stored?.game.phase).toBe('OPENING');
    expect(stored?.game.result).toBeNull();
  });

  it('supports infrastructure no-contest finalization with no winner', async () => {
    const { store, service, matchId } = await createHarness();
    expect(await service.abortNoContest(matchId)).toBe(true);

    const stored = await store.load(matchId);
    expect(stored?.stateVersion).toBe(1);
    expect(stored?.result).toEqual({ reason: 'NO_CONTEST', winner: null });
    expect(await service.getSnapshot(matchId, ACCOUNT_A)).toMatchObject({
      status: 'FINISHED',
      result: { reason: 'NO_CONTEST', winner: null },
    });
  });

  it('does not expose snapshots to accounts outside the match', async () => {
    const { service, matchId } = await createHarness();
    expect(await service.getSnapshot(matchId, 'not-a-player')).toBeNull();

    const command: ClientCommand = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'RESYNC',
      matchId,
      commandId: RESYNC_ID,
      knownStateVersion: null,
    };
    const response = await service.handleCommand('not-a-player', command);
    expect(response.type).toBe('COMMAND_REJECTED');
    if (response.type !== 'COMMAND_REJECTED') throw new Error('Expected membership rejection.');
    expect(response.code).toBe('NOT_MATCH_PLAYER');
    expect(response.snapshot).toBeUndefined();
  });
});
