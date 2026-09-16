export type GameRuleErrorCode =
  | 'INVALID_INITIAL_STATE'
  | 'INVALID_GAME_STATE'
  | 'GAME_FINISHED'
  | 'NOT_ACTIVE_PLAYER'
  | 'CARD_NOT_IN_HAND'
  | 'WRONG_PHASE'
  | 'INVALID_ROUTE'
  | 'INVALID_CARD_TYPE'
  | 'ROUTE_NOT_EMPTY'
  | 'ILLEGAL_VALUE_PLAY'
  | 'INVALID_MODIFIER_TARGET'
  | 'MODIFIER_LIMIT_REACHED'
  | 'QUEEN_REQUIRES_TERMINAL'
  | 'EMPTY_ROUTE';

export class GameRuleError extends Error {
  public readonly code: GameRuleErrorCode;

  public constructor(code: GameRuleErrorCode, message: string) {
    super(message);
    this.name = 'GameRuleError';
    this.code = code;
  }
}

export function ruleError(code: GameRuleErrorCode, message: string): never {
  throw new GameRuleError(code, message);
}
