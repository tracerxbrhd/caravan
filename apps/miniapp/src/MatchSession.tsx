import type {
  CommandRejectionCode,
  MatchId,
  MatchSnapshot,
  WireGameAction,
} from '@caravan/protocol';
import { useEffect, useRef, useState } from 'react';
import { CardTable } from './CardTable.js';
import {
  connectMatch,
  type MatchConnectionState,
  type MatchRealtimeConnection,
} from './realtime.js';

function connectionLabel(state: MatchConnectionState): string {
  switch (state) {
    case 'ONLINE':
      return 'Connected';
    case 'RECONNECTING':
      return 'Reconnecting…';
    case 'STOPPED':
      return 'Closed';
    default:
      return 'Connecting…';
  }
}

function rejectionLabel(code: CommandRejectionCode): string {
  if (code === 'CONNECTION_NOT_OWNER') return 'Another window took match control.';
  if (code === 'MATCH_NOT_READY') return 'Waiting for the opponent to connect.';
  if (code === 'STALE_STATE_VERSION') return 'The table changed. Fresh server state restored.';
  if (code === 'ILLEGAL_ACTION') return 'That move is no longer legal. Choose again.';
  if (code === 'DEADLINE_EXPIRED') return 'The server deadline expired before that move arrived.';
  return 'The server rejected the last match command.';
}

export function MatchSession({ matchId, onExit }: { matchId: MatchId; onExit(): void }) {
  const [connectionState, setConnectionState] = useState<MatchConnectionState>('CONNECTING');
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const realtime = useRef<MatchRealtimeConnection | null>(null);

  useEffect(() => {
    const connection = connectMatch(matchId, {
      onConnectionState: (state) => {
        setConnectionState(state);
        if (state !== 'ONLINE') setPending(false);
      },
      onSnapshot: (next) => {
        setSnapshot(next);
        setPending(false);
        setRejection(null);
      },
      onRejected: (code) => {
        setPending(false);
        setRejection(rejectionLabel(code));
      },
      onProtocolError: () => {
        setPending(false);
        setRejection('Realtime data could not be validated. Reconnecting…');
      },
    });
    realtime.current = connection;
    return () => {
      realtime.current = null;
      connection.close();
    };
  }, [matchId]);

  const submitAction = (action: WireGameAction): boolean => {
    if (pending) return false;
    const sent = realtime.current?.sendAction(action) ?? false;
    if (sent) {
      setPending(true);
      setRejection(null);
    } else {
      setRejection('The match connection is not ready for a move yet.');
    }
    return sent;
  };

  const surrender = (): boolean => {
    if (pending) return false;
    const sent = realtime.current?.surrender() ?? false;
    if (sent) {
      setPending(true);
      setRejection(null);
    } else {
      setRejection('The match connection is not ready to surrender yet.');
    }
    return sent;
  };

  return (
    <main className="shell shell--match">
      <section className="match-shell" aria-labelledby="match-title">
        <header className="match-header match-header--table">
          <div>
            <p className="eyebrow">Live table</p>
            <h1 id="match-title">CARAVAN</h1>
          </div>
          <div className="match-header__status">
            {snapshot !== null && (
              <span className="state-version" title="Authoritative state version">
                v{snapshot.stateVersion}
              </span>
            )}
            <span className={`connection-pill connection-pill--${connectionState.toLowerCase()}`}>
              {connectionLabel(connectionState)}
            </span>
          </div>
        </header>

        {snapshot === null ? (
          <section className="panel match-loading">
            <div className="route-spinner" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2>Securing the table</h2>
            <p className="muted">Requesting a fresh player-safe snapshot from the server.</p>
          </section>
        ) : (
          <>
            <CardTable
              snapshot={snapshot}
              connectionReady={connectionState === 'ONLINE'}
              pending={pending}
              rejection={rejection}
              onAction={submitAction}
              onSurrender={surrender}
            />

            {rejection?.includes('Another window') === true && (
              <section className="panel control-recovery">
                <p>{rejection}</p>
                <button className="button" onClick={() => realtime.current?.requestControl()}>
                  Take control here
                </button>
              </section>
            )}

            {snapshot.status === 'FINISHED' && (
              <section className="panel match-result">
                <span className="section-kicker">Final result</span>
                <h2>
                  {snapshot.result?.winner === null
                    ? 'No contest'
                    : snapshot.result?.winner === snapshot.game.viewer
                      ? 'You won the route.'
                      : 'Opponent won the route.'}
                </h2>
                <p className="muted">Finish reason: {snapshot.result?.reason ?? 'complete'}.</p>
                <button className="button button--primary" onClick={onExit}>
                  Return to Play
                </button>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
