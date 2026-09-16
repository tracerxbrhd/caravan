import type { CaravanGameState, PlayerSeat } from '@caravan/game-engine';
import type { MatchFinishResult, MatchId, StateVersion } from '@caravan/protocol';

export type AccountId = string;

export interface MatchParticipants {
  readonly A: AccountId;
  readonly B: AccountId;
}

export interface ProcessedCommandRecord {
  readonly accountId: AccountId;
  readonly commandId: string;
  readonly fingerprint: string;
  readonly acceptedStateVersion: StateVersion;
}

export interface AuthoritativeMatch {
  readonly id: MatchId;
  readonly stateVersion: StateVersion;
  readonly status: 'ACTIVE' | 'FINISHED';
  readonly participants: MatchParticipants;
  readonly game: CaravanGameState;
  readonly connected: Readonly<Record<PlayerSeat, boolean>>;
  readonly turnDeadlineAtMs: number | null;
  readonly reconnectDeadlineAtMs: Readonly<Record<PlayerSeat, number | null>>;
  readonly result: MatchFinishResult | null;
  readonly processedCommands: readonly ProcessedCommandRecord[];
}

export interface CreateMatchInput {
  readonly participants: MatchParticipants;
}
