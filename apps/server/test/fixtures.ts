import { PROTOCOL_VERSION, type ClientCommand, type MatchId } from '@caravan/protocol';
import { InMemoryMatchStore, MatchService, type MatchRandomSource } from '../src/index.js';

export const MATCH_ID = '00000000-0000-4000-8000-000000000005' as MatchId;
export const ACCOUNT_A = 'account-a';
export const ACCOUNT_B = 'account-b';

export class ZeroRandomSource implements MatchRandomSource {
  public uuid(): string {
    return MATCH_ID;
  }

  public nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) throw new RangeError('Expected a positive exclusive bound.');
    return 0;
  }
}

export async function createHarness() {
  const store = new InMemoryMatchStore();
  const service = new MatchService(store, {
    random: new ZeroRandomSource(),
    now: () => 1_000_000,
  });
  const created = await service.createMatch({
    participants: { A: ACCOUNT_A, B: ACCOUNT_B },
  });
  return { store, service, matchId: created.matchId };
}

export function gameplayCommand(
  commandId: string,
  expectedStateVersion: number,
  action: Extract<ClientCommand, { type: 'GAME_ACTION' }>['action'],
): ClientCommand {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'GAME_ACTION',
    matchId: MATCH_ID,
    commandId,
    expectedStateVersion,
    action,
  };
}

export function surrenderCommand(commandId: string, expectedStateVersion: number): ClientCommand {
  return {
    protocolVersion: PROTOCOL_VERSION,
    type: 'SURRENDER',
    matchId: MATCH_ID,
    commandId,
    expectedStateVersion,
  };
}
