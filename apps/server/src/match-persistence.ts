import {
  GAME_STATE_SCHEMA_VERSION,
  assertGameState,
  type AuthoritativeMatch as NeverAuthoritativeMatch,
  type CaravanGameState,
} from '@caravan/game-engine';
import {
  cardFaceSchema,
  commandIdSchema,
  directionSchema,
  matchFinishResultSchema,
  matchIdSchema,
  matchPhaseSchema,
  playerSeatSchema,
  ruleGameResultSchema,
  serverTimeMsSchema,
  stateVersionSchema,
} from '@caravan/protocol';
import { z } from 'zod';
import type { AuthoritativeMatch } from './match-types.js';

void (undefined as unknown as NeverAuthoritativeMatch);

export const MATCH_PERSISTENCE_SCHEMA_VERSION = 1 as const;

const nonEmptyIdSchema = z.string().min(1);

const cardInstanceSchema = z
  .object({
    id: nonEmptyIdSchema,
    owner: playerSeatSchema,
    deckCardId: nonEmptyIdSchema,
    face: cardFaceSchema,
    sourceSetId: nonEmptyIdSchema,
  })
  .strict();

const modifierAttachmentSchema = z
  .object({
    cardId: nonEmptyIdSchema,
    playedSequence: z.number().int().positive(),
  })
  .strict();

const routeCardSchema = z
  .object({
    cardId: nonEmptyIdSchema,
    modifiers: z.array(modifierAttachmentSchema).max(3),
  })
  .strict();

const routeStateSchema = z
  .object({
    cards: z.array(routeCardSchema),
    direction: directionSchema.nullable(),
  })
  .strict();

const playerGameStateSchema = z
  .object({
    seat: playerSeatSchema,
    drawPile: z.array(nonEmptyIdSchema),
    hand: z.array(nonEmptyIdSchema),
    discardPile: z.array(nonEmptyIdSchema),
    routes: z.tuple([routeStateSchema, routeStateSchema, routeStateSchema]),
  })
  .strict();

const gameStateSchema: z.ZodType<CaravanGameState> = z
  .object({
    schemaVersion: z.literal(GAME_STATE_SCHEMA_VERSION),
    phase: matchPhaseSchema,
    startingPlayer: playerSeatSchema,
    activePlayer: playerSeatSchema,
    cards: z
      .object({
        byId: z.record(nonEmptyIdSchema, cardInstanceSchema),
      })
      .strict(),
    players: z
      .object({
        A: playerGameStateSchema,
        B: playerGameStateSchema,
      })
      .strict(),
    openingPlacements: z
      .object({
        A: z.number().int().min(0).max(3),
        B: z.number().int().min(0).max(3),
      })
      .strict(),
    result: ruleGameResultSchema.nullable(),
    actionSequence: z.number().int().nonnegative(),
  })
  .strict();

const processedCommandRecordSchema = z
  .object({
    accountId: nonEmptyIdSchema,
    commandId: commandIdSchema,
    fingerprint: z.string().min(1),
    acceptedStateVersion: stateVersionSchema,
  })
  .strict();

export const authoritativeMatchPersistenceSchema: z.ZodType<AuthoritativeMatch> = z
  .object({
    id: matchIdSchema,
    stateVersion: stateVersionSchema,
    status: z.enum(['ACTIVE', 'FINISHED']),
    participants: z
      .object({
        A: nonEmptyIdSchema,
        B: nonEmptyIdSchema,
      })
      .strict(),
    game: gameStateSchema,
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
    processedCommands: z.array(processedCommandRecordSchema),
  })
  .strict()
  .superRefine((match, context) => {
    if (match.participants.A === match.participants.B) {
      context.addIssue({
        code: 'custom',
        path: ['participants'],
        message: 'A persisted match cannot contain the same account in both seats.',
      });
    }

    if (match.status === 'ACTIVE') {
      if (match.result !== null || match.game.phase === 'FINISHED' || match.game.result !== null) {
        context.addIssue({
          code: 'custom',
          path: ['status'],
          message: 'An active persisted match cannot contain a finalized result.',
        });
      }
    } else if (match.result === null) {
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'A finished persisted match requires a result.',
      });
    } else if (match.result.reason === 'ROUTES') {
      if (
        match.game.phase !== 'FINISHED' ||
        match.game.result?.reason !== 'ROUTES' ||
        match.game.result.winner !== match.result.winner
      ) {
        context.addIssue({
          code: 'custom',
          path: ['game', 'result'],
          message: 'Persisted route result must agree with the engine result.',
        });
      }
    } else if (match.result.reason === 'DECK_EXHAUSTION') {
      if (
        match.game.phase !== 'FINISHED' ||
        match.game.result?.reason !== 'DECK_EXHAUSTION' ||
        match.game.result.winner !== match.result.winner ||
        match.game.result.exhaustedPlayer !== match.result.loser
      ) {
        context.addIssue({
          code: 'custom',
          path: ['game', 'result'],
          message: 'Persisted deck-exhaustion result must agree with the engine result.',
        });
      }
    } else if (match.game.phase === 'FINISHED' || match.game.result !== null) {
      context.addIssue({
        code: 'custom',
        path: ['game'],
        message: 'Lifecycle finalization cannot coexist with a rule-engine result.',
      });
    }

    const seenCommands = new Set<string>();
    const participants = new Set([match.participants.A, match.participants.B]);
    for (const [index, record] of match.processedCommands.entries()) {
      if (!participants.has(record.accountId)) {
        context.addIssue({
          code: 'custom',
          path: ['processedCommands', index, 'accountId'],
          message: 'Processed command account must be a match participant.',
        });
      }
      if (
        record.acceptedStateVersion <= 0 ||
        record.acceptedStateVersion > match.stateVersion
      ) {
        context.addIssue({
          code: 'custom',
          path: ['processedCommands', index, 'acceptedStateVersion'],
          message: 'Processed command version must belong to persisted match history.',
        });
      }
      const key = `${record.accountId}:${record.commandId}`;
      if (seenCommands.has(key)) {
        context.addIssue({
          code: 'custom',
          path: ['processedCommands', index, 'commandId'],
          message: 'Processed command identity must be unique per account.',
        });
      }
      seenCommands.add(key);
    }
  });

const persistedMatchEnvelopeSchema = z
  .object({
    persistenceSchemaVersion: z.literal(MATCH_PERSISTENCE_SCHEMA_VERSION),
    match: authoritativeMatchPersistenceSchema,
  })
  .strict();

export type PersistedMatchEnvelope = z.infer<typeof persistedMatchEnvelopeSchema>;

export function serializePersistedMatch(match: AuthoritativeMatch): PersistedMatchEnvelope {
  assertGameState(match.game);
  return persistedMatchEnvelopeSchema.parse({
    persistenceSchemaVersion: MATCH_PERSISTENCE_SCHEMA_VERSION,
    match,
  });
}

export interface PersistedMatchRowMetadata {
  readonly id: string;
  readonly stateVersion: number;
  readonly status: AuthoritativeMatch['status'];
  readonly persistenceSchemaVersion: number;
}

export function parsePersistedMatch(
  payload: unknown,
  metadata: PersistedMatchRowMetadata,
): AuthoritativeMatch {
  if (metadata.persistenceSchemaVersion !== MATCH_PERSISTENCE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported match persistence schema version ${metadata.persistenceSchemaVersion}.`,
    );
  }

  const envelope = persistedMatchEnvelopeSchema.parse(payload);
  const match = envelope.match;
  if (match.id !== metadata.id) throw new Error('Persisted match id does not match its database row.');
  if (match.stateVersion !== metadata.stateVersion) {
    throw new Error('Persisted match stateVersion does not match its database row.');
  }
  if (match.status !== metadata.status) {
    throw new Error('Persisted match status does not match its database row.');
  }

  assertGameState(match.game);
  return match;
}
