import type { CommandRejectionCode, MatchId, MatchSnapshot } from '@caravan/protocol';
import { useEffect, useRef, useState } from 'react';
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
  if (code === 'STALE_STATE_VERSION') return 'Match state refreshed from the server.';
  return 'The server rejected the last match command.';
}

export function MatchSession({ matchId, onExit }: { matchId: MatchId; onExit(): void }) {
  const [connectionState, setConnectionState] = useState<MatchConnectionState>('CONNECTING');
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const realtime = useRef<MatchRealtimeConnection | null>(null);

  useEffect(() => {
    const connection = connectMatch(matchId, {
      onConnectionState: setConnectionState,
      onSnapshot: (next) => {
        setSnapshot(next);
        setRejection(null);
      },
      onRejected: (code) => setRejection(rejectionLabel(code)),
      onProtocolError: () => setRejection('Realtime data could not be validated. Reconnecting…'),
    });
    realtime.current = connection;
    return () => {
      realtime.current = null;
      connection.close();
    };
  }, [matchId]);

  const game = snapshot?.game;
  const viewer = game?.viewer;
  const opponent = viewer === 'A' ? 'B' : 'A';

  return (
    <main className="shell">
      <section className="match-shell" aria-labelledby="match-title">
        <header className="match-header">
          <div>
            <p className="eyebrow">Authoritative match</p>
            <h1 id="match-title">CARAVAN</h1>
          </div>
          <span className={`connection-pill connection-pill--${connectionState.toLowerCase()}`}>
            {connectionLabel(connectionState)}
          </span>
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
            <section className="panel match-summary">
              <div>
                <span className="section-kicker">State version</span>
                <strong>{snapshot.stateVersion}</strong>
              </div>
              <div>
                <span className="section-kicker">Phase</span>
                <strong>{game?.phase ?? '—'}</strong>
              </div>
              <div>
                <span className="section-kicker">Turn</span>
                <strong>{game?.activePlayer === viewer ? 'Yours' : 'Opponent'}</strong>
              </div>
            </section>

            {game !== undefined && viewer !== undefined && opponent !== undefined && (
              <section className="lane-grid" aria-label="Current route values">
                {[0, 1, 2].map((route) => (
                  <article className="lane-card" key={route}>
                    <span className="lane-card__name">Route {route + 1}</span>
                    <div className="lane-values">
                      <span>
                        <small>You</small>
                        {game.players[viewer].routes[route as 0 | 1 | 2].value}
                      </span>
                      <span className="lane-vs">vs</span>
                      <span>
                        <small>Rival</small>
                        {game.players[opponent].routes[route as 0 | 1 | 2].value}
                      </span>
                    </div>
                  </article>
                ))}
              </section>
            )}

            <section className="panel transport-note">
              <h2>
                {snapshot.status === 'FINISHED' ? 'Match finished' : 'Table transport is live'}
              </h2>
              <p className="muted">
                {snapshot.status === 'FINISHED'
                  ? `Result: ${snapshot.result?.reason ?? 'complete'}.`
                  : 'This PR stops at the authoritative snapshot boundary. Card interaction and tactile table presentation are the next focused layer.'}
              </p>
              {rejection !== null && <p className="notice notice--warn">{rejection}</p>}
              {rejection?.includes('Another window') === true && (
                <button className="button" onClick={() => realtime.current?.requestControl()}>
                  Take control here
                </button>
              )}
              {snapshot.status === 'FINISHED' && (
                <button className="button button--primary" onClick={onExit}>
                  Return to Play
                </button>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
