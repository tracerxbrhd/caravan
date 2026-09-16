import { describe, expect, it } from 'vitest';
import { ACCOUNT_A, ACCOUNT_B, createHarness, gameplayCommand } from './fixtures.js';

function commandIdFor(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

describe('engine-to-server match integration', () => {
  it('can complete an entire authoritative match using only projected legal actions', async () => {
    const { service, matchId } = await createHarness();
    let stateVersion = 0;
    let finalReason: string | null = null;

    for (let sequence = 1; sequence <= 200; sequence += 1) {
      const observer = await service.getSnapshot(matchId, ACCOUNT_A);
      if (observer === null) throw new Error('Match disappeared during integration test.');
      if (observer.status === 'FINISHED') {
        finalReason = observer.result?.reason ?? null;
        break;
      }

      const actorAccount = observer.game.activePlayer === 'A' ? ACCOUNT_A : ACCOUNT_B;
      const actorSnapshot = await service.getSnapshot(matchId, actorAccount);
      const action = actorSnapshot?.game.legalActions.find(
        (candidate) => candidate.type !== 'DISBAND_ROUTE',
      );
      if (action === undefined) throw new Error('Active player has no consumptive legal action.');

      const response = await service.handleCommand(
        actorAccount,
        gameplayCommand(commandIdFor(sequence), stateVersion, action),
      );
      expect(response.type).toBe('SNAPSHOT');
      if (response.type !== 'SNAPSHOT') throw new Error('Generated legal action was rejected.');
      stateVersion = response.snapshot.stateVersion;
      expect(stateVersion).toBe(sequence);
      expect(JSON.stringify(response.snapshot)).not.toContain('drawPile');

      if (response.snapshot.status === 'FINISHED') {
        finalReason = response.snapshot.result?.reason ?? null;
        break;
      }
    }

    expect(finalReason).not.toBeNull();
    expect(['ROUTES', 'DECK_EXHAUSTION']).toContain(finalReason);

    const a = await service.getSnapshot(matchId, ACCOUNT_A);
    const b = await service.getSnapshot(matchId, ACCOUNT_B);
    expect(a?.status).toBe('FINISHED');
    expect(b?.status).toBe('FINISHED');
    expect(a?.result).toEqual(b?.result);
  });
});
