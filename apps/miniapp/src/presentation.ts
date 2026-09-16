import type { MatchSnapshot } from '@caravan/protocol';

export type MotionPreference = 'SYSTEM' | 'REDUCED';

export interface PresentationPreferences {
  readonly sound: boolean;
  readonly haptics: boolean;
  readonly motion: MotionPreference;
}

export type TableFeedbackCue =
  | 'DRAW'
  | 'PLACE'
  | 'MODIFIER'
  | 'DISCARD'
  | 'REMOVE'
  | 'RESULT';

export const DEFAULT_PRESENTATION_PREFERENCES: PresentationPreferences = {
  sound: true,
  haptics: true,
  motion: 'SYSTEM',
};

const STORAGE_KEY = 'caravan.presentation.v1';

type Seat = MatchSnapshot['game']['viewer'];

function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A';
}

function routeCardIds(snapshot: MatchSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const seat of ['A', 'B'] as const) {
    for (const route of snapshot.game.players[seat].routes) {
      for (const node of route.cards) ids.add(node.card.id);
    }
  }
  return ids;
}

function modifierIds(snapshot: MatchSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const seat of ['A', 'B'] as const) {
    for (const route of snapshot.game.players[seat].routes) {
      for (const node of route.cards) {
        for (const modifier of node.modifiers) ids.add(modifier.id);
      }
    }
  }
  return ids;
}

function discardIds(snapshot: MatchSnapshot): Set<string> {
  return new Set([
    ...snapshot.game.players.A.discardPile.map((card) => card.id),
    ...snapshot.game.players.B.discardPile.map((card) => card.id),
  ]);
}

function addedCount(previous: Set<string>, next: Set<string>): number {
  let count = 0;
  for (const id of next) {
    if (!previous.has(id)) count += 1;
  }
  return count;
}

function removedCount(previous: Set<string>, next: Set<string>): number {
  let count = 0;
  for (const id of previous) {
    if (!next.has(id)) count += 1;
  }
  return count;
}

export function deriveTableFeedbackCue(
  previous: MatchSnapshot | null,
  next: MatchSnapshot,
): TableFeedbackCue | null {
  if (previous === null || previous.matchId !== next.matchId) return null;
  if (previous.stateVersion === next.stateVersion && previous.status === next.status) return null;

  if (previous.status !== 'FINISHED' && next.status === 'FINISHED') return 'RESULT';

  const previousRouteCards = routeCardIds(previous);
  const nextRouteCards = routeCardIds(next);
  const previousModifiers = modifierIds(previous);
  const nextModifiers = modifierIds(next);

  if (removedCount(previousRouteCards, nextRouteCards) > 0) return 'REMOVE';
  if (addedCount(previousModifiers, nextModifiers) > 0) return 'MODIFIER';
  if (addedCount(previousRouteCards, nextRouteCards) > 0) return 'PLACE';

  const previousDiscards = discardIds(previous);
  const nextDiscards = discardIds(next);
  if (addedCount(previousDiscards, nextDiscards) > 0) return 'DISCARD';

  const viewer = next.game.viewer;
  const opponent = opponentOf(viewer);
  const viewerDrew = next.game.hand.some(
    (card) => !previous.game.hand.some((previousCard) => previousCard.id === card.id),
  );
  const opponentDrew =
    next.game.players[opponent].handSize > previous.game.players[opponent].handSize;

  return viewerDrew || opponentDrew ? 'DRAW' : null;
}

export function parsePresentationPreferences(raw: string | null): PresentationPreferences {
  if (raw === null) return DEFAULT_PRESENTATION_PREFERENCES;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_PRESENTATION_PREFERENCES;

    const candidate = parsed as Record<string, unknown>;
    return {
      sound:
        typeof candidate.sound === 'boolean'
          ? candidate.sound
          : DEFAULT_PRESENTATION_PREFERENCES.sound,
      haptics:
        typeof candidate.haptics === 'boolean'
          ? candidate.haptics
          : DEFAULT_PRESENTATION_PREFERENCES.haptics,
      motion:
        candidate.motion === 'REDUCED' || candidate.motion === 'SYSTEM'
          ? candidate.motion
          : DEFAULT_PRESENTATION_PREFERENCES.motion,
    };
  } catch {
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

export function loadPresentationPreferences(): PresentationPreferences {
  if (typeof window === 'undefined') return DEFAULT_PRESENTATION_PREFERENCES;
  try {
    return parsePresentationPreferences(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_PRESENTATION_PREFERENCES;
  }
}

export function savePresentationPreferences(preferences: PresentationPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Presentation preferences are optional. Restricted WebViews may deny storage access.
  }
}

export function shouldReduceMotion(): boolean {
  const preferences = loadPresentationPreferences();
  if (preferences.motion === 'REDUCED') return true;
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

export function cardTransitionName(cardId: string): string {
  const safeId = cardId.replace(/[^A-Za-z0-9_-]/g, '-');
  return `caravan-card-${safeId}`;
}
