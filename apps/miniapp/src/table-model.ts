import type { WireGameAction } from '@caravan/protocol';

export type RouteIndex = 0 | 1 | 2;

export interface ModifierTarget {
  readonly targetPlayer: 'A' | 'B';
  readonly route: RouteIndex;
  readonly targetCardId: string;
}

export interface CardInteraction {
  readonly cardId: string;
  readonly valueRoutes: readonly RouteIndex[];
  readonly modifierTargets: readonly ModifierTarget[];
  readonly canDiscard: boolean;
}

export function selectableCardIds(actions: readonly WireGameAction[]): readonly string[] {
  return [...new Set(actions.flatMap((action) => ('cardId' in action ? [action.cardId] : [])))];
}

export function cardInteraction(
  actions: readonly WireGameAction[],
  cardId: string,
): CardInteraction {
  const valueRoutes: RouteIndex[] = [];
  const modifierTargets: ModifierTarget[] = [];
  let canDiscard = false;

  for (const action of actions) {
    if (!('cardId' in action) || action.cardId !== cardId) continue;

    if (action.type === 'PLAY_VALUE_CARD') {
      valueRoutes.push(action.route);
      continue;
    }

    if (action.type === 'PLAY_MODIFIER_CARD') {
      modifierTargets.push({
        targetPlayer: action.targetPlayer,
        route: action.route,
        targetCardId: action.targetCardId,
      });
      continue;
    }

    if (action.type === 'DISCARD_HAND_CARD') canDiscard = true;
  }

  return { cardId, valueRoutes, modifierTargets, canDiscard };
}

export function valuePlayAction(
  actions: readonly WireGameAction[],
  cardId: string,
  route: RouteIndex,
): WireGameAction | null {
  return (
    actions.find(
      (action) =>
        action.type === 'PLAY_VALUE_CARD' && action.cardId === cardId && action.route === route,
    ) ?? null
  );
}

export function modifierPlayAction(
  actions: readonly WireGameAction[],
  cardId: string,
  targetPlayer: 'A' | 'B',
  route: RouteIndex,
  targetCardId: string,
): WireGameAction | null {
  return (
    actions.find(
      (action) =>
        action.type === 'PLAY_MODIFIER_CARD' &&
        action.cardId === cardId &&
        action.targetPlayer === targetPlayer &&
        action.route === route &&
        action.targetCardId === targetCardId,
    ) ?? null
  );
}

export function discardAction(
  actions: readonly WireGameAction[],
  cardId: string,
): WireGameAction | null {
  return (
    actions.find((action) => action.type === 'DISCARD_HAND_CARD' && action.cardId === cardId) ??
    null
  );
}

export function disbandAction(
  actions: readonly WireGameAction[],
  route: RouteIndex,
): WireGameAction | null {
  return (
    actions.find((action) => action.type === 'DISBAND_ROUTE' && action.route === route) ?? null
  );
}

export function isModifierTarget(
  interaction: CardInteraction | null,
  targetPlayer: 'A' | 'B',
  route: RouteIndex,
  targetCardId: string,
): boolean {
  return (
    interaction?.modifierTargets.some(
      (target) =>
        target.targetPlayer === targetPlayer &&
        target.route === route &&
        target.targetCardId === targetCardId,
    ) ?? false
  );
}
