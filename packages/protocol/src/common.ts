import { z } from 'zod';

export const PROTOCOL_VERSION = 1 as const;

export const protocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const matchIdSchema = z.uuid();
export const commandIdSchema = z.uuid();
export const stateVersionSchema = z.number().int().nonnegative();
export const serverTimeMsSchema = z.number().int().nonnegative();

export type MatchId = z.infer<typeof matchIdSchema>;
export type CommandId = z.infer<typeof commandIdSchema>;
export type StateVersion = z.infer<typeof stateVersionSchema>;
