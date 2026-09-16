import type {
  CommandRejectionCode,
  MatchId,
  MatchSnapshot,
  RematchStatus,
  WireGameAction,
} from '@caravan/protocol';
import { useEffect, useRef, useState } from 'react';
import { ApiError, cancelRematch, rematchStatus, requestRematch } from './api.js';
import { CardTable } from './CardTable.js';
import { MatchResult } from './MatchResult.js';
import {
  connectMatch,
  type MatchConnectionState,
  type MatchRealtimeConnection,
} from './realtime.js';
import { RulesGuide } from './RulesGuide.js';

const IDLE_REMATCH: RematchStatus = { status: 'IDLE' };

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

function rematchErrorLabel(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'REMATCH_UNAVAILABLE') {
      return 'This opponent is no longer available for a rematch.';
    }
    if (error.code === 'REMATCH_NOT_ALLOWED') return 'This match cannot be replayed yet.';
    if (error.code === 'MATCH_NOT_FOUND') return 'The finished match could not be restored.';
  }
  return 'CARAVAN could not update the rematch request.';
}

export function MatchSession({
  matchId,
  onExit,
  onRematch,
}: {
  matchId: MatchId;
  onExit(): void;
  onRematch(matchId: MatchId): void;
}) {
  const [connectionState, setConnectionState] = useState<MatchConnectionState>('CONNECTING');
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [rejection, setRejection] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [rematch, setRematch] = useState<RematchStatus>(IDLE_REMATCH);
  const [rematchBusy, setRematchBusy] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const realtime = useRef<MatchRealtimeConnection | null>(null);
  const onRematchRef = useRef(onRematch);
  onRematchRef.current = onRematch;

  useEffect(() => {
    setSnapshot(null);
    setRematch(IDLE_REMATCH);
    setRematchError(null);
    setRematchBusy(false);
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

  useEffect(() => {
    if (snapshot?.status !== 'FINISHED') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async (): Promise<void> => {
      try {
        const status = await rematchStatus(matchId);
        if (!active) return;
        setRematch(status);
        setRematchError(null);
        if (status.status === 'MATCH_FOUND') {
          onRematchRef.current(status.matchId);
          return;
        }
        timer = setTimeout(() => void poll(), 2_000);
      } catch (error) {
        if (!active) return;
        setRematchError(rematchErrorLabel(error));
        timer = setTimeout(() => void poll(), 4_000);
      }
    };

    void poll();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [matchId, snapshot?.status]);

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

  const askForRematch = (): void => {
    if (rematchBusy || rematch.status === 'MATCH_FOUND') return;
    setRematchBusy(true);
    setRematchError(null);
    void requestRematch(matchId)
      .then((status) => {
        setRematch(status);
        if (status.status === 'MATCH_FOUND') onRematchRef.current(status.matchId);
      })
      .catch((error: unknown) => setRematchError(rematchErrorLabel(error)))
      .finally(() => setRematchBusy(false));
  };

  const leaveMatch = (): void => {
    if (snapshot?.status === 'FINISHED') {
      void cancelRematch(matchId).catch(() => undefined);
    }
    onExit();
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
            <button
              type="button"
              className="button button--quiet rules-help-button"
              onClick={() => setRulesOpen(true)}
            >
              How to play
            </button>
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
              <MatchResult
                snapshot={snapshot}
                rematch={rematch}
                rematchBusy={rematchBusy}
                rematchError={rematchError}
                onRematch={askForRematch}
                onExit={leaveMatch}
              />
            )}
          </>
        )}
      </section>

      {rulesOpen && <RulesGuide onClose={() => setRulesOpen(false)} />}
    </main>
  );
}
