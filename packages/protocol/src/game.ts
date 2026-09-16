import { z } from 'zod';
import {
  GAME_STATE_SCHEMA_VERSION,
  PLAYER_SEATS,
  SUITS,
  type CardFace,
  type GameAction,
  type GameResult,
  type PlayerView,
} from '@caravan/game-engine';

export const playerSeatSchema = z.enum(PLAYER_SEATS);
export const suitSchema = z.enum(SUITS);
export const routeIndexSchema = z.union([z.literal(0), z.literal(1), z.literal(2)]);
export const directionSchema = z.enum(['ASCENDING', 'DESCENDING']);
export const routeStatusSchema = z.enum(['LIGHT', 'IN_RANGE', 'OVERLOADED']);
export const matchPhaseSchema = z.enum(['OPENING', 'PLAYING', 'FINISHED']);

const valueRankSchema = z.union([
  z.literal('ACE'),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
  z.literal(7),
  z.literal(8),
  z.literal(9),
  z.literal(10),
]);

const suitedModifierRankSchema = z.enum(['JACK', 'QUEEN', 'KING']);

export const cardFaceSchema: z.ZodType<CardFace> = z.union([
  z
    .object({
      rank: z.union([valueRankSchema, suitedModifierRankSchema]),
      suit: suitSchema,
    })
    .strict(),
  z
    .object({
      rank: z.literal('JOKER'),
      suit: z.null(),
    })
    .strict(),
]);

export const publicCardSchema = z
  .object({
    id: z.string().min(1),
    owner: playerSeatSchema,
    face: cardFaceSchema,
  })
  .strict();

export const gameActionSchema: z.ZodType<GameAction> = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('PLAY_VALUE_CARD'),
      cardId: z.string().min(1),
      route: routeIndexSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('PLAY_MODIFIER_CARD'),
      cardId: z.string().min(1),
      targetPlayer: playerSeatSchema,
      route: routeIndexSchema,
      targetCardId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('DISCARD_HAND_CARD'),
      cardId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal('DISBAND_ROUTE'),
      route: routeIndexSchema,
    })
    .strict(),
]);

export const ruleGameResultSchema: z.ZodType<GameResult> = z.discriminatedUnion('reason', [
  z
    .object({
      winner: playerSeatSchema,
      reason: z.literal('ROUTES'),
    })
    .strict(),
  z
    .object({
      winner: playerSeatSchema,
      reason: z.literal('DECK_EXHAUSTION'),
      exhaustedPlayer: playerSeatSchema,
    })
    .strict(),
]);

export const routeCardViewSchema = z
  .object({
    card: publicCardSchema,
    modifiers: z.array(publicCardSchema).max(3),
  })
  .strict();

export const routeViewSchema = z
  .object({
    cards: z.array(routeCardViewSchema),
    direction: directionSchema.nullable(),
    activeSuit: suitSchema.nullable(),
    value: z.number().int().nonnegative(),
    status: routeStatusSchema,
  })
  .strict();

export const playerPublicViewSchema = z
  .object({
    seat: playerSeatSchema,
    handSize: z.number().int().nonnegative(),
    remainingDeckCount: z.number().int().nonnegative(),
    discardPile: z.array(publicCardSchema),
    routes: z.tuple([routeViewSchema, routeViewSchema, routeViewSchema]),
  })
  .strict();

export const playerViewSchema: z.ZodType<PlayerView> = z
  .object({
    schemaVersion: z.literal(GAME_STATE_SCHEMA_VERSION),
    viewer: playerSeatSchema,
    phase: matchPhaseSchema,
    startingPlayer: playerSeatSchema,
    activePlayer: playerSeatSchema,
    hand: z.array(publicCardSchema),
    players: z
      .object({
        A: playerPublicViewSchema,
        B: playerPublicViewSchema,
      })
      .strict(),
    laneOwners: z.tuple([
      playerSeatSchema.nullable(),
      playerSeatSchema.nullable(),
      playerSeatSchema.nullable(),
    ]),
    result: ruleGameResultSchema.nullable(),
    actionSequence: z.number().int().nonnegative(),
    legalActions: z.array(gameActionSchema),
  })
  .strict();

export type WireGameAction = z.infer<typeof gameActionSchema>;
export type WirePlayerView = z.infer<typeof playerViewSchema>;
export type WireRuleGameResult = z.infer<typeof ruleGameResultSchema>;
