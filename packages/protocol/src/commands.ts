import { z } from 'zod';
import { commandIdSchema, matchIdSchema, protocolVersionSchema, stateVersionSchema } from './common.js';
import { gameActionSchema } from './game.js';

const stateChangingEnvelope = {
  protocolVersion: protocolVersionSchema,
  matchId: matchIdSchema,
  commandId: commandIdSchema,
  expectedStateVersion: stateVersionSchema,
};

export const gameplayCommandSchema = z
  .object({
    ...stateChangingEnvelope,
    type: z.literal('GAME_ACTION'),
    action: gameActionSchema,
  })
  .strict();

export const surrenderCommandSchema = z
  .object({
    ...stateChangingEnvelope,
    type: z.literal('SURRENDER'),
  })
  .strict();

export const resyncCommandSchema = z
  .object({
    protocolVersion: protocolVersionSchema,
    matchId: matchIdSchema,
    commandId: commandIdSchema,
    type: z.literal('RESYNC'),
    knownStateVersion: stateVersionSchema.nullable(),
  })
  .strict();

export const clientCommandSchema = z.discriminatedUnion('type', [
  gameplayCommandSchema,
  surrenderCommandSchema,
  resyncCommandSchema,
]);

export type GameplayCommand = z.infer<typeof gameplayCommandSchema>;
export type SurrenderCommand = z.infer<typeof surrenderCommandSchema>;
export type ResyncCommand = z.infer<typeof resyncCommandSchema>;
export type ClientCommand = z.infer<typeof clientCommandSchema>;

export function parseClientCommand(input: unknown): ClientCommand {
  return clientCommandSchema.parse(input);
}
