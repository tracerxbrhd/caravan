import { describe, expect, it } from 'vitest';
import { ACCOUNT_A, ACCOUNT_B, createHarness, gameplayCommand } from './fixtures.js';

const COMMAND_ONE = '00000000-0000-4000-8000-000000000101';
const COMMAND_TWO = '00000000-0000-4000-8000-000000000102';
const COMMAND_THREE = '00000000-0000-4000-8000-000000000103';

describe('authoritative command processing', () => {
  it('accepts one legal action and advances stateVersion exactly once', async () => {
    const { store, service, matchId } = await createHarness();
    const snapshot = await service.getSnapshot(matchId, ACCOUNT_A);
    const action = snapshot?.game.legalActions[0];
    if (action === undefined) throw new Error('Expected an opening legal action.');

    const response = await service.handleCommand(
      ACCOUNT_A,
      gameplayCommand(COMMAND_ONE, 0, action),
    );
    expect(response.type).toBe('SNAPSHOT');
    if (response.type !== 'SNAPSHOT') throw new Error('Expected accepted snapshot.');
    expect(response.snapshot.stateVersion).toBe(1);
    expect(response.snapshot.game.actionSequence).toBe(1);
    expect(response.commandId).toBe(COMMAND_ONE);

    const stored = await store.load(matchId);
    expect(stored?.stateVersion).toBe(1);
    expect(stored?.game.actionSequence).toBe(1);
    expect(stored?.processedCommands).toHaveLength(1);
  });

  it('does not apply an identical retried command twice', async () => {
    const { store, service, matchId } = await createHarness();
    const snapshot = await service.getSnapshot(matchId, ACCOUNT_A);
    const action = snapshot?.game.legalActions[0];
    if (action === undefined) throw new Error('Expected an opening legal action.');
    const command = gameplayCommand(COMMAND_ONE, 0, action);

    const first = await service.handleCommand(ACCOUNT_A, command);
    const retry = await service.handleCommand(ACCOUNT_A, command);
    expect(first.type).toBe('SNAPSHOT');
    expect(retry.type).toBe('SNAPSHOT');
    if (retry.type !== 'SNAPSHOT') throw new Error('Expected idempotent snapshot.');
    expect(retry.snapshot.stateVersion).toBe(1);

    const stored = await store.load(matchId);
    expect(stored?.stateVersion).toBe(1);
    expect(stored?.game.actionSequence).toBe(1);
    expect(stored?.processedCommands).toHaveLength(1);
  });

  it('rejects command-id reuse with a different payload before stale-version handling', async () => {
    const { service, matchId } = await createHarness();
    const snapshot = await service.getSnapshot(matchId, ACCOUNT_A);
    const firstAction = snapshot?.game.legalActions[0];
    const secondAction = snapshot?.game.legalActions[1];
    if (firstAction === undefined || secondAction === undefined) {
      throw new Error('Expected at least two opening legal actions.');
    }

    await service.handleCommand(ACCOUNT_A, gameplayCommand(COMMAND_ONE, 0, firstAction));
    const reused = await service.handleCommand(
      ACCOUNT_A,
      gameplayCommand(COMMAND_ONE, 0, secondAction),
    );

    expect(reused.type).toBe('COMMAND_REJECTED');
    if (reused.type !== 'COMMAND_REJECTED') throw new Error('Expected rejection.');
    expect(reused.code).toBe('DUPLICATE_COMMAND');
    expect(reused.stateVersion).toBe(1);
  });

  it('rejects stale commands with a fresh sanitized snapshot', async () => {
    const { service, matchId } = await createHarness();
    const a = await service.getSnapshot(matchId, ACCOUNT_A);
    const aAction = a?.game.legalActions[0];
    if (aAction === undefined) throw new Error('Expected opening action for A.');
    await service.handleCommand(ACCOUNT_A, gameplayCommand(COMMAND_ONE, 0, aAction));

    const b = await service.getSnapshot(matchId, ACCOUNT_B);
    const bAction = b?.game.legalActions[0];
    if (bAction === undefined) throw new Error('Expected opening action for B.');
    const stale = await service.handleCommand(ACCOUNT_B, gameplayCommand(COMMAND_TWO, 0, bAction));

    expect(stale.type).toBe('COMMAND_REJECTED');
    if (stale.type !== 'COMMAND_REJECTED') throw new Error('Expected stale rejection.');
    expect(stale.code).toBe('STALE_STATE_VERSION');
    expect(stale.retryable).toBe(true);
    expect(stale.stateVersion).toBe(1);
    expect(stale.snapshot?.stateVersion).toBe(1);
    expect(JSON.stringify(stale.snapshot)).not.toContain('drawPile');
  });

  it('maps wrong-turn and illegal actions to stable protocol rejections', async () => {
    const { service, matchId } = await createHarness();
    const b = await service.getSnapshot(matchId, ACCOUNT_B);
    const valueCard = b?.game.hand.find(
      (card) => card.face.rank === 'ACE' || typeof card.face.rank === 'number',
    );
    if (valueCard === undefined) throw new Error('Expected value card in B opening hand.');

    const wrongTurn = await service.handleCommand(
      ACCOUNT_B,
      gameplayCommand(COMMAND_ONE, 0, {
        type: 'PLAY_VALUE_CARD',
        cardId: valueCard.id,
        route: 0,
      }),
    );
    expect(wrongTurn.type).toBe('COMMAND_REJECTED');
    if (wrongTurn.type !== 'COMMAND_REJECTED') throw new Error('Expected wrong-turn rejection.');
    expect(wrongTurn.code).toBe('NOT_ACTIVE_PLAYER');
    expect(wrongTurn.gameErrorCode).toBe('NOT_ACTIVE_PLAYER');

    const illegal = await service.handleCommand(
      ACCOUNT_A,
      gameplayCommand(COMMAND_TWO, 0, {
        type: 'PLAY_VALUE_CARD',
        cardId: 'not-in-hand',
        route: 0,
      }),
    );
    expect(illegal.type).toBe('COMMAND_REJECTED');
    if (illegal.type !== 'COMMAND_REJECTED') throw new Error('Expected illegal-action rejection.');
    expect(illegal.code).toBe('ILLEGAL_ACTION');
    expect(illegal.gameErrorCode).toBe('CARD_NOT_IN_HAND');
  });

  it('lets only one of two concurrent commands commit the same expected version', async () => {
    const { store, service, matchId } = await createHarness();
    const snapshot = await service.getSnapshot(matchId, ACCOUNT_A);
    const firstAction = snapshot?.game.legalActions[0];
    const secondAction = snapshot?.game.legalActions[1];
    if (firstAction === undefined || secondAction === undefined) {
      throw new Error('Expected at least two legal opening actions.');
    }

    const responses = await Promise.all([
      service.handleCommand(ACCOUNT_A, gameplayCommand(COMMAND_TWO, 0, firstAction)),
      service.handleCommand(ACCOUNT_A, gameplayCommand(COMMAND_THREE, 0, secondAction)),
    ]);

    expect(responses.filter((response) => response.type === 'SNAPSHOT')).toHaveLength(1);
    const rejected = responses.find((response) => response.type === 'COMMAND_REJECTED');
    expect(rejected?.type).toBe('COMMAND_REJECTED');
    if (rejected?.type !== 'COMMAND_REJECTED') throw new Error('Expected one rejected race.');
    expect(rejected.code).toBe('STALE_STATE_VERSION');

    const stored = await store.load(matchId);
    expect(stored?.stateVersion).toBe(1);
    expect(stored?.game.actionSequence).toBe(1);
    expect(stored?.processedCommands).toHaveLength(1);
  });
});
