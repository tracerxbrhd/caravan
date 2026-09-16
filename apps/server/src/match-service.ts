import {
  GameRuleError,
  applyAction,
  createGame,
  otherSeat,
  projectForPlayer,
  type GameAction,
  type GameResult,
  type GameRuleErrorCode,
  type PlayerSeat,
} from '@caravan/game-engine';
import {
  PROTOCOL_VERSION,
  commandRejectedMessageSchema,
  matchIdSchema,
  matchSnapshotSchema,
  snapshotMessageSchema,
  type ClientCommand,
  type CommandRejectionCode,
  type MatchFinishResult,
  type MatchId,
  type MatchSnapshot,
  type ServerMessage,
} from '@caravan/protocol';
import type {
  AccountId,
  AuthoritativeMatch,
  CreateMatchInput,
  ProcessedCommandRecord,
} from './match-types.js';
import type { MatchStore } from './match-store.js';
import { cryptoMatchRandomSource, type MatchRandomSource } from './random.js';
import { createAcceptedShuffledStarterDeck } from './starter-deck.js';

export interface MatchServiceOptions {
  readonly random?: MatchRandomSource;
  readonly now?: () => number;
}

type StateChangingCommand = Exclude<ClientCommand, { readonly type: 'RESYNC' }>;

function actionFingerprint(action: GameAction): readonly unknown[] {
  switch (action.type) {
    case 'PLAY_VALUE_CARD':
      return [action.type, action.cardId, action.route];
    case 'PLAY_MODIFIER_CARD':
      return [action.type, action.cardId, action.targetPlayer, action.route, action.targetCardId];
    case 'DISCARD_HAND_CARD':
      return [action.type, action.cardId];
    case 'DISBAND_ROUTE':
      return [action.type, action.route];
  }
}

function commandFingerprint(command: StateChangingCommand): string {
  if (command.type === 'SURRENDER') {
    return JSON.stringify([
      command.protocolVersion,
      command.matchId,
      command.expectedStateVersion,
      command.type,
    ]);
  }

  return JSON.stringify([
    command.protocolVersion,
    command.matchId,
    command.expectedStateVersion,
    command.type,
    actionFingerprint(command.action),
  ]);
}

function seatFor(match: AuthoritativeMatch, accountId: AccountId): PlayerSeat | null {
  if (match.participants.A === accountId) return 'A';
  if (match.participants.B === accountId) return 'B';
  return null;
}

function finishResultFromGame(result: GameResult): MatchFinishResult {
  if (result.reason === 'ROUTES') return { reason: 'ROUTES', winner: result.winner };
  return {
    reason: 'DECK_EXHAUSTION',
    winner: result.winner,
    loser: result.exhaustedPlayer,
  };
}

function rejectionCodeForRuleError(error: GameRuleError): CommandRejectionCode {
  if (error.code === 'NOT_ACTIVE_PLAYER') return 'NOT_ACTIVE_PLAYER';
  if (error.code === 'GAME_FINISHED') return 'MATCH_FINISHED';
  return 'ILLEGAL_ACTION';
}

export class MatchService {
  readonly #store: MatchStore;
  readonly #random: MatchRandomSource;
  readonly #now: () => number;

  public constructor(store: MatchStore, options: MatchServiceOptions = {}) {
    this.#store = store;
    this.#random = options.random ?? cryptoMatchRandomSource;
    this.#now = options.now ?? Date.now;
  }

  public async createMatch(input: CreateMatchInput): Promise<{ readonly matchId: MatchId }> {
    if (input.participants.A.length === 0 || input.participants.B.length === 0) {
      throw new Error('Match participants must have non-empty internal account ids.');
    }
    if (input.participants.A === input.participants.B) {
      throw new Error('A player cannot occupy both seats in one match.');
    }

    const matchId = matchIdSchema.parse(this.#random.uuid());
    const startingRoll = this.#random.nextInt(2);
    if (startingRoll !== 0 && startingRoll !== 1) {
      throw new RangeError('Starting-seat random source must return 0 or 1.');
    }
    const startingPlayer: PlayerSeat = startingRoll === 0 ? 'A' : 'B';
    const game = createGame({
      startingPlayer,
      decks: {
        A: createAcceptedShuffledStarterDeck(matchId, 'A', this.#random),
        B: createAcceptedShuffledStarterDeck(matchId, 'B', this.#random),
      },
    });

    const match: AuthoritativeMatch = {
      id: matchId,
      stateVersion: 0,
      status: 'ACTIVE',
      participants: { ...input.participants },
      game,
      connected: { A: false, B: false },
      turnDeadlineAtMs: null,
      reconnectDeadlineAtMs: { A: null, B: null },
      result: null,
      processedCommands: [],
    };

    this.#validateOutboundSnapshots(match);
    await this.#store.create(match);
    return { matchId };
  }

  public async getSnapshot(matchId: MatchId, accountId: AccountId): Promise<MatchSnapshot | null> {
    const match = await this.#store.load(matchId);
    if (match === null) return null;
    const seat = seatFor(match, accountId);
    return seat === null ? null : this.#snapshot(match, seat);
  }

  public async handleCommand(accountId: AccountId, command: ClientCommand): Promise<ServerMessage> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const match = await this.#store.load(command.matchId);
      if (match === null) {
        return this.#rejection(null, null, command, 'MATCH_NOT_FOUND', false, null);
      }

      const seat = seatFor(match, accountId);
      if (seat === null) {
        return this.#rejection(match, null, command, 'NOT_MATCH_PLAYER', false, null);
      }

      if (command.type === 'RESYNC') {
        return this.#snapshotMessage(match, seat, command.commandId);
      }

      const fingerprint = commandFingerprint(command);
      const previous = match.processedCommands.find(
        (record) => record.accountId === accountId && record.commandId === command.commandId,
      );
      if (previous !== undefined) {
        if (previous.fingerprint !== fingerprint) {
          return this.#rejection(match, seat, command, 'DUPLICATE_COMMAND', false, null);
        }
        return this.#snapshotMessage(match, seat, command.commandId);
      }

      if (command.expectedStateVersion !== match.stateVersion) {
        return this.#rejection(match, seat, command, 'STALE_STATE_VERSION', true, null);
      }
      if (match.status === 'FINISHED') {
        return this.#rejection(match, seat, command, 'MATCH_FINISHED', false, null);
      }

      let nextGame = match.game;
      let nextStatus: AuthoritativeMatch['status'] = match.status;
      let nextResult = match.result;

      if (command.type === 'SURRENDER') {
        nextStatus = 'FINISHED';
        nextResult = { reason: 'SURRENDER', winner: otherSeat(seat), loser: seat };
      } else {
        try {
          const transition = applyAction(match.game, seat, command.action);
          nextGame = transition.state;
          if (nextGame.phase === 'FINISHED') {
            if (nextGame.result === null) {
              throw new Error('Finished game state is missing its engine result.');
            }
            nextStatus = 'FINISHED';
            nextResult = finishResultFromGame(nextGame.result);
          }
        } catch (error) {
          if (!(error instanceof GameRuleError)) throw error;
          return this.#rejection(
            match,
            seat,
            command,
            rejectionCodeForRuleError(error),
            false,
            error.code,
          );
        }
      }

      const acceptedStateVersion = match.stateVersion + 1;
      const record: ProcessedCommandRecord = {
        accountId,
        commandId: command.commandId,
        fingerprint,
        acceptedStateVersion,
      };
      const next: AuthoritativeMatch = {
        ...match,
        stateVersion: acceptedStateVersion,
        status: nextStatus,
        game: nextGame,
        result: nextResult,
        processedCommands: [...match.processedCommands, record],
      };

      this.#validateOutboundSnapshots(next);
      if (await this.#store.compareAndSet(match.id, match.stateVersion, next)) {
        return this.#snapshotMessage(next, seat, command.commandId);
      }
    }

    const latest = await this.#store.load(command.matchId);
    const latestSeat = latest === null ? null : seatFor(latest, accountId);
    return this.#rejection(latest, latestSeat, command, 'INTERNAL_ERROR', true, null);
  }

  public async finalizeTimeout(matchId: MatchId, loser: PlayerSeat): Promise<boolean> {
    return this.#finalizeLifecycle(matchId, {
      reason: 'TIMEOUT',
      winner: otherSeat(loser),
      loser,
    });
  }

  public async abortNoContest(matchId: MatchId): Promise<boolean> {
    return this.#finalizeLifecycle(matchId, { reason: 'NO_CONTEST', winner: null });
  }

  async #finalizeLifecycle(matchId: MatchId, result: MatchFinishResult): Promise<boolean> {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const match = await this.#store.load(matchId);
      if (match === null || match.status === 'FINISHED') return false;
      if (match.game.phase === 'FINISHED' || match.game.result !== null) {
        throw new Error('Lifecycle finalization cannot overwrite a finished rule-engine result.');
      }

      const next: AuthoritativeMatch = {
        ...match,
        stateVersion: match.stateVersion + 1,
        status: 'FINISHED',
        result,
      };
      this.#validateOutboundSnapshots(next);
      if (await this.#store.compareAndSet(match.id, match.stateVersion, next)) return true;
    }
    return false;
  }

  #snapshot(match: AuthoritativeMatch, viewer: PlayerSeat): MatchSnapshot {
    return matchSnapshotSchema.parse({
      matchId: match.id,
      stateVersion: match.stateVersion,
      status: match.status,
      game: projectForPlayer(match.game, viewer),
      connected: match.connected,
      turnDeadlineAtMs: match.turnDeadlineAtMs,
      reconnectDeadlineAtMs: match.reconnectDeadlineAtMs,
      result: match.result,
    });
  }

  #snapshotMessage(
    match: AuthoritativeMatch,
    viewer: PlayerSeat,
    commandId: string,
  ): ServerMessage {
    return snapshotMessageSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'SNAPSHOT',
      serverTimeMs: this.#now(),
      commandId,
      snapshot: this.#snapshot(match, viewer),
    });
  }

  #rejection(
    match: AuthoritativeMatch | null,
    viewer: PlayerSeat | null,
    command: ClientCommand,
    code: CommandRejectionCode,
    retryable: boolean,
    gameErrorCode: GameRuleErrorCode | null,
  ): ServerMessage {
    const visibleStateVersion = match !== null && viewer !== null ? match.stateVersion : 0;
    const base = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'COMMAND_REJECTED' as const,
      serverTimeMs: this.#now(),
      matchId: command.matchId,
      commandId: command.commandId,
      stateVersion: visibleStateVersion,
      code,
      retryable,
      gameErrorCode,
    };

    if (match === null || viewer === null) return commandRejectedMessageSchema.parse(base);
    return commandRejectedMessageSchema.parse({
      ...base,
      snapshot: this.#snapshot(match, viewer),
    });
  }

  #validateOutboundSnapshots(match: AuthoritativeMatch): void {
    this.#snapshot(match, 'A');
    this.#snapshot(match, 'B');
  }
}
