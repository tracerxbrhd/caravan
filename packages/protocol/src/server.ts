import { GAME_RULE_ERROR_CODES } from '@caravan/game-engine';
import { z } from 'zod';
import {
  commandIdSchema,
  matchIdSchema,
  protocolVersionSchema,
  serverTimeMsSchema,
  stateVersionSchema,
} from './common.js';
import { playerSeatSchema, playerViewSchema } from './game.js';

export const matchFinishResultSchema = z
  .discriminatedUnion('reason', [
    z
      .object({
        reason: z.literal('ROUTES'),
        winner: playerSeatSchema,
      })
      .strict(),
    z
      .object({
        reason: z.literal('DECK_EXHAUSTION'),
        winner: playerSeatSchema,
        loser: playerSeatSchema,
      })
      .strict(),
    z
      .object({
        reason: z.literal('SURRENDER'),
        winner: playerSeatSchema,
        loser: playerSeatSchema,
      })
      .strict(),
    z
      .object({
        reason: z.literal('TIMEOUT'),
        winner: playerSeatSchema,
        loser: playerSeatSchema,
      })
      .strict(),
    z
      .object({
        reason: z.literal('NO_CONTEST'),
        winner: z.null(),
      })
      .strict(),
  ])
  .superRefine((result, context) => {
    if ('loser' in result && result.winner === result.loser) {
      context.addIssue({
        code: 'custom',
        path: ['loser'],
        message: 'Winner and loser must be different seats.',
      });
    }
  });

export const matchSnapshotSchema = z
  .object({
    matchId: matchIdSchema,
    stateVersion: stateVersionSchema,
    status: z.enum(['ACTIVE', 'FINISHED']),
    game: playerViewSchema,
    connected: z
      .object({
        A: z.boolean(),
        B: z.boolean(),
      })
      .strict(),
    turnDeadlineAtMs: serverTimeMsSchema.nullable(),
    reconnectDeadlineAtMs: z
      .object({
        A: serverTimeMsSchema.nullable(),
        B: serverTimeMsSchema.nullable(),
      })
      .strict(),
    result: matchFinishResultSchema.nullable(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    if (snapshot.status === 'ACTIVE') {
      if (snapshot.result !== null) {
        context.addIssue({
          code: 'custom',
          path: ['result'],
          message: 'An active match cannot have a finalized match result.',
        });
      }
      if (snapshot.game.phase === 'FINISHED' || snapshot.game.result !== null) {
        context.addIssue({
          code: 'custom',
          path: ['game'],
          message: 'An active match cannot contain a finished game projection.',
        });
      }
      return;
    }

    if (snapshot.result === null) {
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'A finished match requires a finalized match result.',
      });
      return;
    }

    if (snapshot.result.reason === 'ROUTES') {
      if (
        snapshot.game.phase !== 'FINISHED' ||
        snapshot.game.result?.reason !== 'ROUTES' ||
        snapshot.game.result.winner !== snapshot.result.winner
      ) {
        context.addIssue({
          code: 'custom',
          path: ['game', 'result'],
          message: 'Route-finished match result must agree with the rule-engine projection.',
        });
      }
      return;
    }

    if (snapshot.result.reason === 'DECK_EXHAUSTION') {
      if (
        snapshot.game.phase !== 'FINISHED' ||
        snapshot.game.result?.reason !== 'DECK_EXHAUSTION' ||
        snapshot.game.result.winner !== snapshot.result.winner ||
        snapshot.game.result.exhaustedPlayer !== snapshot.result.loser
      ) {
        context.addIssue({
          code: 'custom',
          path: ['game', 'result'],
          message: 'Deck-exhaustion match result must agree with the rule-engine projection.',
        });
      }
      return;
    }

    if (snapshot.game.phase === 'FINISHED' || snapshot.game.result !== null) {
      context.addIssue({
        code: 'custom',
        path: ['game'],
        message: 'Server-lifecycle finishes must not coexist with a rule-engine finish.',
      });
    }
  });

export const commandRejectionCodeSchema = z.enum([
  'UNAUTHENTICATED',
  'INVALID_COMMAND',
  'MATCH_NOT_FOUND',
  'NOT_MATCH_PLAYER',
  'MATCH_FINISHED',
  'STALE_STATE_VERSION',
  'DUPLICATE_COMMAND',
  'NOT_ACTIVE_PLAYER',
  'ILLEGAL_ACTION',
  'DEADLINE_EXPIRED',
  'INTERNAL_ERROR',
]);

export const gameRuleErrorCodeSchema = z.enum(GAME_RULE_ERROR_CODES);

export const snapshotMessageSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    type: z.literal('SNAPSHOT'),
    serverTimeMs: serverTimeMsSchema,
    commandId: commandIdSchema.nullable(),
    snapshot: matchSnapshotSchema,
  })
  .strict();

export const commandRejectedMessageSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    type: z.literal('COMMAND_REJECTED'),
    serverTimeMs: serverTimeMsSchema,
    matchId: matchIdSchema,
    commandId: commandIdSchema,
    stateVersion: stateVersionSchema,
    code: commandRejectionCodeSchema,
    retryable: z.boolean(),
    gameErrorCode: gameRuleErrorCodeSchema.nullable(),
    snapshot: matchSnapshotSchema.optional(),
  })
  .strict()
  .superRefine((message, context) => {
    if (message.snapshot === undefined) return;
    if (message.snapshot.matchId !== message.matchId) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'matchId'],
        message: 'Rejection snapshot must belong to the rejected command match.',
      });
    }
    if (message.snapshot.stateVersion !== message.stateVersion) {
      context.addIssue({
        code: 'custom',
        path: ['snapshot', 'stateVersion'],
        message: 'Rejection snapshot must use the advertised authoritative state version.',
      });
    }
  });

export const protocolErrorMessageSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    type: z.literal('PROTOCOL_ERROR'),
    serverTimeMs: serverTimeMsSchema,
    code: z.enum(['INVALID_MESSAGE', 'UNSUPPORTED_PROTOCOL_VERSION']),
  })
  .strict();

export const serverMessageSchema = z.discriminatedUnion('type', [
  snapshotMessageSchema,
  commandRejectedMessageSchema,
  protocolErrorMessageSchema,
]);

export type MatchFinishResult = z.infer<typeof matchFinishResultSchema>;
export type MatchSnapshot = z.infer<typeof matchSnapshotSchema>;
export type CommandRejectionCode = z.infer<typeof commandRejectionCodeSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;

export function parseServerMessage(input: unknown): ServerMessage {
  return serverMessageSchema.parse(input);
}
