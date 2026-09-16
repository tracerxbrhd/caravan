import { describe, expect, it } from 'vitest';
import {
  InMemoryMatchStore,
  MatchService,
  type MatchRandomSource,
} from '../src/index.js';

const MATCH_ID = '00000000-0000-4000-8000-000000000008';
const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';

class ZeroRandomSource implements MatchRandomSource {
  public uuid(): string {
    return MATCH_ID;
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new RangeError('Expected a positive exclusive bound.');
    return 0;
  }
}

async function harness() {
  let now = 1_000_000;
  const store = new InMemoryMatchStore();
  const service = new MatchService(store, {
    random: new ZeroRandomSource(),
    now: () => now,
    turnTimeoutMs: 60_000,
    reconnectGraceMs: 30_000,
  });
  const created = await service.createMatch({
    participants: { A: ACCOUNT_A, B: ACCOUNT_B },
  });
  return {
    service,
    matchId: created.matchId,
    setNow(value: number) {
      now = value;
    },
  };
}

describe('authoritative realtime match lifecycle', () => {
  it('starts the turn clock only when both players connect and preserves it across reconnect', async () => {
    const { service, matchId, setNow } = await harness();

    const first = await service.connectPlayer(matchId, ACCOUNT_A);
    expect(first?.connected).toEqual({ A: true, B: false });
    expect(first?.turnDeadlineAtMs).toBeNull();

    setNow(1_002_000);
    const ready = await service.connectPlayer(matchId, ACCOUNT_B);
    expect(ready?.connected).toEqual({ A: true, B: true });
    expect(ready?.turnDeadlineAtMs).toBe(1_062_000);

    setNow(1_003_000);
    const disconnected = await service.disconnectPlayer(matchId, ACCOUNT_A);
    expect(disconnected?.connected.A).toBe(false);
    expect(disconnected?.reconnectDeadlineAtMs.A).toBe(1_033_000);
    expect(disconnected?.turnDeadlineAtMs).toBe(1_062_000);

    setNow(1_004_000);
    const restored = await service.connectPlayer(matchId, ACCOUNT_A);
    expect(restored?.connected).toEqual({ A: true, B: true });
    expect(restored?.reconnectDeadlineAtMs.A).toBeNull();
    expect(restored?.turnDeadlineAtMs).toBe(1_062_000);
  });

  it('finalizes the active player when the authoritative turn deadline expires', async () => {
    const { service, matchId, setNow } = await harness();
    await service.connectPlayer(matchId, ACCOUNT_A);
    const ready = await service.connectPlayer(matchId, ACCOUNT_B);
    if (ready?.turnDeadlineAtMs === null || ready?.turnDeadlineAtMs === undefined) {
      throw new Error('Expected an active turn deadline.');
    }

    setNow(ready.turnDeadlineAtMs);
    expect(await service.expireMatchIfDue(matchId)).toBe(true);

    const finished = await service.getSnapshot(matchId, ACCOUNT_A);
    expect(finished?.status).toBe('FINISHED');
    expect(finished?.result).toEqual({ reason: 'TIMEOUT', winner: 'B', loser: 'A' });
    expect(finished?.turnDeadlineAtMs).toBeNull();
    expect(finished?.reconnectDeadlineAtMs).toEqual({ A: null, B: null });
  });

  it('finalizes a player who misses the reconnect grace period before the turn deadline', async () => {
    const { service, matchId, setNow } = await harness();
    await service.connectPlayer(matchId, ACCOUNT_A);
    await service.connectPlayer(matchId, ACCOUNT_B);

    setNow(1_005_000);
    const disconnected = await service.disconnectPlayer(matchId, ACCOUNT_B);
    if (disconnected?.reconnectDeadlineAtMs.B === null || disconnected === null) {
      throw new Error('Expected a reconnect deadline for player B.');
    }

    setNow(disconnected.reconnectDeadlineAtMs.B);
    expect(await service.expireMatchIfDue(matchId)).toBe(true);
    expect((await service.getSnapshot(matchId, ACCOUNT_A))?.result).toEqual({
      reason: 'TIMEOUT',
      winner: 'A',
      loser: 'B',
    });
  });

  it('converts stale live connections into reconnect state after a safe restart', async () => {
    const { service, matchId, setNow } = await harness();
    await service.connectPlayer(matchId, ACCOUNT_A);
    const ready = await service.connectPlayer(matchId, ACCOUNT_B);
    if (ready?.turnDeadlineAtMs === null || ready?.turnDeadlineAtMs === undefined) {
      throw new Error('Expected a turn deadline before recovery.');
    }

    setNow(1_010_000);
    expect(await service.recoverConnectionsAfterRestart()).toEqual([matchId]);

    const recovered = await service.getSnapshot(matchId, ACCOUNT_A);
    expect(recovered?.connected).toEqual({ A: false, B: false });
    expect(recovered?.turnDeadlineAtMs).toBe(ready.turnDeadlineAtMs);
    expect(recovered?.reconnectDeadlineAtMs).toEqual({ A: 1_040_000, B: 1_040_000 });

    setNow(1_040_000);
    expect(await service.expireMatchIfDue(matchId)).toBe(true);
    expect((await service.getSnapshot(matchId, ACCOUNT_A))?.result).toEqual({
      reason: 'NO_CONTEST',
      winner: null,
    });
  });

  it('does not award a timeout win for a deadline that expired while the server was unavailable', async () => {
    const { service, matchId, setNow } = await harness();
    await service.connectPlayer(matchId, ACCOUNT_A);
    const ready = await service.connectPlayer(matchId, ACCOUNT_B);
    if (ready?.turnDeadlineAtMs === null || ready?.turnDeadlineAtMs === undefined) {
      throw new Error('Expected a turn deadline before recovery.');
    }

    setNow(ready.turnDeadlineAtMs + 1);
    expect(await service.recoverConnectionsAfterRestart()).toEqual([matchId]);
    expect((await service.getSnapshot(matchId, ACCOUNT_A))?.result).toEqual({
      reason: 'NO_CONTEST',
      winner: null,
    });
  });
});
