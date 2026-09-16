import type {
  ChallengeId,
  ChallengeView,
  InviteToken,
  LaunchContext,
  MatchId,
} from '@caravan/protocol';
import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  acceptChallenge,
  cancelChallenge,
  challengeStatus,
  createChallenge,
  declineChallenge,
  heartbeatMatchmaking,
  joinMatchmaking,
  leaveMatchmaking,
  matchmakingStatus,
  type AccountProfile,
} from './api.js';
import { MatchSession } from './MatchSession.js';
import { platform } from './platform.js';

type FlowState =
  | { kind: 'HOME'; notice?: string }
  | { kind: 'INBOUND_CHALLENGE'; inviteToken: InviteToken }
  | { kind: 'QUEUE'; leaseExpiresAtMs: number }
  | {
      kind: 'OUTBOUND_CHALLENGE';
      challenge: ChallengeView;
      inviteToken: InviteToken;
      inviteUrl: string | null;
    }
  | { kind: 'MATCH'; matchId: MatchId }
  | { kind: 'ERROR'; message: string };

function initialFlow(launchContext: LaunchContext): FlowState {
  if (launchContext.kind === 'CHALLENGE') {
    return { kind: 'INBOUND_CHALLENGE', inviteToken: launchContext.inviteToken };
  }
  if (launchContext.kind === 'INVALID') {
    return { kind: 'HOME', notice: 'This invitation link is not valid.' };
  }
  return { kind: 'HOME' };
}

function friendlyError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'CARAVAN could not complete that request.';
  switch (error.code) {
    case 'CHALLENGE_EXPIRED':
      return 'That challenge has expired.';
    case 'CHALLENGE_NOT_FOUND':
      return 'That challenge is no longer available.';
    case 'ACTIVE_MATCH_CONFLICT':
      return 'You already have an active match.';
    case 'CHALLENGE_UNAVAILABLE':
      return 'That challenge can no longer be accepted.';
    case 'UNAUTHENTICATED':
      return 'Your session expired. Reopen CARAVAN from Telegram.';
    default:
      return 'CARAVAN could not complete that request.';
  }
}

export function Play({
  account,
  launchContext,
}: {
  account: AccountProfile;
  launchContext: LaunchContext;
}) {
  const [flow, setFlow] = useState<FlowState>(() => initialFlow(launchContext));
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recoveryChecked, setRecoveryChecked] = useState(false);

  useEffect(() => {
    if (recoveryChecked || flow.kind !== 'HOME' || launchContext.kind === 'CHALLENGE') return;
    let active = true;
    void matchmakingStatus()
      .then((status) => {
        if (!active) return;
        if (status.status === 'MATCH_FOUND') setFlow({ kind: 'MATCH', matchId: status.matchId });
        else if (status.status === 'QUEUED') {
          setFlow({ kind: 'QUEUE', leaseExpiresAtMs: status.leaseExpiresAtMs });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setRecoveryChecked(true);
      });
    return () => {
      active = false;
    };
  }, [flow.kind, launchContext.kind, recoveryChecked]);

  useEffect(() => {
    if (flow.kind !== 'QUEUE') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const heartbeat = async (): Promise<void> => {
      try {
        const status = await heartbeatMatchmaking();
        if (!active) return;
        if (status.status === 'MATCH_FOUND') {
          setFlow({ kind: 'MATCH', matchId: status.matchId });
          return;
        }
        if (status.status === 'QUEUED') {
          setFlow({ kind: 'QUEUE', leaseExpiresAtMs: status.leaseExpiresAtMs });
          const remaining = Math.max(10_000, status.leaseExpiresAtMs - Date.now());
          timer = setTimeout(() => void heartbeat(), Math.min(30_000, Math.floor(remaining / 2)));
          return;
        }
        setFlow({ kind: 'HOME', notice: 'Matchmaking ended. You can queue again.' });
      } catch {
        if (active) timer = setTimeout(() => void heartbeat(), 5_000);
      }
    };

    timer = setTimeout(() => void heartbeat(), 15_000);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [flow.kind]);

  useEffect(() => {
    if (flow.kind !== 'OUTBOUND_CHALLENGE') return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const id = flow.challenge.id;

    const poll = async (): Promise<void> => {
      try {
        const challenge = await challengeStatus(id);
        if (!active) return;
        if (challenge.status === 'ACCEPTED' && challenge.matchId !== null) {
          setFlow({ kind: 'MATCH', matchId: challenge.matchId });
          return;
        }
        if (challenge.status !== 'PENDING') {
          setFlow({ kind: 'HOME', notice: `Challenge ${challenge.status.toLowerCase()}.` });
          return;
        }
        timer = setTimeout(() => void poll(), 2_000);
      } catch {
        if (active) timer = setTimeout(() => void poll(), 4_000);
      }
    };

    timer = setTimeout(() => void poll(), 2_000);
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [flow.kind, flow.kind === 'OUTBOUND_CHALLENGE' ? flow.challenge.id : null]);

  const opponentCopy = useMemo(() => {
    if (flow.kind !== 'OUTBOUND_CHALLENGE') return null;
    return flow.inviteUrl;
  }, [flow]);

  if (flow.kind === 'MATCH') {
    return <MatchSession matchId={flow.matchId} onExit={() => setFlow({ kind: 'HOME' })} />;
  }

  const run = async (operation: () => Promise<void>): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (error) {
      setFlow({ kind: 'ERROR', message: friendlyError(error) });
    } finally {
      setBusy(false);
    }
  };

  const joinCasual = (): void => {
    void run(async () => {
      const status = await joinMatchmaking();
      if (status.status === 'MATCH_FOUND') setFlow({ kind: 'MATCH', matchId: status.matchId });
      else if (status.status === 'QUEUED') {
        setFlow({ kind: 'QUEUE', leaseExpiresAtMs: status.leaseExpiresAtMs });
      } else setFlow({ kind: 'HOME' });
    });
  };

  const makeChallenge = (): void => {
    void run(async () => {
      const created = await createChallenge();
      setCopied(false);
      setFlow({
        kind: 'OUTBOUND_CHALLENGE',
        challenge: created.challenge,
        inviteToken: created.inviteToken,
        inviteUrl: platform.challengeInviteUrl(created.inviteToken),
      });
    });
  };

  const acceptInbound = (inviteToken: InviteToken): void => {
    void run(async () => {
      const accepted = await acceptChallenge(inviteToken);
      setFlow({ kind: 'MATCH', matchId: accepted.matchId });
    });
  };

  const declineInbound = (inviteToken: InviteToken): void => {
    void run(async () => {
      await declineChallenge(inviteToken);
      setFlow({ kind: 'HOME', notice: 'Challenge declined.' });
    });
  };

  const stopQueue = (): void => {
    void run(async () => {
      await leaveMatchmaking();
      setFlow({ kind: 'HOME' });
    });
  };

  const stopChallenge = (challengeId: ChallengeId): void => {
    void run(async () => {
      await cancelChallenge(challengeId);
      setFlow({ kind: 'HOME', notice: 'Challenge cancelled.' });
    });
  };

  return (
    <main className="shell">
      <section className="play-layout" aria-labelledby="play-title">
        <header className="play-header">
          <div>
            <p className="eyebrow">Frontier table</p>
            <h1 id="play-title">CARAVAN</h1>
          </div>
          <div className="identity-chip">
            <span className="identity-chip__label">Signed in</span>
            <strong>{account.displayName}</strong>
          </div>
        </header>

        {flow.kind === 'HOME' && (
          <section className="panel play-card">
            <p className="section-kicker">Play</p>
            <h2>Choose your route</h2>
            <p className="muted">
              Casual finds the next available opponent. A private challenge creates a single-use match invite.
            </p>
            {flow.notice !== undefined && <p className="notice">{flow.notice}</p>}
            <div className="action-stack">
              <button className="button button--primary" disabled={busy} onClick={joinCasual}>
                Find casual match
              </button>
              <button className="button" disabled={busy} onClick={makeChallenge}>
                Challenge a friend
              </button>
            </div>
            <p className="footnote">Interactive tutorial arrives in its own focused client PR before external testing.</p>
          </section>
        )}

        {flow.kind === 'INBOUND_CHALLENGE' && (
          <section className="panel play-card">
            <p className="section-kicker">Private challenge</p>
            <h2>A rival is waiting</h2>
            <p className="muted">Accepting creates the authoritative match only after your CARAVAN session is verified.</p>
            <div className="action-stack">
              <button className="button button--primary" disabled={busy} onClick={() => acceptInbound(flow.inviteToken)}>
                Accept challenge
              </button>
              <button className="button button--quiet" disabled={busy} onClick={() => declineInbound(flow.inviteToken)}>
                Decline
              </button>
            </div>
          </section>
        )}

        {flow.kind === 'QUEUE' && (
          <section className="panel play-card queue-card" aria-live="polite">
            <div className="route-spinner" aria-hidden="true"><span /><span /><span /></div>
            <p className="section-kicker">Casual matchmaking</p>
            <h2>Looking for a merchant</h2>
            <p className="muted">Your place is held by a renewable server lease. You can safely survive brief network hiccups.</p>
            <button className="button button--quiet" disabled={busy} onClick={stopQueue}>Leave queue</button>
          </section>
        )}

        {flow.kind === 'OUTBOUND_CHALLENGE' && (
          <section className="panel play-card" aria-live="polite">
            <p className="section-kicker">Private challenge</p>
            <h2>Invite ready</h2>
            <p className="muted">Send the link to one opponent. CARAVAN will move you into the match when they accept.</p>
            {opponentCopy === null ? (
              <p className="notice notice--warn">Set VITE_TELEGRAM_BOT_USERNAME to enable Telegram sharing.</p>
            ) : (
              <div className="invite-box">
                <span className="invite-box__label">Telegram invite</span>
                <code>{opponentCopy}</code>
              </div>
            )}
            <div className="action-stack">
              {opponentCopy !== null && (
                <>
                  <button className="button button--primary" onClick={() => platform.shareUrl(opponentCopy, 'Join my CARAVAN match.')}>
                    Share in Telegram
                  </button>
                  <button
                    className="button"
                    onClick={() => void platform.copyText(opponentCopy).then(setCopied)}
                  >
                    {copied ? 'Copied' : 'Copy invite link'}
                  </button>
                </>
              )}
              <button className="button button--quiet" disabled={busy} onClick={() => stopChallenge(flow.challenge.id)}>
                Cancel challenge
              </button>
            </div>
          </section>
        )}

        {flow.kind === 'ERROR' && (
          <section className="panel play-card">
            <p className="section-kicker">Could not continue</p>
            <h2>Route interrupted</h2>
            <p className="muted">{flow.message}</p>
            <button className="button" onClick={() => setFlow({ kind: 'HOME' })}>Back to Play</button>
          </section>
        )}
      </section>
    </main>
  );
}
