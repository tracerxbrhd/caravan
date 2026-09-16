import type { MatchSnapshot, WirePlayerView } from '@caravan/protocol';

type Seat = WirePlayerView['viewer'];

export interface ServerClockAnchor {
  readonly serverTimeMs: number;
  readonly clientTimeMs: number;
}

export interface MatchDeadlineNotice {
  readonly key: string;
  readonly label: string;
  readonly deadlineAtMs: number;
  readonly kind: 'TURN' | 'RECONNECT';
  readonly subject: 'YOU' | 'OPPONENT';
}

function opponentOf(seat: Seat): Seat {
  return seat === 'A' ? 'B' : 'A';
}

export function estimatedServerNow(anchor: ServerClockAnchor, clientNowMs: number): number {
  return anchor.serverTimeMs + Math.max(0, clientNowMs - anchor.clientTimeMs);
}

export function remainingDeadlineSeconds(deadlineAtMs: number, serverNowMs: number): number {
  return Math.max(0, Math.ceil((deadlineAtMs - serverNowMs) / 1_000));
}

export function matchDeadlineNotices(snapshot: MatchSnapshot): readonly MatchDeadlineNotice[] {
  if (snapshot.status !== 'ACTIVE') return [];

  const viewer = snapshot.game.viewer;
  const opponent = opponentOf(viewer);
  const notices: MatchDeadlineNotice[] = [];

  if (snapshot.turnDeadlineAtMs !== null) {
    const yours = snapshot.game.activePlayer === viewer;
    notices.push({
      key: 'turn',
      label: yours ? 'Your turn' : 'Opponent turn',
      deadlineAtMs: snapshot.turnDeadlineAtMs,
      kind: 'TURN',
      subject: yours ? 'YOU' : 'OPPONENT',
    });
  }

  for (const seat of [viewer, opponent] as const) {
    const deadlineAtMs = snapshot.reconnectDeadlineAtMs[seat];
    if (snapshot.connected[seat] || deadlineAtMs === null) continue;
    const yours = seat === viewer;
    notices.push({
      key: `reconnect-${seat}`,
      label: yours ? 'Reconnect grace' : 'Opponent reconnect',
      deadlineAtMs,
      kind: 'RECONNECT',
      subject: yours ? 'YOU' : 'OPPONENT',
    });
  }

  return notices.sort((left, right) => left.deadlineAtMs - right.deadlineAtMs);
}
